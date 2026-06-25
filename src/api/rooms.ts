import {
  get,
  off,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  set,
  update,
} from 'firebase/database';

import {
  BOARD_SPACES_BY_INDEX,
  EVENT_CARDS,
  GAME_BALANCE,
  GAME_LIMITS,
  GLOBAL_EVENT_CARDS,
  PROPERTY_BLUEPRINTS,
} from '@/constants';
import { database } from '@/firebase';
import type { CreatePlayerInput, CreateRoomInput } from '@/schemas';
import type {
  BuiltProperty,
  DiceRoll,
  GameState,
  Player,
  PlayerDebt,
  PlayerFinance,
  PlayerRestriction,
  PlayerTransaction,
  Room,
  RoomSummary,
} from '@/types';
import {
  advanceTurn,
  BANK_LOAN_INTEREST_RATE,
  calculateBankSettlementAmount,
  calculateFederalTaxAudit,
  calculateLoanDebtAmount,
  calculateProjectedBankScore,
  calculateTitleBankSaleValue,
  calculateTitleRent,
  createLapPendings,
  createSpaceActionKey,
  getActivePlayerRestriction,
  getPlayerAdvantageState,
  getTaxPendingPayableAmount,
  hasCurrentSpaceAction,
  didPassStart,
  getActivePlayers,
  getAvailableBlueprintsForPropertySlot,
  getInitialGameState,
  getPlayerSpaceVisitStartedAt,
  isPlayerActionBlocked,
  getTitlePropertySlots,
  hasTitlePropertyActionInCurrentVisit,
  hydrateGameState,
  moveBoardPosition,
  normalizeComparableText,
  normalizePlayerOrder,
} from '@/utils';

const roomsRef = ref(database, 'rooms');

type RoomRecord = Room & {
  players?: Record<string, Player>;
};

function toRoomSummary(room: RoomRecord): RoomSummary {
  return {
    ...room,
    playerCount: Object.keys(room.players ?? {}).length,
  };
}

function toPlayersArray(players?: Record<string, Player>) {
  return Object.values(players ?? {}).sort((current, next) => current.joinedAt - next.joinedAt);
}

function hasSameName(name: string, items: Array<{ name: string }>) {
  const comparableName = normalizeComparableText(name);

  return items.some((item) => normalizeComparableText(item.name) === comparableName);
}

function toFirebaseValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getBlueprint(blueprintKey: string) {
  return PROPERTY_BLUEPRINTS.find((blueprint) => blueprint.key === blueprintKey);
}

function createTransaction(
  input: Omit<PlayerTransaction, 'id' | 'createdAt'> & { createdAt?: number },
) {
  const transactionId = crypto.randomUUID();

  return {
    [transactionId]: {
      id: transactionId,
      ...input,
      createdAt: input.createdAt ?? Date.now(),
    },
  };
}

function appendFinanceTransaction(
  finance: PlayerFinance,
  transaction: Omit<PlayerTransaction, 'id' | 'createdAt'> & { createdAt?: number },
  now: number,
): PlayerFinance {
  return {
    ...finance,
    transactions: {
      ...finance.transactions,
      ...createTransaction({ ...transaction, createdAt: now }),
    },
    updatedAt: now,
  };
}

function createDebt(
  input: Omit<PlayerDebt, 'id' | 'createdAt' | 'updatedAt' | 'status'>,
  now: number,
) {
  const debtId = crypto.randomUUID();

  return {
    id: debtId,
    ...input,
    status: 'active' as const,
    createdAt: now,
    updatedAt: now,
  };
}

function requirePlayerCanAct(game: GameState, playerId: string, message?: string) {
  if (isPlayerActionBlocked(game, playerId)) {
    throw new Error(message ?? 'Jogador travado: libere a penalidade antes de realizar esta acao.');
  }
}

function createRestrictionForSpace(
  game: GameState,
  playerId: string,
  boardIndex: number,
  now: number,
) {
  const boardSpace = BOARD_SPACES_BY_INDEX[boardIndex];

  if (boardSpace?.kind !== 'fiscal-embargo' && boardSpace?.kind !== 'bank-block') {
    return game;
  }

  if (getActivePlayerRestriction(game, playerId)) {
    return game;
  }

  const restrictionId = crypto.randomUUID();
  const restriction: PlayerRestriction = {
    id: restrictionId,
    playerId,
    kind: boardSpace.kind,
    boardIndex,
    startedAtRound: game.round,
    failedAttempts: 0,
    status: 'active',
    createdAt: now,
  };

  return {
    ...game,
    playerRestrictions: {
      ...game.playerRestrictions,
      [restrictionId]: restriction,
    },
  };
}

function releaseRestriction(
  game: GameState,
  restriction: PlayerRestriction,
  reason: NonNullable<PlayerRestriction['releaseReason']>,
  now: number,
) {
  return {
    ...game.playerRestrictions,
    [restriction.id]: {
      ...restriction,
      status: 'released' as const,
      releasedAt: now,
      releaseReason: reason,
    },
  };
}

function updateDebtMirrors(
  game: GameState,
  debt: PlayerDebt,
  nextDebt: PlayerDebt,
  debtorFinance: PlayerFinance,
  creditorFinance?: PlayerFinance,
) {
  return {
    ...game.playerFinances,
    [debt.debtorId]: {
      ...debtorFinance,
      debts: {
        ...debtorFinance.debts,
        [debt.id]: nextDebt,
      },
    },
    ...(debt.creditorId && creditorFinance
      ? {
          [debt.creditorId]: {
            ...creditorFinance,
            receivables: {
              ...creditorFinance.receivables,
              [debt.id]: nextDebt,
            },
          },
        }
      : {}),
  };
}

function createRentPendingForPosition(
  game: GameState,
  playerId: string,
  boardIndex: number,
  now: number,
) {
  const title = game.titles[String(boardIndex)];
  const ownerId = title?.ownerId;

  if (!title || !ownerId || ownerId === playerId) {
    return game;
  }

  const rentAmount = calculateTitleRent(title);

  if (rentAmount <= 0) {
    return game;
  }

  const alreadyPending = Object.values(game.roundPendings ?? {}).some(
    (pending) =>
      pending.status === 'pending' &&
      pending.kind === 'rent' &&
      pending.playerId === playerId &&
      pending.relatedPlayerId === ownerId &&
      pending.boardIndex === boardIndex,
  );

  if (alreadyPending) {
    return game;
  }

  const pendingId = crypto.randomUUID();

  return {
    ...game,
    roundPendings: {
      ...game.roundPendings,
      [pendingId]: {
        id: pendingId,
        playerId,
        relatedPlayerId: ownerId,
        kind: 'rent' as const,
        amount: rentAmount,
        round: game.round,
        boardIndex,
        status: 'pending' as const,
        createdAt: now,
      },
    },
  };
}

function applyRentPayment(
  game: GameState,
  playerId: string,
  ownerId: string,
  boardIndex: number,
  rentAmount: number,
  now: number,
) {
  const debtorFinance = game.playerFinances[playerId];
  const creditorFinance = game.playerFinances[ownerId];

  if (!debtorFinance || !creditorFinance) {
    throw new Error('Financas do aluguel nao encontradas.');
  }

  const paidAmount = Math.min(debtorFinance.balance, rentAmount);
  const pendingAmount = rentAmount - paidAmount;
  let nextDebtorFinance: PlayerFinance = {
    ...debtorFinance,
    balance: debtorFinance.balance - paidAmount,
    updatedAt: now,
  };
  let nextCreditorFinance: PlayerFinance = {
    ...creditorFinance,
    balance: creditorFinance.balance + paidAmount,
    updatedAt: now,
  };

  if (paidAmount > 0) {
    nextDebtorFinance = appendFinanceTransaction(
      nextDebtorFinance,
      {
        kind: 'rent-paid',
        amount: -paidAmount,
        round: game.round,
        description: 'Aluguel pago',
        relatedPlayerId: ownerId,
        boardIndex,
      },
      now,
    );
    nextCreditorFinance = appendFinanceTransaction(
      nextCreditorFinance,
      {
        kind: 'rent-received',
        amount: paidAmount,
        round: game.round,
        description: 'Aluguel recebido',
        relatedPlayerId: playerId,
        boardIndex,
      },
      now,
    );
  }

  if (pendingAmount > 0) {
    const debtId = crypto.randomUUID();
    const debt = createDebt(
      {
        kind: 'rent',
        creditorId: ownerId,
        debtorId: playerId,
        amount: pendingAmount,
        originalAmount: pendingAmount,
        boardIndex,
        description: 'Aluguel pendente da casa ' + boardIndex,
      },
      now,
    );

    nextDebtorFinance = appendFinanceTransaction(
      {
        ...nextDebtorFinance,
        debts: {
          ...nextDebtorFinance.debts,
          [debtId]: debt,
        },
      },
      {
        kind: 'debt-created',
        amount: -pendingAmount,
        round: game.round,
        description: 'Divida criada por aluguel insuficiente',
        relatedPlayerId: ownerId,
        boardIndex,
      },
      now,
    );
    nextCreditorFinance = {
      ...nextCreditorFinance,
      receivables: {
        ...nextCreditorFinance.receivables,
        [debtId]: debt,
      },
    };
  }

  return {
    ...game,
    playerFinances: {
      ...game.playerFinances,
      [playerId]: nextDebtorFinance,
      [ownerId]: nextCreditorFinance,
    },
  };
}

