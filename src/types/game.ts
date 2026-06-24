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

export type BuiltProperty = {
  id: string;
  blueprintKey: string;
  optionName?: string;
  category: PropertyCategory;
  slotIndex?: number;
  constructionCost: number;
  acquiredAtRound: number;
  acquiredAt: number;
};

export type PlayerDebtStatus = 'active' | 'paid' | 'forgiven';
export type PlayerDebtKind = 'rent' | 'bank' | 'tax' | 'maintenance' | 'player-loan' | 'round-fees';

export type PlayerDebt = {
  id: string;
  kind: PlayerDebtKind;
  creditorId: string | null;
  debtorId: string;
  amount: number;
  originalAmount: number;
  interestRate?: number;
  createdAtRound?: number;
  sourceId?: string;
  boardIndex?: number;
  description: string;
  status: PlayerDebtStatus;
  createdAt: number;
  updatedAt: number;
};

export type PlayerTransactionKind =
  | 'initial-balance'
  | 'bank-credit'
  | 'bank-debit'
  | 'bank-loan'
  | 'player-loan-sent'
  | 'player-loan-received'
  | 'debt-payment'
  | 'debt-received'
  | 'debt-forgiven'
  | 'tax-payment'
  | 'tax-refund'
  | 'round-income'
  | 'maintenance-payment'
  | 'round-statement'
  | 'title-bank-sale'
  | 'title-player-sale'
  | 'title-player-purchase'
  | 'title-purchase'
  | 'property-build'
  | 'property-destroy'
  | 'rent-paid'
  | 'rent-received'
  | 'debt-created'
  | 'event';

export type PlayerTransaction = {
  id: string;
  kind: PlayerTransactionKind;
  amount: number;
  round: number;
  description: string;
  createdAt: number;
  relatedPlayerId?: string;
  boardIndex?: number;
};

export type PlayerFinance = {
  playerId: string;
  balance: number;
  debts: Record<string, PlayerDebt>;
  receivables: Record<string, PlayerDebt>;
  transactions: Record<string, PlayerTransaction>;
  updatedAt: number;
};

export type TitleOwnership = {
  boardIndex: number;
  ownerId: string | null;
  acquiredAtRound?: number;
  properties?: BuiltProperty[];
  lastPropertyPurchaseRound?: number;
  lastPropertyActionRound?: number;
  lastPropertyActionTurnStartedAt?: number | null;
};

export type TaxPendingStatus = 'pending' | 'paid';

export type TaxPending = {
  id: string;
  playerId: string;
  boardIndex: number;
  titleName: string;
  amount: number;
  discountedAmount: number;
  round: number;
  status: TaxPendingStatus;
  createdAt: number;
  paidAt?: number;
};

export type RoundPendingStatus = 'pending' | 'confirmed';
export type RoundPendingKind =
  | 'dividends'
  | 'maintenance'
  | 'taxes'
  | 'statement'
  | 'rent'
  | 'event'
  | 'global-event';
export type EventTone = 'luck' | 'setback';

export type RoundPending = {
  id: string;
  playerId: string;
  kind: RoundPendingKind;
  amount: number;
  round: number;
  titleRefs?: number[];
  relatedPlayerId?: string;
  affectedPlayerIds?: string[];
  boardIndex?: number;
  message?: string;
  eventTone?: EventTone;
  breakdown?: {
    receivables: number;
    maintenance: number;
    taxes: number;
    netAmount: number;
  };
  status: RoundPendingStatus;
  createdAt: number;
  confirmedAt?: number;
};

export type BankLoanStatus = 'active' | 'paid';

export type BankLoan = {
  id: string;
  playerId: string;
  debtId: string;
  principal: number;
  interestRate: number;
  status: BankLoanStatus;
  createdAtRound: number;
  createdAt: number;
  paidAt?: number;
};

export type TitleSaleOfferStatus = 'pending' | 'accepted' | 'cancelled';

export type TitleSaleOffer = {
  id: string;
  boardIndex: number;
  sellerId: string;
  buyerId: string;
  amount: number;
  status: TitleSaleOfferStatus;
  createdAt: number;
  acceptedAt?: number;
  cancelledAt?: number;
};

export type TitleAuctionStatus = 'open' | 'closed' | 'cancelled';

export type TitleAuctionBid = {
  id: string;
  bidderId: string;
  amount: number;
  createdAt: number;
};

export type TitleAuction = {
  id: string;
  boardIndex: number;
  sellerId: string;
  initialBid: number;
  highestBidId?: string;
  status: TitleAuctionStatus;
  bids: Record<string, TitleAuctionBid>;
  createdAt: number;
  closedAt?: number;
  cancelledAt?: number;
};

export type PlayerLoanOfferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type PlayerLoanOffer = {
  id: string;
  borrowerId: string;
  lenderId: string;
  amount: number;
  status: PlayerLoanOfferStatus;
  createdAt: number;
  acceptedAt?: number;
  declinedAt?: number;
  cancelledAt?: number;
  debtId?: string;
};

export type BoardSpaceAction = {
  id: string;
  playerId: string;
  boardIndex: number;
  action: string;
  turnStartedAt: number | null;
  round: number;
  createdAt: number;
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
  playerFinances: Record<string, PlayerFinance>;
  bankLoans: Record<string, BankLoan>;
  taxPendings: Record<string, TaxPending>;
  roundPendings: Record<string, RoundPending>;
  spaceActions: Record<string, BoardSpaceAction>;
  titleSaleOffers: Record<string, TitleSaleOffer>;
  titleAuctions: Record<string, TitleAuction>;
  playerLoanOffers: Record<string, PlayerLoanOffer>;
  startedAt?: number;
  pausedAt?: number;
  finishedAt?: number;
  updatedAt: number;
};
