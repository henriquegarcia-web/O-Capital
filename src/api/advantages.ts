import { ref, runTransaction, update } from 'firebase/database';

import { getRoom } from './rooms';
import { BOARD_SPACES_BY_INDEX, GAME_BALANCE } from '@/constants';
import { database } from '@/firebase';
import type {
  AdvantageKey,
  GameState,
  Player,
  PlayerFinance,
  PlayerRestriction,
  PlayerTransaction,
} from '@/types';
import {
  calculateRestrictionFineAmount,
  calculateTitleAuctionDurationDays,
  calculateTitleBankSaleValue,
  canUseCurrentBoardSpaceAction,
  createSpaceActionKey,
  getActivePlayerRestriction,
  getAdvantageDefinition,
  getPlayerAdvantageState,
  getPlayerSpaceVisitStartedAt,
  hasCurrentSpaceAction,
  hasUsedAdvantageThisTurn,
  hydrateGameState,
  isPlayerActionBlocked,
} from '@/utils';

function toPlayersArray(players?: Record<string, Player>) {
  return Object.values(players ?? {}).sort((current, next) => current.joinedAt - next.joinedAt);
}

function toFirebaseValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function requirePlayerCanAct(game: GameState, playerId: string, message?: string) {
  if (isPlayerActionBlocked(game, playerId)) {
    throw new Error(message ?? 'Jogador travado: libere a penalidade antes de realizar esta acao.');
  }
}

function changeAdvantageQuantity(
  state: ReturnType<typeof getPlayerAdvantageState>,
  advantageKey: AdvantageKey,
  delta: number,
) {
  const currentQuantity = state.inventory[advantageKey]?.quantity ?? 0;
  const nextQuantity = currentQuantity + delta;

  if (nextQuantity < 0) {
    throw new Error('Vantagem indisponivel no inventario.');
  }

  return {
    ...state,
    inventory: {
      ...state.inventory,
      [advantageKey]: {
        key: advantageKey,
        quantity: nextQuantity,
      },
    },
  };
}

function consumeAdvantageForRound(
  game: GameState,
  playerId: string,
  advantageKey: AdvantageKey,
  extraUpdate?: (
    state: ReturnType<typeof getPlayerAdvantageState>,
  ) => ReturnType<typeof getPlayerAdvantageState>,
) {
  const state = getPlayerAdvantageState(game, playerId);

  if (state.usedInRound === game.round) {
    throw new Error('Voce ja usou uma vantagem nesta rodada.');
  }

  if ((state.inventory[advantageKey]?.quantity ?? 0) <= 0) {
    throw new Error('Vantagem indisponivel no inventario.');
  }

  const consumedState = {
    ...changeAdvantageQuantity(state, advantageKey, -1),
    usedInRound: game.round,
  };

  return {
    ...game.playerAdvantages,
    [playerId]: extraUpdate ? extraUpdate(consumedState) : consumedState,
  };
}