function createEventPendingForPosition(
  game: GameState,
  playerId: string,
  boardIndex: number,
  players: Player[],
  now: number,
) {
  const boardSpace = BOARD_SPACES_BY_INDEX[boardIndex];
  const cards = boardSpace?.kind === 'global-event' ? GLOBAL_EVENT_CARDS : EVENT_CARDS;

  if (boardSpace?.kind !== 'event' && boardSpace?.kind !== 'global-event') {
    return game;
  }

  const card = cards[Math.abs(now + boardIndex + game.round) % cards.length];
  const pendingId = crypto.randomUUID();
  const isGlobal = boardSpace.kind === 'global-event';

  return {
    ...game,
    roundPendings: {
      ...game.roundPendings,
      [pendingId]: {
        id: pendingId,
        playerId,
        affectedPlayerIds: isGlobal
          ? players.filter((player) => player.status !== 'eliminated').map((player) => player.id)
          : [playerId],
        kind: boardSpace.kind,
        amount: card.amount,
        round: game.round,
        boardIndex,
        message: card.message,
        eventTone: card.tone,
        status: 'pending' as const,
        createdAt: now,
      },
    },
  };
}

function applyEventPending(game: GameState, pendingId: string, now: number) {
  const pending = game.roundPendings[pendingId];

  if (!pending?.eventTone) {
    throw new Error('Evento nao encontrado.');
  }

  const affectedPlayerIds = pending.affectedPlayerIds?.length
    ? pending.affectedPlayerIds
    : [pending.playerId];
  const signedAmount = pending.eventTone === 'luck' ? pending.amount : -pending.amount;
  const nextFinances = { ...game.playerFinances };

  affectedPlayerIds.forEach((affectedPlayerId) => {
    const finance = nextFinances[affectedPlayerId];

    if (!finance) return;

    nextFinances[affectedPlayerId] = appendFinanceTransaction(
      {
        ...finance,
        balance: Math.max(0, finance.balance + signedAmount),
        updatedAt: now,
      },
      {
        kind: 'event',
        amount: signedAmount,
        round: game.round,
        description: pending.message ?? 'Evento',
        boardIndex: pending.boardIndex,
      },
      now,
    );
  });

  return {
    ...game,
    playerFinances: nextFinances,
  };
}

export async function createRoom(input: CreateRoomInput) {
  const activeRooms = await listActiveRooms();

  if (hasSameName(input.name, activeRooms)) {
    throw new Error('Ja existe uma sala ativa com esse nome.');
  }

  const roomRef = push(roomsRef);
  const now = Date.now();

  const room: Room = {
    id: roomRef.key ?? crypto.randomUUID(),
    name: input.name.trim(),
    ownerId: '',
    status: 'waiting',
    maxPlayers: GAME_LIMITS.maxPlayers,
    createdAt: now,
    updatedAt: now,
  };

  await set(roomRef, room);

  return room;
}

export async function getRoom(roomId: string) {
  const snapshot = await get(ref(database, `rooms/${roomId}`));

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.val() as RoomRecord;
}

export async function listActiveRooms() {
  const snapshot = await get(roomsRef);

  if (!snapshot.exists()) {
    return [];
  }

  return Object.values(snapshot.val() as Record<string, RoomRecord>)
    .filter((room) => room.status !== 'finished')
    .map(toRoomSummary);
}

export function subscribeToActiveRooms(onChange: (rooms: RoomSummary[]) => void) {
  onValue(roomsRef, (snapshot) => {
    if (!snapshot.exists()) {
      onChange([]);
      return;
    }

    const rooms = Object.values(snapshot.val() as Record<string, RoomRecord>)
      .filter((room) => room.status !== 'finished')
      .map(toRoomSummary)
      .sort((current, next) => next.createdAt - current.createdAt);

    onChange(rooms);
  });

  return () => off(roomsRef);
}

export function subscribeToRoom(
  roomId: string,
  onChange: (room: Room | null, players: Player[]) => void,
) {
  const roomRef = ref(database, `rooms/${roomId}`);

  onValue(roomRef, (snapshot) => {
    if (!snapshot.exists()) {
      onChange(null, []);
      return;
    }

    const { players, ...room } = snapshot.val() as RoomRecord;

    onChange(room, toPlayersArray(players));
  });

  return () => off(roomRef);
}

export async function addPlayerToRoom(roomId: string, input: CreatePlayerInput) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  if (players.length >= GAME_LIMITS.maxPlayers) {
    throw new Error('A sala atingiu o limite de jogadores.');
  }

  if (hasSameName(input.name, players)) {
    throw new Error('Ja existe um jogador com esse nome nesta sala.');
  }

  if (
    players.some((player) => player.status !== 'eliminated' && player.colorKey === input.colorKey)
  ) {
    throw new Error('Essa cor ja foi escolhida por outro jogador.');
  }

  const playerRef = push(ref(database, `rooms/${roomId}/players`));
  const player: Player = {
    id: playerRef.key ?? crypto.randomUUID(),
    name: input.name.trim(),
    photoKey: input.photoKey,
    role: players.length === 0 ? 'banqueiro' : 'jogador',
    colorKey: input.colorKey,
    joinedAt: Date.now(),
  };

  await set(playerRef, player);

  if (!room.ownerId) {
    await updateRoom(roomId, { ownerId: player.id });
  }

  if (room.game) {
    const nextGame = hydrateGameState(room.game, [...players, player]);

    await update(ref(database, `rooms/${roomId}/game`), {
      ...toFirebaseValue(nextGame),
      updatedAt: Date.now(),
    });
  }

  return player;
}

export async function updateRoom(roomId: string, room: Partial<Room>) {
  return update(ref(database, `rooms/${roomId}`), {
    ...room,
    updatedAt: Date.now(),
  });
}

export async function renameRoom(roomId: string, name: string) {
  const trimmedName = name.trim();

  if (trimmedName.length < 3) {
    throw new Error('O nome da sala deve ter pelo menos 3 caracteres.');
  }

  const activeRooms = await listActiveRooms();
  const duplicateRoom = activeRooms.find(
    (room) =>
      room.id !== roomId &&
      normalizeComparableText(room.name) === normalizeComparableText(trimmedName),
  );

  if (duplicateRoom) {
    throw new Error('Ja existe uma sala ativa com esse nome.');
  }

  return updateRoom(roomId, { name: trimmedName });
}

export async function deleteRoom(roomId: string) {
  return remove(ref(database, `rooms/${roomId}`));
}

export async function startGame(roomId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const activePlayers = getActivePlayers(players);

  if (activePlayers.length === 0) {
    throw new Error('Adicione jogadores ativos antes de iniciar a partida.');
  }

  const now = Date.now();
  const currentGame = hydrateGameState(room.game, players);
  const playerOrder = normalizePlayerOrder(players, currentGame.playerOrder);
  const game: GameState = {
    ...currentGame,
    status: 'playing',
    playerOrder,
    turnPlayerId:
      currentGame.turnPlayerId && playerOrder.includes(currentGame.turnPlayerId)
        ? currentGame.turnPlayerId
        : (playerOrder[0] ?? null),
    turnStartedAt: now,
    startedAt: currentGame.startedAt ?? now,
    pausedAt: undefined,
    finishedAt: undefined,
    updatedAt: now,
  };

  return update(ref(database, `rooms/${roomId}`), {
    status: 'playing',
    game: toFirebaseValue(game),
    updatedAt: now,
  });
}

