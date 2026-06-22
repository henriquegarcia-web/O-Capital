export type BoardSpaceKind =
  | 'start'
  | 'street'
  | 'event'
  | 'global-event'
  | 'bank'
  | 'tax'
  | 'advantage-market'
  | 'fiscal-embargo'
  | 'bank-block'
  | 'holiday';

export type PropertyCategory = 'real-estate' | 'business';
export type NeighborhoodBonusTarget = 'real-estate' | 'business';

export type PropertyBlueprint = {
  key: string;
  name: string;
  category: PropertyCategory;
  level?: number;
  constructionCost: number;
  maintenanceCost: number;
  maintenanceIntervalRounds: number;
  rent?: number;
  dividendsPerRound?: number;
  taxRate: number;
  options?: string[];
};

export type Neighborhood = {
  key: string;
  name: string;
  color: string;
  bonusTarget: NeighborhoodBonusTarget;
};

export type BoardSpace = {
  index: number;
  name: string;
  kind: BoardSpaceKind;
  color: string;
  neighborhoodKey?: string;
  streetName?: string;
  landValue?: number;
  propertySlots?: number;
  notes?: string;
};

export type DiceRoll = {
  playerId: string;
  diceOne: number;
  diceTwo: number;
  total: number;
  createdAt: number;
};

export type TitleOwnership = {
  boardIndex: number;
  ownerId: string | null;
  acquiredAtRound?: number;
  properties?: Array<{
    blueprintKey: string;
    acquiredAtRound: number;
  }>;
};

export type GameStatus = 'waiting' | 'playing' | 'paused' | 'finished';

export type GameState = {
  status: GameStatus;
  round: number;
  turnPlayerId: string | null;
  turnStartedAt: number | null;
  playerOrder: string[];
  positions: Record<string, number>;
  completedTurns: Record<string, boolean>;
  lastRoll: DiceRoll | null;
  playerLastRolls: Record<string, DiceRoll>;
  titles: Record<string, TitleOwnership>;
  startedAt?: number;
  pausedAt?: number;
  finishedAt?: number;
  updatedAt: number;
};
