import { ref, runTransaction, update } from 'firebase/database';

import { getRoom } from './rooms';
import { database } from '@/firebase';
import type {
  AdvantageKey,
  GameState,
  MissionKey,
  Player,
  PlayerFinance,
  PlayerTransaction,
} from '@/types';
import {
  getMissionDefinition,
  getPlayerAdvantageState,
  getPlayerMissionState,
  hydrateGameState,
  isMissionCompleted,
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

function changeAdvantageQuantity(
  state: ReturnType<typeof getPlayerAdvantageState>,
  advantageKey: AdvantageKey,
  delta: number,
) {
  const currentQuantity = state.inventory[advantageKey]?.quantity ?? 0;
  const nextQuantity = currentQuantity + delta;

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

export async function claimMissionReward(roomId: string, playerId: string, missionKey: MissionKey) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const mission = getMissionDefinition(missionKey);

  if (!mission) {
    throw new Error('Missao nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const now = Date.now();
    const game = hydrateGameState(currentGame, players);
    const missionState = getPlayerMissionState(game, playerId);

    if (missionState.claimed[missionKey]) {
      throw new Error('Recompensa ja resgatada.');
    }

    if (!isMissionCompleted(game, playerId, mission)) {
      throw new Error('Complete a missao antes de resgatar.');
    }

    const claimed = {
      ...missionState.claimed,
      [missionKey]: now,
    };

    if (mission.reward.type === 'cash') {
      const finance = game.playerFinances[playerId];

      if (!finance) {
        throw new Error('Financas do jogador nao encontradas.');
      }

      const nextFinance = appendFinanceTransaction(
        {
          ...finance,
          balance: finance.balance + mission.reward.amount,
        },
        {
          kind: 'mission-reward',
          amount: mission.reward.amount,
          round: game.round,
          description: `Recompensa de missao: ${mission.title}`,
        },
        now,
      );

      return toFirebaseValue({
        ...game,
        playerMissions: {
          ...game.playerMissions,
          [playerId]: {
            ...missionState,
            claimed,
          },
        },
        playerFinances: {
          ...game.playerFinances,
          [playerId]: nextFinance,
        },
        updatedAt: now,
      });
    }

    const advantageState = getPlayerAdvantageState(game, playerId);

    return toFirebaseValue({
      ...game,
      playerMissions: {
        ...game.playerMissions,
        [playerId]: {
          ...missionState,
          claimed,
        },
      },
      playerAdvantages: {
        ...game.playerAdvantages,
        [playerId]: changeAdvantageQuantity(
          advantageState,
          mission.reward.advantageKey,
          mission.reward.quantity,
        ),
      },
      updatedAt: now,
    });
  });

  return update(ref(database, `rooms/${roomId}`), { updatedAt: Date.now() });
}