export async function pauseGame(roomId: string) {
  const now = Date.now();

  return update(ref(database, `rooms/${roomId}`), {
    'game/status': 'paused',
    'game/pausedAt': now,
    'game/updatedAt': now,
    updatedAt: now,
  });
}

export async function finishGame(roomId: string) {
  const now = Date.now();

  return update(ref(database, `rooms/${roomId}`), {
    status: 'finished',
    'game/status': 'finished',
    'game/finishedAt': now,
    'game/updatedAt': now,
    updatedAt: now,
  });
}

export async function resetGame(roomId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const now = Date.now();
  const game = {
    ...getInitialGameState(toPlayersArray(room.players), now),
    updatedAt: now,
  };

  return update(ref(database, `rooms/${roomId}`), {
    status: 'waiting',
    game: toFirebaseValue(game),
    updatedAt: now,
  });
}

export async function reorderPlayers(roomId: string, playerOrder: string[]) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const currentGame = hydrateGameState(room.game, players);
  const nextPlayerOrder = normalizePlayerOrder(players, playerOrder);
  const nextTurnPlayerId =
    currentGame.turnPlayerId && nextPlayerOrder.includes(currentGame.turnPlayerId)
      ? currentGame.turnPlayerId
      : (nextPlayerOrder[0] ?? null);

  return update(ref(database, `rooms/${roomId}/game`), {
    ...toFirebaseValue(currentGame),
    playerOrder: nextPlayerOrder,
    turnPlayerId: nextTurnPlayerId,
    updatedAt: Date.now(),
  });
}

export async function eliminatePlayer(roomId: string, playerId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const currentGame = hydrateGameState(room.game, players);
  const nextPlayers = players.map((player) =>
    player.id === playerId ? { ...player, status: 'eliminated' as const } : player,
  );
  const playerOrder = normalizePlayerOrder(nextPlayers, currentGame.playerOrder);
  const titles = Object.fromEntries(
    Object.entries(currentGame.titles ?? {}).map(([key, title]) => [
      key,
      title.ownerId === playerId ? { ...title, ownerId: null, properties: [] } : title,
    ]),
  );
  const nextTurnPlayerId =
    currentGame.turnPlayerId === playerId
      ? (playerOrder[0] ?? null)
      : currentGame.turnPlayerId && playerOrder.includes(currentGame.turnPlayerId)
        ? currentGame.turnPlayerId
        : (playerOrder[0] ?? null);
  const now = Date.now();

  return update(ref(database, `rooms/${roomId}`), {
    [`players/${playerId}/status`]: 'eliminated',
    'game/playerOrder': playerOrder,
    'game/turnPlayerId': nextTurnPlayerId,
    'game/titles': titles,
    'game/updatedAt': now,
    updatedAt: now,
  });
}

export async function applyBankBalanceAction(
  roomId: string,
  playerId: string,
  input: { action: 'add' | 'subtract'; amount: number; reason: string },
) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const targetPlayer = players.find((player) => player.id === playerId);
  const amount = Number(input.amount);
  const reason = input.reason.trim();

  if (!targetPlayer || targetPlayer.status === 'eliminated') {
    throw new Error('Selecione um jogador ativo.');
  }

  if (!reason) {
    throw new Error('Informe o motivo da acao do banco.');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Informe um valor maior que zero.');
  }

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const playerFinance = game.playerFinances[playerId];

    if (!playerFinance) {
      throw new Error('Financas do jogador nao encontradas.');
    }

    const signedAmount = input.action === 'add' ? amount : -amount;
    const nextBalance = playerFinance.balance + signedAmount;

    if (nextBalance < 0) {
      throw new Error('Saldo insuficiente para subtrair este valor.');
    }

    const nextFinance = appendFinanceTransaction(
      {
        ...playerFinance,
        balance: nextBalance,
      },
      {
        kind: input.action === 'add' ? 'bank-credit' : 'bank-debit',
        amount: signedAmount,
        round: game.round,
        description: reason,
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      playerFinances: {
        ...game.playerFinances,
        [playerId]: nextFinance,
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), {
    updatedAt: Date.now(),
  });
}