function consumeAdvantageForTurn(
  game: GameState,
  playerId: string,
  advantageKey: AdvantageKey,
  extraUpdate?: (
    state: ReturnType<typeof getPlayerAdvantageState>,
  ) => ReturnType<typeof getPlayerAdvantageState>,
) {
  const state = getPlayerAdvantageState(game, playerId);

  if (hasUsedAdvantageThisTurn(game, playerId, advantageKey)) {
    throw new Error('Voce ja usou esta vantagem nesta vez de jogar.');
  }

  if ((state.inventory[advantageKey]?.quantity ?? 0) <= 0) {
    throw new Error('Vantagem indisponivel no inventario.');
  }

  const consumedState = {
    ...changeAdvantageQuantity(state, advantageKey, -1),
    usedInTurnByKey: {
      ...state.usedInTurnByKey,
      [advantageKey]: game.turnStartedAt,
    },
  };

  return {
    ...game.playerAdvantages,
    [playerId]: extraUpdate ? extraUpdate(consumedState) : consumedState,
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

export async function buyAdvantage(roomId: string, playerId: string, advantageKey: AdvantageKey) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const definition = getAdvantageDefinition(advantageKey);

  if (!definition) {
    throw new Error('Vantagem nao encontrada.');
  }

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const boardIndex = game.positions[playerId] ?? 1;
    const finance = game.playerFinances[playerId];

    if (game.status !== 'playing' || game.turnPlayerId !== playerId) {
      throw new Error('Vantagens so podem ser compradas na sua vez.');
    }

    requirePlayerCanAct(game, playerId, 'Jogador travado nao pode comprar vantagens.');

    if (BOARD_SPACES_BY_INDEX[boardIndex]?.kind !== 'advantage-market') {
      throw new Error('Voce precisa estar no Mercado de Vantagens.');
    }

    if (hasCurrentSpaceAction(game, playerId, boardIndex, 'advantage-purchase')) {
      throw new Error('Voce ja comprou uma vantagem nesta passagem pelo Mercado.');
    }

    if (!finance || finance.balance < definition.cost) {
      throw new Error('Saldo insuficiente para comprar esta vantagem.');
    }

    const actionKey = createSpaceActionKey(
      playerId,
      boardIndex,
      'advantage-purchase',
      game.turnStartedAt,
    );
    const nextFinance = appendFinanceTransaction(
      {
        ...finance,
        balance: finance.balance - definition.cost,
      },
      {
        kind: 'bank-debit',
        amount: -definition.cost,
        round: game.round,
        description: `Compra de vantagem: ${definition.name}`,
        boardIndex,
      },
      now,
    );
    const state = getPlayerAdvantageState(game, playerId);

    return toFirebaseValue({
      ...game,
      playerAdvantages: {
        ...game.playerAdvantages,
        [playerId]: changeAdvantageQuantity(state, advantageKey, 1),
      },
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
          action: 'advantage-purchase',
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

export async function useFiscalProtection(roomId: string, playerId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const restriction = getActivePlayerRestriction(game, playerId);

    if (game.status !== 'playing' || game.turnPlayerId !== playerId) {
      throw new Error('A Protecao Fiscal so pode ser usada na sua vez.');
    }

    if (!restriction) {
      throw new Error('Nao ha penalidade fiscal ou bancaria ativa.');
    }

    if (
      !canUseCurrentBoardSpaceAction(game, playerId, restriction.boardIndex) ||
      restriction.createdAt !== getPlayerSpaceVisitStartedAt(game, playerId)
    ) {
      throw new Error('A Protecao Fiscal so pode ser usada ao cair na casa da penalidade.');
    }

    return toFirebaseValue({
      ...game,
      playerAdvantages: consumeAdvantageForRound(game, playerId, 'fiscal-protection'),
      playerRestrictions: releaseRestriction(game, restriction, 'advantage', now),
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function useRentInsurance(roomId: string, playerId: string, pendingId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const pending = game.roundPendings[pendingId];

    if (game.status !== 'playing' || game.turnPlayerId !== playerId) {
      throw new Error('Seguro Aluguel so pode ser usado na sua vez.');
    }

    if (
      !pending ||
      pending.kind !== 'rent' ||
      pending.playerId !== playerId ||
      pending.status !== 'pending'
    ) {
      throw new Error('Pendencia de aluguel nao encontrada.');
    }

    if (
      !pending.boardIndex ||
      !canUseCurrentBoardSpaceAction(game, playerId, pending.boardIndex) ||
      pending.createdAt !== getPlayerSpaceVisitStartedAt(game, playerId)
    ) {
      throw new Error('Seguro Aluguel so pode ser usado ao cair na propriedade.');
    }

    const noticeId = crypto.randomUUID();
    const playerName = players.find((player) => player.id === playerId)?.name ?? 'Jogador';

    return toFirebaseValue({
      ...game,
      playerAdvantages: consumeAdvantageForRound(game, playerId, 'rent-insurance'),
      roundPendings: {
        ...game.roundPendings,
        [pendingId]: {
          ...pending,
          status: 'confirmed',
          confirmedAt: now,
        },
        ...(pending.relatedPlayerId
          ? {
              [noticeId]: {
                id: noticeId,
                playerId: pending.relatedPlayerId,
                relatedPlayerId: playerId,
                kind: 'rent-waived-notice' as const,
                amount: pending.amount,
                round: game.round,
                boardIndex: pending.boardIndex,
                message: `${playerName} caiu no seu titulo, mas usou Seguro Aluguel e nao pagou o aluguel.`,
                status: 'pending' as const,
                createdAt: now,
              },
            }
          : {}),
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function useForceAuction(
  roomId: string,
  playerId: string,
  targetPlayerId: string,
  boardIndex: number,
) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const title = game.titles[String(boardIndex)];

    if (game.status !== 'playing' || game.turnPlayerId !== playerId) {
      throw new Error('Forcar Leilao so pode ser usado na sua vez.');
    }

    requirePlayerCanAct(game, playerId);

    if (!title || title.ownerId !== targetPlayerId || targetPlayerId === playerId) {
      throw new Error('Titulo alvo invalido.');
    }

    if (
      Object.values(game.titleAuctions).some(
        (auction) => auction.boardIndex === boardIndex && auction.status === 'open',
      )
    ) {
      throw new Error('Ja existe um leilao aberto para este titulo.');
    }

    const auctionId = crypto.randomUUID();
    const durationDays = calculateTitleAuctionDurationDays(players);
    const openedAtDay = game.day ?? 0;

    return toFirebaseValue({
      ...game,
      playerAdvantages: consumeAdvantageForTurn(game, playerId, 'force-auction'),
      titleAuctions: {
        ...game.titleAuctions,
        [auctionId]: {
          id: auctionId,
          boardIndex,
          sellerId: targetPlayerId,
          initialBid: calculateTitleBankSaleValue(game, title),
          status: 'open',
          bids: {},
          openedAtDay,
          durationDays,
          expiresAtDay: openedAtDay + durationDays,
          createdAt: now,
        },
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function activateTaxReduction(roomId: string, playerId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const currentState = getPlayerAdvantageState(game, playerId);

    if (game.status !== 'playing' || game.turnPlayerId !== playerId) {
      throw new Error('Reducao de Impostos so pode ser ativada na sua vez.');
    }

    requirePlayerCanAct(game, playerId);

    if (currentState.taxReduction?.remainingPasses) {
      throw new Error('Ja existe uma Reducao de Impostos ativa.');
    }

    return toFirebaseValue({
      ...game,
      playerAdvantages: consumeAdvantageForTurn(game, playerId, 'tax-reduction', (state) => ({
        ...state,
        taxReduction: {
          id: crypto.randomUUID(),
          remainingPasses: GAME_BALANCE.advantages.taxReductionPasses,
          discountRate: GAME_BALANCE.advantages.taxReductionDiscountRate,
          createdAt: now,
        },
      })),
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}

export async function payRestrictionFine(roomId: string, playerId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const restriction = getActivePlayerRestriction(game, playerId);
    const finance = game.playerFinances[playerId];

    if (!restriction || !finance) {
      throw new Error('Penalidade ativa nao encontrada.');
    }

    if (restriction.failedAttempts < GAME_BALANCE.restrictions.requiredFailedAttemptsBeforeFine) {
      throw new Error('A multa so fica disponivel depois de 3 tentativas sem numeros iguais.');
    }

    const fineAmount = calculateRestrictionFineAmount(game, playerId);

    if (finance.balance < fineAmount) {
      throw new Error('Saldo insuficiente para pagar a multa de liberacao.');
    }

    const nextFinance = appendFinanceTransaction(
      {
        ...finance,
        balance: finance.balance - fineAmount,
      },
      {
        kind: 'tax-payment',
        amount: -fineAmount,
        round: game.round,
        description: 'Multa de liberacao de penalidade',
        boardIndex: restriction.boardIndex,
      },
      now,
    );

    return toFirebaseValue({
      ...game,
      playerFinances: {
        ...game.playerFinances,
        [playerId]: nextFinance,
      },
      playerRestrictions: releaseRestriction(game, restriction, 'fine', now),
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}
