import { BOARD_SPACES_BY_INDEX, PROPERTY_BLUEPRINTS } from '@/constants';
import type {
  AdvantageKey,
  GameState,
  MissionCategoryKey,
  MissionKey,
  PlayerMissionState,
  PlayerTransactionKind,
} from '@/types';
import { calculatePlayerFortune, getPlayerTitles } from './game';

export type MissionReward =
  | {
      type: 'cash';
      amount: number;
    }
  | {
      type: 'advantage';
      advantageKey: AdvantageKey;
      quantity: number;
    };

export type MissionDefinition = {
  key: MissionKey;
  category: MissionCategoryKey;
  title: string;
  reward: MissionReward;
  target: number;
  progress: (game: GameState, playerId: string) => number;
};

export const MISSION_CATEGORY_LABELS: Record<MissionCategoryKey, string> = {
  initial: 'Missoes Iniciais',
  economic: 'Missoes Economicas',
  advanced: 'Missoes Avancadas',
};

const MISSION_CATEGORIES: MissionCategoryKey[] = ['initial', 'economic', 'advanced'];

function countTransactions(game: GameState, playerId: string, kinds: PlayerTransactionKind[]) {
  const finance = game.playerFinances[playerId];

  return Object.values(finance?.transactions ?? {}).filter((transaction) =>
    kinds.includes(transaction.kind),
  ).length;
}

function hasTransaction(game: GameState, playerId: string, kinds: PlayerTransactionKind[]) {
  return countTransactions(game, playerId, kinds) > 0 ? 1 : 0;
}

function countOwnedTitlesByNeighborhood(game: GameState, playerId: string) {
  const counts = getPlayerTitles(game, playerId).reduce<Record<string, number>>((acc, title) => {
    const neighborhoodKey = BOARD_SPACES_BY_INDEX[title.boardIndex]?.neighborhoodKey;

    if (!neighborhoodKey) return acc;

    return {
      ...acc,
      [neighborhoodKey]: (acc[neighborhoodKey] ?? 0) + 1,
    };
  }, {});

  return Math.max(0, ...Object.values(counts));
}

function countBuiltPropertiesByPredicate(
  game: GameState,
  playerId: string,
  predicate: (blueprintKey: string) => boolean,
) {
  return getPlayerTitles(game, playerId).reduce(
    (total, title) =>
      total +
      (title.properties ?? []).filter((property) => predicate(property.blueprintKey)).length,
    0,
  );
}

function countHotels(game: GameState, playerId: string) {
  return countBuiltPropertiesByPredicate(game, playerId, (blueprintKey) => blueprintKey === 'hotel');
}

function countBusinesses(game: GameState, playerId: string) {
  return countBuiltPropertiesByPredicate(game, playerId, (blueprintKey) => {
    const blueprint = PROPERTY_BLUEPRINTS.find((item) => item.key === blueprintKey);

    return blueprint?.category === 'business';
  });
}

export const MISSION_DEFINITIONS: MissionDefinition[] = [
  {
    key: 'first-title',
    category: 'initial',
    title: 'Comprar o primeiro terreno',
    reward: { type: 'cash', amount: 5000 },
    target: 1,
    progress: (game, playerId) => hasTransaction(game, playerId, ['title-purchase']),
  },
  {
    key: 'first-property',
    category: 'initial',
    title: 'Construir a primeira propriedade',
    reward: { type: 'cash', amount: 10000 },
    target: 1,
    progress: (game, playerId) => hasTransaction(game, playerId, ['property-build']),
  },
  {
    key: 'first-rent',
    category: 'initial',
    title: 'Receber o primeiro aluguel',
    reward: { type: 'cash', amount: 5000 },
    target: 1,
    progress: (game, playerId) => hasTransaction(game, playerId, ['rent-received']),
  },
  {
    key: 'first-investment',
    category: 'initial',
    title: 'Fazer o primeiro investimento',
    reward: { type: 'cash', amount: 5000 },
    target: 1,
    progress: (game, playerId) => hasTransaction(game, playerId, ['stock-buy']),
  },
  {
    key: 'fortune-100k',
    category: 'economic',
    title: 'Atingir 100.000 de fortuna',
    reward: { type: 'advantage', advantageKey: 'fiscal-protection', quantity: 1 },
    target: 100000,
    progress: calculatePlayerFortune,
  },
  {
    key: 'fortune-250k',
    category: 'economic',
    title: 'Atingir 250.000 de fortuna',
    reward: { type: 'advantage', advantageKey: 'rent-insurance', quantity: 1 },
    target: 250000,
    progress: calculatePlayerFortune,
  },
  {
    key: 'fortune-500k',
    category: 'economic',
    title: 'Atingir 500.000 de fortuna',
    reward: { type: 'advantage', advantageKey: 'tax-reduction', quantity: 1 },
    target: 500000,
    progress: calculatePlayerFortune,
  },
  {
    key: 'sell-title-player',
    category: 'advanced',
    title: 'Vender um titulo para outro jogador',
    reward: { type: 'advantage', advantageKey: 'fiscal-protection', quantity: 1 },
    target: 1,
    progress: (game, playerId) => hasTransaction(game, playerId, ['title-player-sale']),
  },
  {
    key: 'buy-title-player',
    category: 'advanced',
    title: 'Comprar um titulo de outro jogador',
    reward: { type: 'advantage', advantageKey: 'rent-insurance', quantity: 1 },
    target: 1,
    progress: (game, playerId) => hasTransaction(game, playerId, ['title-player-purchase']),
  },
  {
    key: 'three-streets-neighborhood',
    category: 'advanced',
    title: 'Comprar 3 ruas do mesmo bairro',
    reward: { type: 'advantage', advantageKey: 'tax-reduction', quantity: 1 },
    target: 3,
    progress: countOwnedTitlesByNeighborhood,
  },
  {
    key: 'five-hotels',
    category: 'advanced',
    title: 'Construir 5 hoteis',
    reward: { type: 'advantage', advantageKey: 'force-auction', quantity: 1 },
    target: 5,
    progress: countHotels,
  },
  {
    key: 'five-businesses',
    category: 'advanced',
    title: 'Construir 5 empreendimentos',
    reward: { type: 'advantage', advantageKey: 'force-auction', quantity: 1 },
    target: 5,
    progress: countBusinesses,
  },
];

export const MISSIONS_BY_CATEGORY = MISSION_CATEGORIES.map((category) => ({
  key: category,
  label: MISSION_CATEGORY_LABELS[category],
  missions: MISSION_DEFINITIONS.filter((mission) => mission.category === category),
}));

export function getMissionDefinition(missionKey: MissionKey) {
  return MISSION_DEFINITIONS.find((mission) => mission.key === missionKey);
}

export function getPlayerMissionState(game: GameState, playerId: string): PlayerMissionState {
  return game.playerMissions?.[playerId] ?? { claimed: {} };
}

export function getMissionProgress(
  game: GameState,
  playerId: string,
  mission: MissionDefinition,
) {
  return Math.max(0, mission.progress(game, playerId));
}

export function isMissionCompleted(
  game: GameState,
  playerId: string,
  mission: MissionDefinition,
) {
  return getMissionProgress(game, playerId, mission) >= mission.target;
}

export function isMissionClaimed(game: GameState, playerId: string, missionKey: MissionKey) {
  return Boolean(getPlayerMissionState(game, playerId).claimed[missionKey]);
}