export async function requestBankLoan(roomId: string, playerId: string, amount: number) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const loanAmount = Number(amount);

  if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
    throw new Error('Informe um valor de emprestimo valido.');
  }

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const finance = game.playerFinances[playerId];

    requirePlayerCanAct(game, playerId, 'Jogador travado nao pode solicitar emprestimos.');

    if (!finance) {
      throw new Error('Financas do jogador nao encontradas.');
    }

    const totalDebtAmount = calculateLoanDebtAmount(loanAmount);
    const projectedScore = calculateProjectedBankScore(game, playerId, totalDebtAmount);

    if (projectedScore <= 0) {
      throw new Error('Emprestimo bloqueado: este valor levaria o jogador a falencia.');
    }

    const debt = createDebt(
      {
        kind: 'bank',
        creditorId: null,
        debtorId: playerId,
        amount: totalDebtAmount,
        originalAmount: totalDebtAmount,
        interestRate: BANK_LOAN_INTEREST_RATE,
        createdAtRound: game.round,
        description: 'Emprestimo bancario',
      },
      now,
    );
    const loanId = crypto.randomUUID();
    const nextFinance = appendFinanceTransaction(
      {
        ...finance,
        balance: finance.balance + loanAmount,
        debts: {
          ...finance.debts,
          [debt.id]: debt,
        },
      },
      {
        kind: 'bank-loan',
        amount: loanAmount,
        round: game.round,
        description: 'Emprestimo bancario recebido',
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      bankLoans: {
        ...game.bankLoans,
        [loanId]: {
          id: loanId,
          playerId,
          debtId: debt.id,
          principal: loanAmount,
          interestRate: BANK_LOAN_INTEREST_RATE,
          status: 'active',
          createdAtRound: game.round,
          createdAt: now,
        },
      },
      playerFinances: {
        ...game.playerFinances,
        [playerId]: nextFinance,
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function payDebt(roomId: string, playerId: string, debtId: string, amount: number) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const paymentAmount = Number(amount);

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error('Informe um valor de pagamento valido.');
  }

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const debtorFinance = game.playerFinances[playerId];
    const debt = debtorFinance?.debts?.[debtId];

    requirePlayerCanAct(game, playerId, 'Jogador travado nao pode pagar dividas.');

    if (!debtorFinance || !debt || debt.status !== 'active') {
      throw new Error('Divida ativa nao encontrada.');
    }

    const paidAmount = Math.min(paymentAmount, debt.amount);

    if (debtorFinance.balance < paidAmount) {
      throw new Error('Saldo insuficiente para pagar esta divida.');
    }

    const nextDebt: PlayerDebt = {
      ...debt,
      amount: debt.amount - paidAmount,
      status: debt.amount - paidAmount <= 0 ? 'paid' : 'active',
      updatedAt: now,
    };
    let nextDebtorFinance = appendFinanceTransaction(
      {
        ...debtorFinance,
        balance: debtorFinance.balance - paidAmount,
        updatedAt: now,
      },
      {
        kind: 'debt-payment',
        amount: -paidAmount,
        round: game.round,
        description: `Pagamento de divida: ${debt.description}`,
        relatedPlayerId: debt.creditorId ?? undefined,
        boardIndex: debt.boardIndex,
      },
      now,
    );
    let nextCreditorFinance = debt.creditorId ? game.playerFinances[debt.creditorId] : undefined;

    if (nextCreditorFinance) {
      nextCreditorFinance = appendFinanceTransaction(
        {
          ...nextCreditorFinance,
          balance: nextCreditorFinance.balance + paidAmount,
          updatedAt: now,
        },
        {
          kind: 'debt-received',
          amount: paidAmount,
          round: game.round,
          description: `Recebimento de divida: ${debt.description}`,
          relatedPlayerId: playerId,
          boardIndex: debt.boardIndex,
        },
        now,
      );
    }

    nextDebtorFinance = {
      ...nextDebtorFinance,
      debts: {
        ...nextDebtorFinance.debts,
        [debt.id]: nextDebt,
      },
    };

    const playerFinances = updateDebtMirrors(
      game,
      debt,
      nextDebt,
      nextDebtorFinance,
      nextCreditorFinance,
    );
    const bankLoans = Object.fromEntries(
      Object.entries(game.bankLoans).map(([key, loan]) => [
        key,
        loan.debtId === debt.id && nextDebt.status === 'paid'
          ? { ...loan, status: 'paid' as const, paidAt: now }
          : loan,
      ]),
    );

    return toFirebaseValue({
      ...game,
      bankLoans,
      playerFinances,
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function forgiveReceivable(roomId: string, creditorId: string, debtId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const creditorFinance = game.playerFinances[creditorId];
    const receivable = creditorFinance?.receivables?.[debtId];

    if (!creditorFinance || !receivable || receivable.status !== 'active') {
      throw new Error('Divida a receber nao encontrada.');
    }

    const debtorFinance = game.playerFinances[receivable.debtorId];

    if (!debtorFinance) {
      throw new Error('Devedor nao encontrado.');
    }

    const nextDebt: PlayerDebt = {
      ...receivable,
      amount: 0,
      status: 'forgiven',
      updatedAt: now,
    };
    const nextCreditorFinance = appendFinanceTransaction(
      {
        ...creditorFinance,
        updatedAt: now,
      },
      {
        kind: 'debt-forgiven',
        amount: -receivable.amount,
        round: game.round,
        description: `Perdao de divida: ${receivable.description}`,
        relatedPlayerId: receivable.debtorId,
        boardIndex: receivable.boardIndex,
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      playerFinances: updateDebtMirrors(
        game,
        receivable,
        nextDebt,
        debtorFinance,
        nextCreditorFinance,
      ),
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function payTaxPending(roomId: string, playerId: string, taxPendingId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const finance = game.playerFinances[playerId];
    const taxPending = game.taxPendings[taxPendingId];

    if (
      !finance ||
      !taxPending ||
      taxPending.playerId !== playerId ||
      taxPending.status !== 'pending'
    ) {
      throw new Error('Imposto pendente nao encontrado.');
    }

    requirePlayerCanAct(game, playerId, 'Jogador travado nao pode pagar impostos.');

    const amount = getTaxPendingPayableAmount(game, playerId, taxPending);

    if (finance.balance < amount) {
      throw new Error('Saldo insuficiente para pagar este imposto.');
    }

    const nextFinance = appendFinanceTransaction(
      {
        ...finance,
        balance: finance.balance - amount,
      },
      {
        kind: 'tax-payment',
        amount: -amount,
        round: game.round,
        description: `Pagamento de imposto: ${taxPending.titleName}`,
        boardIndex: taxPending.boardIndex,
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      taxPendings: {
        ...game.taxPendings,
        [taxPendingId]: {
          ...taxPending,
          status: 'paid',
          paidAt: now,
        },
      },
      playerFinances: {
        ...game.playerFinances,
        [playerId]: nextFinance,
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function applyFederalTaxAudit(roomId: string, playerId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const boardIndex = game.positions[playerId] ?? 1;
    const boardSpace = BOARD_SPACES_BY_INDEX[boardIndex];
    const finance = game.playerFinances[playerId];

    if (game.status !== 'playing' || game.turnPlayerId !== playerId) {
      throw new Error('A Receita Federal so pode ser confirmada na sua vez.');
    }

    if (boardSpace?.kind !== 'tax') {
      throw new Error('Voce precisa estar na casa Receita Federal.');
    }

    if (!finance) {
      throw new Error('Financas do jogador nao encontradas.');
    }

    if (hasCurrentSpaceAction(game, playerId, boardIndex, 'federal-tax-audit')) {
      throw new Error('A conferencia da Receita Federal ja foi feita nesta jogada.');
    }

    const audit = calculateFederalTaxAudit(game, playerId);
    const actionKey = createSpaceActionKey(
      playerId,
      boardIndex,
      'federal-tax-audit',
      game.turnStartedAt,
    );
    let nextFinance: PlayerFinance = finance;

    if (audit.pendingTaxTotal <= 0) {
      nextFinance = appendFinanceTransaction(
        {
          ...finance,
          balance: finance.balance + audit.refundAmount,
        },
        {
          kind: 'tax-refund',
          amount: audit.refundAmount,
          round: game.round,
          description: 'Restituicao do imposto de renda',
          boardIndex,
        },
        now,
      );
    } else {
      const paidAmount = Math.min(finance.balance, audit.fineAmount);
      const activeDebtAmount = audit.fineAmount - paidAmount;

      if (paidAmount > 0) {
        nextFinance = appendFinanceTransaction(
          {
            ...nextFinance,
            balance: nextFinance.balance - paidAmount,
          },
          {
            kind: 'tax-payment',
            amount: -paidAmount,
            round: game.round,
            description: 'Multa da Receita Federal',
            boardIndex,
          },
          now,
        );
      }

      if (activeDebtAmount > 0) {
        const debt = createDebt(
          {
            kind: 'tax',
            creditorId: null,
            debtorId: playerId,
            amount: activeDebtAmount,
            originalAmount: activeDebtAmount,
            createdAtRound: game.round,
            description: 'Malha fina - multa da Receita Federal',
            boardIndex,
          },
          now,
        );

        nextFinance = appendFinanceTransaction(
          {
            ...nextFinance,
            debts: {
              ...nextFinance.debts,
              [debt.id]: debt,
            },
          },
          {
            kind: 'debt-created',
            amount: -activeDebtAmount,
            round: game.round,
            description: 'Divida ativa de Malha fina',
            boardIndex,
          },
          now,
        );
      }
    }

    return toFirebaseValue({
      ...game,
      playerFinances: {
        ...game.playerFinances,
        [playerId]: nextFinance,
      },
      spaceActions: {
        ...game.spaceActions,
        [actionKey]: {
          id: actionKey,
          playerId,
          boardIndex,
          action: 'federal-tax-audit',
          turnStartedAt: game.turnStartedAt,
          round: game.round,
          createdAt: now,
        },
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

function isBankSettlementDebtEligible(debt: PlayerDebt) {
  return debt.status === 'active' && debt.kind !== 'player-loan' && debt.creditorId === null;
}

export async function payDebtWithBankDiscount(roomId: string, playerId: string, debtId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const boardIndex = game.positions[playerId] ?? 1;
    const debtorFinance = game.playerFinances[playerId];
    const debt = debtorFinance?.debts?.[debtId];

    if (game.status !== 'playing' || game.turnPlayerId !== playerId) {
      throw new Error('Acertos do Banco so ficam disponiveis na sua vez.');
    }

    if (BOARD_SPACES_BY_INDEX[boardIndex]?.kind !== 'bank') {
      throw new Error('Voce precisa estar na casa Banco para usar o desconto.');
    }

    if (!debtorFinance || !debt || !isBankSettlementDebtEligible(debt)) {
      throw new Error('Divida elegivel nao encontrada.');
    }

    requirePlayerCanAct(game, playerId, 'Jogador travado nao pode fazer acertos no Banco.');

    const paidAmount = calculateBankSettlementAmount(debt.amount);

    if (debtorFinance.balance < paidAmount) {
      throw new Error('Saldo insuficiente para quitar esta divida com desconto.');
    }

    const nextDebt: PlayerDebt = {
      ...debt,
      amount: 0,
      status: 'paid',
      updatedAt: now,
    };
    const nextDebtorFinance = appendFinanceTransaction(
      {
        ...debtorFinance,
        balance: debtorFinance.balance - paidAmount,
        debts: {
          ...debtorFinance.debts,
          [debt.id]: nextDebt,
        },
      },
      {
        kind: 'debt-payment',
        amount: -paidAmount,
        round: game.round,
        description: `Acerto com desconto: ${debt.description}`,
        boardIndex: debt.boardIndex ?? boardIndex,
      },
      now,
    );
    const bankLoans = Object.fromEntries(
      Object.entries(game.bankLoans).map(([key, loan]) => [
        key,
        loan.debtId === debt.id ? { ...loan, status: 'paid' as const, paidAt: now } : loan,
      ]),
    );

    return toFirebaseValue({
      ...game,
      bankLoans,
      playerFinances: updateDebtMirrors(game, debt, nextDebt, nextDebtorFinance),
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function payTaxPendingWithBankDiscount(
  roomId: string,
  playerId: string,
  taxPendingId: string,
) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const boardIndex = game.positions[playerId] ?? 1;
    const finance = game.playerFinances[playerId];
    const taxPending = game.taxPendings[taxPendingId];

    if (game.status !== 'playing' || game.turnPlayerId !== playerId) {
      throw new Error('Acertos do Banco so ficam disponiveis na sua vez.');
    }

    if (BOARD_SPACES_BY_INDEX[boardIndex]?.kind !== 'bank') {
      throw new Error('Voce precisa estar na casa Banco para usar o desconto.');
    }

    if (
      !finance ||
      !taxPending ||
      taxPending.playerId !== playerId ||
      taxPending.status !== 'pending'
    ) {
      throw new Error('Imposto pendente nao encontrado.');
    }

    requirePlayerCanAct(game, playerId, 'Jogador travado nao pode fazer acertos no Banco.');

    const amount = calculateBankSettlementAmount(taxPending.amount);

    if (finance.balance < amount) {
      throw new Error('Saldo insuficiente para pagar este imposto com desconto.');
    }

    const nextFinance = appendFinanceTransaction(
      {
        ...finance,
        balance: finance.balance - amount,
      },
      {
        kind: 'tax-payment',
        amount: -amount,
        round: game.round,
        description: `Acerto com desconto: ${taxPending.titleName}`,
        boardIndex: taxPending.boardIndex,
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      taxPendings: {
        ...game.taxPendings,
        [taxPendingId]: {
          ...taxPending,
          status: 'paid',
          paidAt: now,
        },
      },
      playerFinances: {
        ...game.playerFinances,
        [playerId]: nextFinance,
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}
export async function confirmRoundPending(roomId: string, playerId: string, pendingId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const pending = game.roundPendings[pendingId];
    const finance = game.playerFinances[playerId];

    if (!finance || !pending || pending.playerId !== playerId || pending.status !== 'pending') {
      throw new Error('Pendencia de rodada nao encontrada.');
    }

    if (pending.kind === 'rent') {
      if (!pending.relatedPlayerId || !pending.boardIndex) {
        throw new Error('Pendencia de aluguel invalida.');
      }

      requirePlayerCanAct(game, playerId, 'Jogador travado nao pode pagar aluguel.');

      const gameWithRent = applyRentPayment(
        game,
        playerId,
        pending.relatedPlayerId,
        pending.boardIndex,
        pending.amount,
        now,
      );

      return toFirebaseValue({
        ...gameWithRent,
        roundPendings: {
          ...gameWithRent.roundPendings,
          [pendingId]: {
            ...pending,
            status: 'confirmed',
            confirmedAt: now,
          },
        },
        updatedAt: now,
      });
    }

    if (pending.kind === 'rent-waived-notice') {
      return toFirebaseValue({
        ...game,
        roundPendings: {
          ...game.roundPendings,
          [pendingId]: {
            ...pending,
            status: 'confirmed',
            confirmedAt: now,
          },
        },
        updatedAt: now,
      });
    }

    if (pending.kind === 'event' || pending.kind === 'global-event') {
      const gameWithEvent = applyEventPending(game, pendingId, now);

      return toFirebaseValue({
        ...gameWithEvent,
        roundPendings: {
          ...gameWithEvent.roundPendings,
          [pendingId]: {
            ...pending,
            status: 'confirmed',
            confirmedAt: now,
          },
        },
        updatedAt: now,
      });
    }

    if (pending.kind !== 'statement') {
      throw new Error('Pendencia de rodada antiga nao e mais suportada.');
    }

    const breakdown = pending.breakdown ?? {
      receivables: 0,
      maintenance: 0,
      taxes: 0,
      netAmount: 0,
    };
    const netAmount = breakdown.netAmount;

    if (netAmount < 0) {
      requirePlayerCanAct(
        game,
        playerId,
        'Jogador travado nao pode confirmar acertos de contas negativos.',
      );
    }

    let nextFinance = appendFinanceTransaction(
      {
        ...finance,
        balance:
          netAmount >= 0 ? finance.balance + netAmount : Math.max(0, finance.balance + netAmount),
      },
      {
        kind: 'round-statement',
        amount: netAmount,
        round: game.round,
        description: 'Prestacao de contas da rodada',
      },
      now,
    );

    if (netAmount < 0 && finance.balance + netAmount < 0) {
      const debtAmount = Math.abs(finance.balance + netAmount);
      const debt = createDebt(
        {
          kind: 'round-fees',
          creditorId: null,
          debtorId: playerId,
          amount: debtAmount,
          originalAmount: debtAmount,
          createdAtRound: game.round,
          sourceId: pending.id,
          description: 'Taxas de rodada',
        },
        now,
      );

      nextFinance = appendFinanceTransaction(
        {
          ...nextFinance,
          debts: {
            ...nextFinance.debts,
            [debt.id]: debt,
          },
        },
        {
          kind: 'debt-created',
          amount: -debtAmount,
          round: game.round,
          description: 'Divida criada por taxas de rodada insuficientes',
        },
        now,
      );
    }

    const currentAdvantageState = getPlayerAdvantageState(game, playerId);
    const shouldConsumeTaxReduction =
      Boolean(breakdown.taxReductionAdvantageId) &&
      currentAdvantageState.taxReduction?.id === breakdown.taxReductionAdvantageId;
    const nextAdvantageState = shouldConsumeTaxReduction
      ? {
          ...currentAdvantageState,
          taxReduction: currentAdvantageState.taxReduction
            ? {
                ...currentAdvantageState.taxReduction,
                remainingPasses: Math.max(
                  0,
                  currentAdvantageState.taxReduction.remainingPasses - 1,
                ),
              }
            : undefined,
        }
      : currentAdvantageState;

    return toFirebaseValue({
      ...game,
      playerAdvantages: {
        ...game.playerAdvantages,
        [playerId]: nextAdvantageState,
      },
      roundPendings: {
        ...game.roundPendings,
        [pendingId]: {
          ...pending,
          status: 'confirmed',
          confirmedAt: now,
        },
      },
      playerFinances: {
        ...game.playerFinances,
        [playerId]: nextFinance,
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function buyTitle(roomId: string, playerId: string, boardIndex: number) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const boardSpace = BOARD_SPACES_BY_INDEX[boardIndex];
  const landValue = boardSpace?.landValue ?? 0;

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const titleKey = String(boardIndex);
    const currentTitle = game.titles[titleKey];
    const playerFinance = game.playerFinances[playerId];
    const propertyActionVisitStartedAt = getPlayerSpaceVisitStartedAt(game, playerId);

    requirePlayerCanAct(game, playerId, 'Jogador travado nao pode comprar titulos.');

    if (boardSpace?.kind !== 'street') {
      throw new Error('Esta casa nao possui titulo para compra.');
    }

    if (landValue <= 0) {
      throw new Error('Este titulo ainda nao possui valor definido.');
    }

    if (currentTitle?.ownerId) {
      throw new Error('Este titulo ja possui dono.');
    }

    if (!playerFinance) {
      throw new Error('Financas do jogador nao encontradas.');
    }

    if (game.turnPlayerId !== playerId || game.positions[playerId] !== boardIndex) {
      throw new Error('Compra disponivel apenas na sua vez e na casa atual.');
    }

    if (hasTitlePropertyActionInCurrentVisit(game, currentTitle, playerId)) {
      throw new Error('Este titulo ja teve uma acao de propriedade nesta visita.');
    }

    if (playerFinance.balance < landValue) {
      throw new Error('Saldo insuficiente para comprar este titulo.');
    }

    const nextFinance = appendFinanceTransaction(
      {
        ...playerFinance,
        balance: playerFinance.balance - landValue,
      },
      {
        kind: 'title-purchase',
        amount: -landValue,
        round: game.round,
        description: `Compra de titulo: ${boardSpace.streetName ?? boardSpace.name}`,
        boardIndex,
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      titles: {
        ...game.titles,
        [titleKey]: {
          boardIndex,
          ownerId: playerId,
          acquiredAtRound: game.round,
          properties: [],
          lastPropertyPurchaseRound: game.round,
          lastPropertyActionRound: game.round,
          lastPropertyActionTurnStartedAt: game.turnStartedAt,
          lastPropertyActionVisitStartedAt: propertyActionVisitStartedAt,
        },
      },
      playerFinances: {
        ...game.playerFinances,
        [playerId]: nextFinance,
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), {
    updatedAt: Date.now(),
  });
}

export async function buildTitleProperty(
  roomId: string,
  playerId: string,
  boardIndex: number,
  blueprintKey: string,
  slotIndex: number,
  optionName?: string,
) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const boardSpace = BOARD_SPACES_BY_INDEX[boardIndex];
  const blueprint = getBlueprint(blueprintKey);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const titleKey = String(boardIndex);
    const title = game.titles[titleKey];
    const playerFinance = game.playerFinances[playerId];
    const properties = title?.properties ?? [];
    const propertySlots = boardSpace?.propertySlots ?? GAME_BALANCE.board.defaultPropertySlots;
    const slots = getTitlePropertySlots(properties, propertySlots);
    const currentSlotProperty = slots[slotIndex];
    const currentSlotBlueprint = currentSlotProperty
      ? getBlueprint(currentSlotProperty.blueprintKey)
      : undefined;
    const propertyActionVisitStartedAt = getPlayerSpaceVisitStartedAt(game, playerId);

    requirePlayerCanAct(game, playerId, 'Jogador travado nao pode construir propriedades.');

    if (boardSpace?.kind !== 'street') {
      throw new Error('Esta casa nao permite construcao.');
    }

    if (!title || title.ownerId !== playerId) {
      throw new Error('Apenas o dono do titulo pode construir aqui.');
    }

    if (!blueprint) {
      throw new Error('Propriedade selecionada nao encontrada.');
    }

    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= propertySlots) {
      throw new Error('Slot de propriedade invalido.');
    }

    if (title.acquiredAtRound === game.round) {
      throw new Error('Construcao disponivel apenas a partir da proxima rodada.');
    }

    if (game.turnPlayerId !== playerId || game.positions[playerId] !== boardIndex) {
      throw new Error('Acoes de propriedade so podem ser feitas na sua vez e na casa atual.');
    }

    if (hasTitlePropertyActionInCurrentVisit(game, title, playerId)) {
      throw new Error('Este titulo ja teve uma acao de propriedade nesta visita.');
    }

    if (currentSlotBlueprint?.category === 'business') {
      throw new Error('Empreendimentos nao possuem evolucao. Destrua para trocar.');
    }

    if (blueprint.category === 'business' && currentSlotProperty) {
      throw new Error('Empreendimentos so podem ser construidos em slots vazios.');
    }

    const availableBlueprints = getAvailableBlueprintsForPropertySlot(currentSlotProperty);

    if (!availableBlueprints.some((item) => item.key === blueprint.key)) {
      throw new Error('Propriedade indisponivel para este slot.');
    }

    if (!playerFinance) {
      throw new Error('Financas do jogador nao encontradas.');
    }

    if (playerFinance.balance < blueprint.constructionCost) {
      throw new Error('Saldo insuficiente para construir esta propriedade.');
    }

    const builtProperty: BuiltProperty = {
      id: crypto.randomUUID(),
      blueprintKey: blueprint.key,
      category: blueprint.category,
      slotIndex,
      constructionCost: blueprint.constructionCost,
      acquiredAtRound: game.round,
      acquiredAt: now,
      ...(optionName ? { optionName } : {}),
    };
    const nextProperties = currentSlotProperty
      ? properties.map((property) =>
          property.id === currentSlotProperty.id ? builtProperty : property,
        )
      : [...properties, builtProperty];
    const nextFinance = appendFinanceTransaction(
      {
        ...playerFinance,
        balance: playerFinance.balance - blueprint.constructionCost,
      },
      {
        kind: 'property-build',
        amount: -blueprint.constructionCost,
        round: game.round,
        description: `Construcao: ${optionName ?? blueprint.name}`,
        boardIndex,
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      titles: {
        ...game.titles,
        [titleKey]: {
          ...title,
          properties: nextProperties,
          lastPropertyPurchaseRound: game.round,
          lastPropertyActionRound: game.round,
          lastPropertyActionTurnStartedAt: game.turnStartedAt,
          lastPropertyActionVisitStartedAt: propertyActionVisitStartedAt,
        },
      },
      playerFinances: {
        ...game.playerFinances,
        [playerId]: nextFinance,
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), {
    updatedAt: Date.now(),
  });
}

export async function destroyTitleProperty(
  roomId: string,
  playerId: string,
  boardIndex: number,
  propertyId: string,
) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const boardSpace = BOARD_SPACES_BY_INDEX[boardIndex];

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const titleKey = String(boardIndex);
    const title = game.titles[titleKey];
    const playerFinance = game.playerFinances[playerId];
    const properties = title?.properties ?? [];
    const property = properties.find((item) => item.id === propertyId);
    const blueprint = property ? getBlueprint(property.blueprintKey) : undefined;
    const propertyActionVisitStartedAt = getPlayerSpaceVisitStartedAt(game, playerId);

    requirePlayerCanAct(game, playerId, 'Jogador travado nao pode destruir propriedades.');

    if (boardSpace?.kind !== 'street') {
      throw new Error('Esta casa nao possui propriedades.');
    }

    if (!title || title.ownerId !== playerId) {
      throw new Error('Apenas o dono do titulo pode destruir propriedades aqui.');
    }

    if (!property) {
      throw new Error('Propriedade nao encontrada.');
    }

    if (title.acquiredAtRound === game.round) {
      throw new Error('Destruicao disponivel apenas a partir da proxima rodada.');
    }

    if (game.turnPlayerId !== playerId || game.positions[playerId] !== boardIndex) {
      throw new Error('Acoes de propriedade so podem ser feitas na sua vez e na casa atual.');
    }

    if (hasTitlePropertyActionInCurrentVisit(game, title, playerId)) {
      throw new Error('Este titulo ja teve uma acao de propriedade nesta visita.');
    }

    if (!playerFinance) {
      throw new Error('Financas do jogador nao encontradas.');
    }

    const nextFinance = appendFinanceTransaction(
      playerFinance,
      {
        kind: 'property-destroy',
        amount: 0,
        round: game.round,
        description: `Destruicao: ${property.optionName ?? blueprint?.name ?? 'propriedade'}`,
        boardIndex,
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      titles: {
        ...game.titles,
        [titleKey]: {
          ...title,
          properties: properties.filter((item) => item.id !== propertyId),
          lastPropertyActionRound: game.round,
          lastPropertyActionTurnStartedAt: game.turnStartedAt,
          lastPropertyActionVisitStartedAt: propertyActionVisitStartedAt,
        },
      },
      playerFinances: {
        ...game.playerFinances,
        [playerId]: nextFinance,
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), {
    updatedAt: Date.now(),
  });
}

export async function sellTitleToBank(roomId: string, playerId: string, boardIndex: number) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const titleKey = String(boardIndex);
    const title = game.titles[titleKey];
    const finance = game.playerFinances[playerId];
    const boardSpace = BOARD_SPACES_BY_INDEX[boardIndex];

    requirePlayerCanAct(game, playerId, 'Jogador travado nao pode vender titulos.');

    if (!title || title.ownerId !== playerId || !finance) {
      throw new Error('Titulo do jogador nao encontrado.');
    }

    const saleValue = calculateTitleBankSaleValue(game, title);
    const nextFinance = appendFinanceTransaction(
      {
        ...finance,
        balance: finance.balance + saleValue,
      },
      {
        kind: 'title-bank-sale',
        amount: saleValue,
        round: game.round,
        description: `Venda ao banco: ${boardSpace?.streetName ?? boardSpace?.name ?? boardIndex}`,
        boardIndex,
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      titles: {
        ...game.titles,
        [titleKey]: {
          boardIndex,
          ownerId: null,
          properties: [],
        },
      },
      playerFinances: {
        ...game.playerFinances,
        [playerId]: nextFinance,
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function createTitleSaleOffer(
  roomId: string,
  sellerId: string,
  buyerId: string,
  boardIndex: number,
  amount: number,
) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const offerAmount = Number(amount);

  if (sellerId === buyerId) {
    throw new Error('Selecione outro jogador para a venda.');
  }

  if (!Number.isFinite(offerAmount) || offerAmount <= 0) {
    throw new Error('Informe um valor de venda valido.');
  }

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const title = game.titles[String(boardIndex)];
    const buyer = players.find((player) => player.id === buyerId && player.status !== 'eliminated');

    requirePlayerCanAct(game, sellerId, 'Jogador travado nao pode negociar titulos.');

    if (!title || title.ownerId !== sellerId) {
      throw new Error('Titulo do vendedor nao encontrado.');
    }

    if (!buyer) {
      throw new Error('Comprador ativo nao encontrado.');
    }

    const offerId = crypto.randomUUID();

    return toFirebaseValue({
      ...game,
      titleSaleOffers: {
        ...game.titleSaleOffers,
        [offerId]: {
          id: offerId,
          boardIndex,
          sellerId,
          buyerId,
          amount: offerAmount,
          status: 'pending',
          createdAt: now,
        },
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function acceptTitleSaleOffer(roomId: string, buyerId: string, offerId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const offer = game.titleSaleOffers[offerId];

    requirePlayerCanAct(game, buyerId, 'Jogador travado nao pode aceitar propostas.');

    if (!offer || offer.buyerId !== buyerId || offer.status !== 'pending') {
      throw new Error('Proposta de venda nao encontrada.');
    }

    const title = game.titles[String(offer.boardIndex)];
    const sellerFinance = game.playerFinances[offer.sellerId];
    const buyerFinance = game.playerFinances[buyerId];

    if (!title || title.ownerId !== offer.sellerId || !sellerFinance || !buyerFinance) {
      throw new Error('Titulo ou jogadores da proposta nao encontrados.');
    }

    if (buyerFinance.balance < offer.amount) {
      throw new Error('Saldo insuficiente para aceitar a proposta.');
    }

    const nextBuyerFinance = appendFinanceTransaction(
      {
        ...buyerFinance,
        balance: buyerFinance.balance - offer.amount,
      },
      {
        kind: 'title-player-purchase',
        amount: -offer.amount,
        round: game.round,
        description: 'Compra de titulo de jogador',
        relatedPlayerId: offer.sellerId,
        boardIndex: offer.boardIndex,
      },
      now,
    );
    const nextSellerFinance = appendFinanceTransaction(
      {
        ...sellerFinance,
        balance: sellerFinance.balance + offer.amount,
      },
      {
        kind: 'title-player-sale',
        amount: offer.amount,
        round: game.round,
        description: 'Venda de titulo para jogador',
        relatedPlayerId: buyerId,
        boardIndex: offer.boardIndex,
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      titles: {
        ...game.titles,
        [String(offer.boardIndex)]: {
          ...title,
          ownerId: buyerId,
          acquiredAtRound: game.round,
        },
      },
      titleSaleOffers: {
        ...game.titleSaleOffers,
        [offerId]: {
          ...offer,
          status: 'accepted',
          acceptedAt: now,
        },
      },
      playerFinances: {
        ...game.playerFinances,
        [buyerId]: nextBuyerFinance,
        [offer.sellerId]: nextSellerFinance,
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function declineTitleSaleOffer(roomId: string, buyerId: string, offerId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const offer = game.titleSaleOffers[offerId];

    if (!offer || offer.buyerId !== buyerId || offer.status !== 'pending') {
      throw new Error('Proposta de venda nao encontrada.');
    }

    return toFirebaseValue({
      ...game,
      titleSaleOffers: {
        ...game.titleSaleOffers,
        [offerId]: {
          ...offer,
          status: 'cancelled',
          cancelledAt: now,
        },
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function createPlayerLoanOffer(
  roomId: string,
  borrowerId: string,
  lenderId: string,
  amount: number,
) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const loanAmount = Number(amount);

  if (borrowerId === lenderId) {
    throw new Error('Selecione outro jogador para o emprestimo.');
  }

  if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
    throw new Error('Informe um valor de emprestimo valido.');
  }

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const borrower = players.find(
      (player) => player.id === borrowerId && player.status !== 'eliminated',
    );
    const lender = players.find(
      (player) => player.id === lenderId && player.status !== 'eliminated',
    );

    if (!borrower || !lender) {
      throw new Error('Jogadores ativos nao encontrados.');
    }

    requirePlayerCanAct(game, borrowerId, 'Jogador travado nao pode solicitar emprestimos.');

    const projectedScore = calculateProjectedBankScore(game, borrowerId, loanAmount);

    if (projectedScore <= 0) {
      throw new Error('Emprestimo bloqueado: este valor levaria o jogador a falencia.');
    }

    const offerId = crypto.randomUUID();

    return toFirebaseValue({
      ...game,
      playerLoanOffers: {
        ...game.playerLoanOffers,
        [offerId]: {
          id: offerId,
          borrowerId,
          lenderId,
          amount: loanAmount,
          status: 'pending',
          createdAt: now,
        },
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function acceptPlayerLoanOffer(roomId: string, lenderId: string, offerId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const offer = game.playerLoanOffers[offerId];

    requirePlayerCanAct(game, lenderId, 'Jogador travado nao pode aceitar emprestimos.');

    if (!offer || offer.lenderId !== lenderId || offer.status !== 'pending') {
      throw new Error('Proposta de emprestimo nao encontrada.');
    }

    const borrowerFinance = game.playerFinances[offer.borrowerId];
    const lenderFinance = game.playerFinances[lenderId];

    if (!borrowerFinance || !lenderFinance) {
      throw new Error('Financas dos jogadores nao encontradas.');
    }

    if (lenderFinance.balance < offer.amount) {
      throw new Error('Saldo insuficiente para aceitar este emprestimo.');
    }

    const borrowerName =
      players.find((player) => player.id === offer.borrowerId)?.name ?? 'jogador';
    const lenderName = players.find((player) => player.id === lenderId)?.name ?? 'jogador';
    const debt = createDebt(
      {
        kind: 'player-loan',
        creditorId: lenderId,
        debtorId: offer.borrowerId,
        amount: offer.amount,
        originalAmount: offer.amount,
        createdAtRound: game.round,
        sourceId: offer.id,
        description: `Emprestimo de ${lenderName} para ${borrowerName}`,
      },
      now,
    );
    const nextBorrowerFinance = appendFinanceTransaction(
      {
        ...borrowerFinance,
        balance: borrowerFinance.balance + offer.amount,
        debts: {
          ...borrowerFinance.debts,
          [debt.id]: debt,
        },
      },
      {
        kind: 'player-loan-received',
        amount: offer.amount,
        round: game.round,
        description: 'Emprestimo recebido de jogador',
        relatedPlayerId: lenderId,
      },
      now,
    );
    const nextLenderFinance = appendFinanceTransaction(
      {
        ...lenderFinance,
        balance: lenderFinance.balance - offer.amount,
        receivables: {
          ...lenderFinance.receivables,
          [debt.id]: debt,
        },
      },
      {
        kind: 'player-loan-sent',
        amount: -offer.amount,
        round: game.round,
        description: 'Emprestimo enviado a jogador',
        relatedPlayerId: offer.borrowerId,
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      playerLoanOffers: {
        ...game.playerLoanOffers,
        [offerId]: {
          ...offer,
          status: 'accepted',
          acceptedAt: now,
          debtId: debt.id,
        },
      },
      playerFinances: {
        ...game.playerFinances,
        [offer.borrowerId]: nextBorrowerFinance,
        [lenderId]: nextLenderFinance,
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function declinePlayerLoanOffer(roomId: string, playerId: string, offerId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const offer = game.playerLoanOffers[offerId];

    if (!offer || offer.status !== 'pending') {
      throw new Error('Proposta de emprestimo nao encontrada.');
    }

    if (offer.lenderId !== playerId && offer.borrowerId !== playerId) {
      throw new Error('Apenas os jogadores envolvidos podem recusar esta proposta.');
    }

    const status = offer.lenderId === playerId ? 'declined' : 'cancelled';

    return toFirebaseValue({
      ...game,
      playerLoanOffers: {
        ...game.playerLoanOffers,
        [offerId]: {
          ...offer,
          status,
          ...(status === 'declined' ? { declinedAt: now } : { cancelledAt: now }),
        },
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}
export async function createTitleAuction(
  roomId: string,
  sellerId: string,
  boardIndex: number,
  initialBid: number,
) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const bidAmount = Number(initialBid);

  if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
    throw new Error('Informe um lance inicial valido.');
  }

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const title = game.titles[String(boardIndex)];

    requirePlayerCanAct(game, sellerId, 'Jogador travado nao pode abrir leiloes.');

    if (!title || title.ownerId !== sellerId) {
      throw new Error('Titulo do vendedor nao encontrado.');
    }

    if (
      Object.values(game.titleAuctions).some(
        (auction) => auction.boardIndex === boardIndex && auction.status === 'open',
      )
    ) {
      throw new Error('Ja existe um leilao aberto para este titulo.');
    }

    const auctionId = crypto.randomUUID();

    return toFirebaseValue({
      ...game,
      titleAuctions: {
        ...game.titleAuctions,
        [auctionId]: {
          id: auctionId,
          boardIndex,
          sellerId,
          initialBid: bidAmount,
          status: 'open',
          bids: {},
          createdAt: now,
        },
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function placeTitleAuctionBid(
  roomId: string,
  bidderId: string,
  auctionId: string,
  amount: number,
) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const bidAmount = Number(amount);

  if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
    throw new Error('Informe um lance valido.');
  }

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const auction = game.titleAuctions[auctionId];
    const finance = game.playerFinances[bidderId];
    const highestBid = auction?.highestBidId ? auction.bids[auction.highestBidId] : undefined;
    const minimumBid = Math.max(auction?.initialBid ?? 0, highestBid?.amount ?? 0);

    requirePlayerCanAct(game, bidderId, 'Jogador travado nao pode ofertar em leiloes.');

    if (!auction || auction.status !== 'open') {
      throw new Error('Leilao aberto nao encontrado.');
    }

    if (auction.sellerId === bidderId) {
      throw new Error('O vendedor nao pode ofertar no proprio leilao.');
    }

    if (!finance || finance.balance < bidAmount) {
      throw new Error('Saldo insuficiente para este lance.');
    }

    if (bidAmount <= minimumBid) {
      throw new Error('O lance precisa superar a maior oferta atual.');
    }

    const bidId = crypto.randomUUID();

    return toFirebaseValue({
      ...game,
      titleAuctions: {
        ...game.titleAuctions,
        [auctionId]: {
          ...auction,
          highestBidId: bidId,
          bids: {
            ...auction.bids,
            [bidId]: {
              id: bidId,
              bidderId,
              amount: bidAmount,
              createdAt: now,
            },
          },
        },
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function closeTitleAuction(roomId: string, sellerId: string, auctionId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const auction = game.titleAuctions[auctionId];

    requirePlayerCanAct(game, sellerId, 'Jogador travado nao pode fechar leiloes.');

    if (!auction || auction.sellerId !== sellerId || auction.status !== 'open') {
      throw new Error('Leilao aberto nao encontrado.');
    }

    const highestBid = auction.highestBidId ? auction.bids[auction.highestBidId] : undefined;

    if (!highestBid) {
      throw new Error('Nao ha ofertas para fechar este leilao.');
    }

    const title = game.titles[String(auction.boardIndex)];
    const sellerFinance = game.playerFinances[sellerId];
    const buyerFinance = game.playerFinances[highestBid.bidderId];

    if (!title || title.ownerId !== sellerId || !sellerFinance || !buyerFinance) {
      throw new Error('Titulo ou jogadores do leilao nao encontrados.');
    }

    if (buyerFinance.balance < highestBid.amount) {
      throw new Error('Maior ofertante nao possui saldo suficiente.');
    }

    const nextBuyerFinance = appendFinanceTransaction(
      {
        ...buyerFinance,
        balance: buyerFinance.balance - highestBid.amount,
      },
      {
        kind: 'title-player-purchase',
        amount: -highestBid.amount,
        round: game.round,
        description: 'Compra de titulo em leilao',
        relatedPlayerId: sellerId,
        boardIndex: auction.boardIndex,
      },
      now,
    );
    const nextSellerFinance = appendFinanceTransaction(
      {
        ...sellerFinance,
        balance: sellerFinance.balance + highestBid.amount,
      },
      {
        kind: 'title-player-sale',
        amount: highestBid.amount,
        round: game.round,
        description: 'Venda de titulo em leilao',
        relatedPlayerId: highestBid.bidderId,
        boardIndex: auction.boardIndex,
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      titles: {
        ...game.titles,
        [String(auction.boardIndex)]: {
          ...title,
          ownerId: highestBid.bidderId,
          acquiredAtRound: game.round,
        },
      },
      titleAuctions: {
        ...game.titleAuctions,
        [auctionId]: {
          ...auction,
          status: 'closed',
          closedAt: now,
        },
      },
      playerFinances: {
        ...game.playerFinances,
        [sellerId]: nextSellerFinance,
        [highestBid.bidderId]: nextBuyerFinance,
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function rollPlayerDice(
  roomId: string,
  playerId: string,
  diceResult?: { diceOne: number; diceTwo: number },
) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const diceOne =
    diceResult?.diceOne ??
    Math.floor(Math.random() * GAME_BALANCE.board.dice.sides) + GAME_BALANCE.board.dice.min;
  const diceTwo =
    diceResult?.diceTwo ??
    Math.floor(Math.random() * GAME_BALANCE.board.dice.sides) + GAME_BALANCE.board.dice.min;
  const now = Date.now();
  const roll: DiceRoll = {
    playerId,
    diceOne,
    diceTwo,
    total: diceOne + diceTwo,
    createdAt: now,
  };

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const game = hydrateGameState(currentGame, players);

    if (game.status !== 'playing') {
      throw new Error('A partida precisa estar em andamento para jogar.');
    }

    if (game.turnPlayerId !== playerId) {
      throw new Error('Aguarde a sua vez de jogar.');
    }

    const lastRoll = game.playerLastRolls[playerId];

    if (lastRoll && game.turnStartedAt && lastRoll.createdAt >= game.turnStartedAt) {
      throw new Error('Voce ja girou os dados nesta jogada.');
    }

    const position = game.positions[playerId] ?? 1;
    const activeRestriction = getActivePlayerRestriction(game, playerId);
    const isDoubleRoll = roll.diceOne === roll.diceTwo;

    if (activeRestriction && !isDoubleRoll) {
      return toFirebaseValue({
        ...game,
        playerRestrictions: {
          ...game.playerRestrictions,
          [activeRestriction.id]: {
            ...activeRestriction,
            failedAttempts: activeRestriction.failedAttempts + 1,
          },
        },
        lastRoll: roll,
        playerLastRolls: {
          ...game.playerLastRolls,
          [playerId]: roll,
        },
        updatedAt: now,
      });
    }

    const unrestrictedGame = activeRestriction
      ? {
          ...game,
          playerRestrictions: releaseRestriction(game, activeRestriction, 'doubles', now),
        }
      : game;
    const nextPosition = moveBoardPosition(position, roll.total);
    const gameWithSpaceRestriction = createRestrictionForSpace(
      unrestrictedGame,
      playerId,
      nextPosition,
      now,
    );
    const gameWithRentSettled = createEventPendingForPosition(
      createRentPendingForPosition(gameWithSpaceRestriction, playerId, nextPosition, now),
      playerId,
      nextPosition,
      players,
      now,
    );
    const lapPendings = didPassStart(position, nextPosition, roll.total)
      ? createLapPendings(gameWithRentSettled, playerId, now)
      : {
          roundPendings: gameWithRentSettled.roundPendings,
          taxPendings: gameWithRentSettled.taxPendings,
        };

    return toFirebaseValue({
      ...gameWithRentSettled,
      roundPendings: lapPendings.roundPendings,
      taxPendings: lapPendings.taxPendings,
      positions: {
        ...gameWithRentSettled.positions,
        [playerId]: nextPosition,
      },
      lastRoll: roll,
      playerLastRolls: {
        ...gameWithRentSettled.playerLastRolls,
        [playerId]: roll,
      },
      updatedAt: now,
    });
  });

  await update(ref(database, `rooms/${roomId}`), {
    updatedAt: now,
  });

  return roll;
}

export async function finishPlayerTurn(roomId: string, playerId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const now = Date.now();

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const game = hydrateGameState(currentGame, players);

    if (game.status !== 'playing') {
      throw new Error('A partida precisa estar em andamento para concluir a jogada.');
    }

    if (game.turnPlayerId !== playerId) {
      throw new Error('Aguarde a sua vez de jogar.');
    }

    const roll = game.playerLastRolls[playerId];

    if (!roll || (game.turnStartedAt && roll.createdAt < game.turnStartedAt)) {
      throw new Error('Gire os dados antes de concluir a jogada.');
    }

    const { nextCompletedTurns, nextPlayerId, nextRound } = advanceTurn(game, roll);

    return toFirebaseValue({
      ...game,
      round: nextRound,
      turnPlayerId: nextPlayerId,
      turnStartedAt: now,
      completedTurns: nextCompletedTurns,
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), {
    updatedAt: now,
  });
}
