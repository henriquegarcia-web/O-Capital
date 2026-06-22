import {
  equalTo,
  get,
  off,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  runTransaction,
  set,
  update,
} from 'firebase/database';

import { BOARD_SPACES_BY_INDEX, GAME_LIMITS, PROPERTY_BLUEPRINTS } from '@/constants';
import { database } from '@/firebase';
import type { CreatePlayerInput, CreateRoomInput } from '@/schemas';
import type {
  BuiltProperty,
  DiceRoll,
  GameState,
  Player,
  PlayerDebt,
  PlayerFinance,
  PlayerTransaction,
  PropertyBlueprint,
  Room,
  RoomSummary,
} from '@/types';
import {
  advanceTurn,
  BANK_LOAN_INTEREST_RATE,
  BANK_LOAN_MIN_SCORE,
  calculateBankScore,
  calculateCreditLimit,
  calculateTitleBankSaleValue,
  createLapPendings,
  didPassStart,
  getActivePlayers,
  getNextRealEstateBlueprint,
  getInitialGameState,
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

function getActiveDebtAmount(finance?: PlayerFinance) {
  return Object.values(finance?.debts ?? {}).reduce(
    (total, debt) => total + (debt.status === 'active' ? debt.amount : 0),
    0,
  );
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

function getRentBlueprint(properties: BuiltProperty[] = []) {
  return properties
    .map((property) => getBlueprint(property.blueprintKey))
    .filter((blueprint): blueprint is PropertyBlueprint => blueprint?.category === 'real-estate')
    .sort((current, next) => (next.rent ?? 0) - (current.rent ?? 0))[0];
}

function settleRentForPosition(game: GameState, playerId: string, boardIndex: number, now: number) {
  const title = game.titles[String(boardIndex)];
  const ownerId = title?.ownerId;

  if (!title || !ownerId || ownerId === playerId) {
    return game;
  }

  const rentBlueprint = getRentBlueprint(title.properties);
  const rentAmount = rentBlueprint?.rent ?? 0;

  if (rentAmount <= 0) {
    return game;
  }

  const debtorFinance = game.playerFinances[playerId];
  const creditorFinance = game.playerFinances[ownerId];

  if (!debtorFinance || !creditorFinance) {
    return game;
  }

  const paidAmount = Math.min(debtorFinance.balance, rentAmount);
  const pendingAmount = rentAmount - paidAmount;
  const debtorName = 'Aluguel pago';
  const creditorName = 'Aluguel recebido';
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
        description: debtorName,
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
        description: creditorName,
        relatedPlayerId: playerId,
        boardIndex,
      },
      now,
    );
  }

  if (pendingAmount > 0) {
    const debtId = crypto.randomUUID();
    const debt = {
      id: debtId,
      kind: 'rent' as const,
      creditorId: ownerId,
      debtorId: playerId,
      amount: pendingAmount,
      originalAmount: pendingAmount,
      boardIndex,
      description: `Aluguel pendente da casa ${boardIndex}`,
      status: 'active' as const,
      createdAt: now,
      updatedAt: now,
    };

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
      updatedAt: now,
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

export async function createRoom(input: CreateRoomInput) {
  const waitingRooms = await listWaitingRooms();

  if (hasSameName(input.name, waitingRooms)) {
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

export async function listWaitingRooms() {
  const snapshot = await get(query(roomsRef, orderByChild('status'), equalTo('waiting')));

  if (!snapshot.exists()) {
    return [];
  }

  return Object.values(snapshot.val() as Record<string, RoomRecord>).map(toRoomSummary);
}

export function subscribeToWaitingRooms(onChange: (rooms: RoomSummary[]) => void) {
  const waitingRoomsQuery = query(roomsRef, orderByChild('status'), equalTo('waiting'));

  onValue(waitingRoomsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      onChange([]);
      return;
    }

    const rooms = Object.values(snapshot.val() as Record<string, RoomRecord>)
      .map(toRoomSummary)
      .sort((current, next) => next.createdAt - current.createdAt);

    onChange(rooms);
  });

  return () => off(waitingRoomsQuery);
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

  if (players.some((player) => player.colorKey === input.colorKey)) {
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

    if (!finance) {
      throw new Error('Financas do jogador nao encontradas.');
    }

    if (
      Object.values(game.bankLoans).some(
        (loan) => loan.playerId === playerId && loan.status === 'active',
      )
    ) {
      throw new Error('Existe um emprestimo bancario ativo.');
    }

    const creditLimit = calculateCreditLimit(game, playerId);
    const score = calculateBankScore(game, playerId);
    const activeDebt = getActiveDebtAmount(finance);

    if (score <= BANK_LOAN_MIN_SCORE) {
      throw new Error('Pontuacao bancaria insuficiente para emprestimo.');
    }

    if (activeDebt + loanAmount > creditLimit) {
      throw new Error('Valor solicitado excede o limite disponivel.');
    }

    const debt = createDebt(
      {
        kind: 'bank',
        creditorId: null,
        debtorId: playerId,
        amount: Math.round(loanAmount * (1 + BANK_LOAN_INTEREST_RATE)),
        originalAmount: Math.round(loanAmount * (1 + BANK_LOAN_INTEREST_RATE)),
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

    const amount = taxPending.discountedAmount ?? taxPending.amount;

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

    let nextFinance = finance;

    if (pending.kind === 'dividends') {
      nextFinance = appendFinanceTransaction(
        {
          ...finance,
          balance: finance.balance + pending.amount,
        },
        {
          kind: 'round-income',
          amount: pending.amount,
          round: game.round,
          description: 'Recebimento de dividendos',
        },
        now,
      );
    }

    if (pending.kind === 'maintenance') {
      const paidAmount = Math.min(finance.balance, pending.amount);
      const pendingAmount = pending.amount - paidAmount;

      nextFinance = appendFinanceTransaction(
        {
          ...finance,
          balance: finance.balance - paidAmount,
        },
        {
          kind: 'maintenance-payment',
          amount: -paidAmount,
          round: game.round,
          description: 'Pagamento de manutencoes',
        },
        now,
      );

      if (pendingAmount > 0) {
        const debt = createDebt(
          {
            kind: 'maintenance',
            creditorId: null,
            debtorId: playerId,
            amount: pendingAmount,
            originalAmount: pendingAmount,
            createdAtRound: game.round,
            sourceId: pending.id,
            description: 'Manutencao pendente',
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
            amount: -pendingAmount,
            round: game.round,
            description: 'Divida criada por manutencao insuficiente',
          },
          now,
        );
      }
    }

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
    const propertySlots = boardSpace?.propertySlots ?? 3;

    if (boardSpace?.kind !== 'street') {
      throw new Error('Esta casa nao permite construcao.');
    }

    if (!title || title.ownerId !== playerId) {
      throw new Error('Apenas o dono do titulo pode construir aqui.');
    }

    if (!blueprint) {
      throw new Error('Propriedade selecionada nao encontrada.');
    }

    if (properties.length >= propertySlots) {
      throw new Error('Este titulo ja atingiu o limite de propriedades.');
    }

    if (title.lastPropertyPurchaseRound === game.round) {
      throw new Error('Este titulo ja recebeu uma propriedade nesta rodada.');
    }

    if (blueprint.category === 'real-estate') {
      const nextRealEstateBlueprint = getNextRealEstateBlueprint(properties);

      if (nextRealEstateBlueprint?.key !== blueprint.key) {
        throw new Error('Imoveis devem seguir a progressao de nivel.');
      }
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
      constructionCost: blueprint.constructionCost,
      acquiredAtRound: game.round,
      acquiredAt: now,
      ...(optionName ? { optionName } : {}),
    };
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
          properties: [...properties, builtProperty],
          lastPropertyPurchaseRound: game.round,
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
  const diceOne = diceResult?.diceOne ?? Math.floor(Math.random() * 6) + 1;
  const diceTwo = diceResult?.diceTwo ?? Math.floor(Math.random() * 6) + 1;
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

    const position = game.positions[playerId] ?? 1;
    const nextPosition = moveBoardPosition(position, roll.total);
    const { nextCompletedTurns, nextPlayerId, nextRound } = advanceTurn(game, roll);
    const gameWithRentSettled = settleRentForPosition(game, playerId, nextPosition, now);
    const lapPendings = didPassStart(position, nextPosition, roll.total)
      ? createLapPendings(gameWithRentSettled, playerId, now)
      : {
          roundPendings: gameWithRentSettled.roundPendings,
          taxPendings: gameWithRentSettled.taxPendings,
        };

    return toFirebaseValue({
      ...gameWithRentSettled,
      round: nextRound,
      roundPendings: lapPendings.roundPendings,
      taxPendings: lapPendings.taxPendings,
      turnPlayerId: nextPlayerId,
      turnStartedAt: now,
      positions: {
        ...gameWithRentSettled.positions,
        [playerId]: nextPosition,
      },
      completedTurns: nextCompletedTurns,
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
