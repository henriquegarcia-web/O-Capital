import {
  BOARD_SIZE,
  BOARD_SPACES_BY_INDEX,
  GAME_BALANCE,
  NEIGHBORHOODS,
  PROPERTY_BLUEPRINTS,
  START_SPACE_INDEX,
} from '@/constants';
import type {
  AdvantageKey,
  BuiltProperty,
  DiceRoll,
  GameState,
  Player,
  PlayerAdvantageState,
  PlayerFinance,
  PropertyBlueprint,
  RoundPending,
  TaxPending,
  TitleAuction,
  TitleOwnership,
} from '@/types';
import {
  calculatePortfolioValue,
  createInitialStockMarket,
  hydratePlayerStockPortfolio,
  hydrateStockMarket,
} from './stocks';

export const INITIAL_PLAYER_BALANCE = GAME_BALANCE.economy.initialPlayerBalance;
export const BANK_LOAN_INTEREST_RATE = GAME_BALANCE.bank.loanInterestRate;
export const BANK_LOAN_BASE_LIMIT = GAME_BALANCE.bank.loanBaseLimit;
export const BANK_LOAN_LIMIT_STEP = GAME_BALANCE.bank.loanLimitStep;
export const BANK_LOAN_LIMIT_PATRIMONY_STEP = GAME_BALANCE.bank.loanLimitPatrimonyStep;
export const BANK_LOAN_MIN_SCORE = GAME_BALANCE.bank.loanMinScore;
export const LOCALITY_BONUS_RATE = GAME_BALANCE.economy.localityBonusRate;
export const FEDERAL_TAX_REFUND_RATE = GAME_BALANCE.taxes.federalRefundRate;
export const FEDERAL_TAX_FINE_RATE = GAME_BALANCE.taxes.federalFineRate;
export const BANK_SETTLEMENT_DISCOUNT_RATE = GAME_BALANCE.bank.settlementDiscountRate;

export function getActivePlayers(players: Player[]) {
  return players.filter((player) => player.status !== 'eliminated');
}

export function calculateTitleAuctionDurationDays(players: Player[]) {
  return Math.max(1, getActivePlayers(players).length * 3);
}

export function getTitleAuctionProgress(auction: TitleAuction, currentDay: number) {
  const totalDays = Math.max(1, auction.durationDays);
  const elapsedDays = Math.max(0, currentDay - auction.openedAtDay);

  return {
    currentDay: Math.min(totalDays, elapsedDays + 1),
    totalDays,
    isExpired: currentDay >= auction.expiresAtDay,
  };
}

export function normalizePlayerOrder(players: Player[], playerOrder: string[] = []) {
  const activePlayerIds = new Set(getActivePlayers(players).map((player) => player.id));
  const orderedPlayers = playerOrder.filter((playerId) => activePlayerIds.has(playerId));
  const missingPlayers = getActivePlayers(players)
    .filter((player) => !orderedPlayers.includes(player.id))
    .sort((current, next) => current.joinedAt - next.joinedAt)
    .map((player) => player.id);

  return [...orderedPlayers, ...missingPlayers];
}

export function createInitialPlayerFinance(playerId: string, now = Date.now()): PlayerFinance {
  const transactionId = crypto.randomUUID();

  return {
    playerId,
    balance: INITIAL_PLAYER_BALANCE,
    debts: {},
    receivables: {},
    transactions: {
      [transactionId]: {
        id: transactionId,
        kind: 'initial-balance',
        amount: INITIAL_PLAYER_BALANCE,
        round: 1,
        description: 'Saldo inicial',
        createdAt: now,
      },
    },
    updatedAt: now,
  };
}

function hydratePlayerFinance(
  playerId: string,
  finance: PlayerFinance | undefined,
  now: number,
): PlayerFinance {
  if (!finance) {
    return createInitialPlayerFinance(playerId, now);
  }

  return {
    ...finance,
    playerId,
    balance: finance.balance ?? INITIAL_PLAYER_BALANCE,
    debts: finance.debts ?? {},
    receivables: finance.receivables ?? {},
    transactions: finance.transactions ?? {},
    updatedAt: finance.updatedAt ?? now,
  };
}

export function getInitialGameState(players: Player[], now = Date.now()): GameState {
  const playerOrder = normalizePlayerOrder(players);

  return {
    status: 'waiting',
    round: 1,
    day: 0,
    turnPlayerId: playerOrder[0] ?? null,
    turnStartedAt: null,
    playerOrder,
    positions: Object.fromEntries(playerOrder.map((playerId) => [playerId, START_SPACE_INDEX])),
    completedTurns: {},
    lastRoll: null,
    playerLastRolls: {},
    titles: {},
    playerFinances: Object.fromEntries(
      playerOrder.map((playerId) => [playerId, createInitialPlayerFinance(playerId, now)]),
    ),
    bankLoans: {},
    taxPendings: {},
    roundPendings: {},
    spaceActions: {},
    titleSaleOffers: {},
    titleAuctions: {},
    playerLoanOffers: {},
    playerAdvantages: {},
    playerMissions: {},
    playerRestrictions: {},
    stockMarket: createInitialStockMarket(0, now),
    playerStocks: Object.fromEntries(playerOrder.map((playerId) => [playerId, { holdings: {} }])),
    updatedAt: now,
  };
}

export function hydrateGameState(game: GameState | undefined, players: Player[]) {
  const now = Date.now();
  const baseGame = game ?? getInitialGameState(players, now);
  const playerOrder = normalizePlayerOrder(players, baseGame.playerOrder);
  const basePositions = baseGame.positions ?? {};
  const baseCompletedTurns = baseGame.completedTurns ?? {};
  const positions = Object.fromEntries(
    playerOrder.map((playerId) => [playerId, basePositions[playerId] ?? START_SPACE_INDEX]),
  );
  const completedTurns = Object.fromEntries(
    playerOrder.map((playerId) => [playerId, Boolean(baseCompletedTurns[playerId])]),
  );
  const playerFinances = Object.fromEntries(
    playerOrder.map((playerId) => [
      playerId,
      hydratePlayerFinance(playerId, baseGame.playerFinances?.[playerId], now),
    ]),
  );
  const day = baseGame.day ?? 0;
  const playerStocks = Object.fromEntries(
    playerOrder.map((playerId) => [
      playerId,
      hydratePlayerStockPortfolio(baseGame.playerStocks?.[playerId]),
    ]),
  );
  const turnPlayerId =
    baseGame.turnPlayerId && playerOrder.includes(baseGame.turnPlayerId)
      ? baseGame.turnPlayerId
      : (playerOrder[0] ?? null);
  const defaultAuctionDurationDays = calculateTitleAuctionDurationDays(players);
  const titleAuctions = Object.fromEntries(
    Object.entries(baseGame.titleAuctions ?? {}).map(([auctionId, auction]) => {
      const openedAtDay = auction.openedAtDay ?? day;
      const durationDays = auction.durationDays ?? defaultAuctionDurationDays;

      return [
        auctionId,
        {
          ...auction,
          openedAtDay,
          durationDays,
          expiresAtDay: auction.expiresAtDay ?? openedAtDay + durationDays,
        },
      ];
    }),
  );

  return {
    ...baseGame,
    day,
    playerOrder,
    positions,
    completedTurns,
    playerLastRolls: baseGame.playerLastRolls ?? {},
    titles: baseGame.titles ?? {},
    playerFinances,
    bankLoans: baseGame.bankLoans ?? {},
    taxPendings: baseGame.taxPendings ?? {},
    roundPendings: baseGame.roundPendings ?? {},
    spaceActions: baseGame.spaceActions ?? {},
    titleSaleOffers: baseGame.titleSaleOffers ?? {},
    titleAuctions,
    playerLoanOffers: baseGame.playerLoanOffers ?? {},
    playerAdvantages: baseGame.playerAdvantages ?? {},
    playerMissions: baseGame.playerMissions ?? {},
    playerRestrictions: baseGame.playerRestrictions ?? {},
    stockMarket: hydrateStockMarket(baseGame.stockMarket, day, now),
    playerStocks,
    turnPlayerId,
  };
}

export function moveBoardPosition(currentPosition: number, spacesToMove: number) {
  return ((((currentPosition - 1 + spacesToMove) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE) + 1;
}

export function advanceTurn(game: GameState, roll: DiceRoll) {
  const nextCompletedTurns = {
    ...game.completedTurns,
    [roll.playerId]: true,
  };
  const completedRound = game.playerOrder.every((playerId) => nextCompletedTurns[playerId]);
  const currentPlayerIndex = Math.max(0, game.playerOrder.indexOf(roll.playerId));
  const nextPlayerId =
    game.playerOrder.length > 0
      ? game.playerOrder[(currentPlayerIndex + 1) % game.playerOrder.length]
      : null;

  return {
    nextCompletedTurns: completedRound ? {} : nextCompletedTurns,
    nextRound: completedRound ? game.round + 1 : game.round,
    nextPlayerId,
  };
}

export function formatDiceRoll(roll?: DiceRoll | null) {
  if (!roll) {
    return 'Nenhuma jogada registrada';
  }

  return `${roll.diceOne} + ${roll.diceTwo} = ${roll.total}`;
}

export function getPlayerTitles(game: GameState, playerId: string) {
  return Object.values(game.titles ?? {}).filter((title) => title.ownerId === playerId);
}

export function getTitleLandValue(title: TitleOwnership) {
  return BOARD_SPACES_BY_INDEX[title.boardIndex]?.landValue ?? 0;
}

export function getBuiltPropertyValue(property: BuiltProperty) {
  return property.constructionCost;
}

export function calculatePlayerNetWorth(game: GameState, playerId: string) {
  return getPlayerTitles(game, playerId).reduce((total, title) => {
    const landValue = getTitleLandValue(title);
    const propertyValue = (title.properties ?? []).reduce(
      (subtotal, property) => subtotal + getBuiltPropertyValue(property),
      0,
    );

    return total + landValue + propertyValue;
  }, 0);
}

export function calculatePlayerFortune(game: GameState, playerId: string) {
  const finance = game.playerFinances[playerId];

  return (
    (finance?.balance ?? 0) +
    calculatePlayerNetWorth(game, playerId) +
    calculatePortfolioValue(game.playerStocks[playerId], game.stockMarket) +
    calculateReceivableTotal(finance) -
    calculateActiveDebtTotal(finance)
  );
}

export function getAdvantageDefinition(advantageKey: AdvantageKey) {
  return GAME_BALANCE.advantages.items.find((item) => item.key === advantageKey);
}

export function getPlayerAdvantageState(game: GameState, playerId: string): PlayerAdvantageState {
  return game.playerAdvantages?.[playerId] ?? { inventory: {} };
}

export function getAdvantageQuantity(
  game: GameState,
  playerId: string,
  advantageKey: AdvantageKey,
) {
  return getPlayerAdvantageState(game, playerId).inventory[advantageKey]?.quantity ?? 0;
}

export function hasAdvantage(game: GameState, playerId: string, advantageKey: AdvantageKey) {
  return getAdvantageQuantity(game, playerId, advantageKey) > 0;
}

export function canUseAdvantageThisRound(game: GameState, playerId: string) {
  return getPlayerAdvantageState(game, playerId).usedInRound !== game.round;
}

export function getActivePlayerRestriction(game: GameState, playerId: string) {
  return Object.values(game.playerRestrictions ?? {}).find(
    (restriction) => restriction.playerId === playerId && restriction.status === 'active',
  );
}

export function isPlayerActionBlocked(game: GameState, playerId: string) {
  return Boolean(getActivePlayerRestriction(game, playerId));
}

export function getPlayerSpaceVisitStartedAt(game: GameState, playerId: string) {
  return game.playerLastRolls?.[playerId]?.createdAt ?? null;
}

export function hasTitlePropertyActionInCurrentVisit(
  game: GameState,
  title: TitleOwnership | undefined,
  playerId: string,
) {
  return title?.lastPropertyActionVisitStartedAt === getPlayerSpaceVisitStartedAt(game, playerId);
}

export function calculateRestrictionFineAmount(game: GameState, playerId: string) {
  return Math.round(
    (calculatePlayerNetWorth(game, playerId) + (game.playerFinances[playerId]?.balance ?? 0)) *
      GAME_BALANCE.restrictions.releaseFineNetWorthRate,
  );
}

export function calculateFederalTaxAudit(game: GameState, playerId: string) {
  const propertyTotal = calculatePlayerNetWorth(game, playerId);
  const pendingTaxTotal = calculatePendingTaxTotal(game, playerId);

  return {
    propertyTotal,
    pendingTaxTotal,
    refundAmount: Math.round(propertyTotal * FEDERAL_TAX_REFUND_RATE),
    fineAmount: Math.round(pendingTaxTotal * FEDERAL_TAX_FINE_RATE),
  };
}

export function calculateBankSettlementAmount(amount: number) {
  return Math.round(amount * (1 - BANK_SETTLEMENT_DISCOUNT_RATE));
}

export function createSpaceActionKey(
  playerId: string,
  boardIndex: number,
  action: string,
  turnStartedAt: number | null,
) {
  return `${playerId}:${boardIndex}:${action}:${turnStartedAt ?? 'no-turn'}`;
}

export function hasCurrentSpaceAction(
  game: GameState,
  playerId: string,
  boardIndex: number,
  action: string,
) {
  return Boolean(
    game.spaceActions?.[createSpaceActionKey(playerId, boardIndex, action, game.turnStartedAt)],
  );
}

export function calculateTitleBuiltValue(title?: TitleOwnership) {
  return (title?.properties ?? []).reduce(
    (total, property) => total + getBuiltPropertyValue(property),
    0,
  );
}

export function calculatePlayerPropertyCount(game: GameState, playerId: string) {
  return getPlayerTitles(game, playerId).reduce(
    (total, title) => total + 1 + (title.properties ?? []).length,
    0,
  );
}

export function calculateActiveDebtTotal(finance?: PlayerFinance) {
  return Object.values(finance?.debts ?? {}).reduce(
    (total, debt) => total + (debt.status === 'active' ? debt.amount : 0),
    0,
  );
}

export function calculateReceivableTotal(finance?: PlayerFinance) {
  return Object.values(finance?.receivables ?? {}).reduce(
    (total, debt) => total + (debt.status === 'active' ? debt.amount : 0),
    0,
  );
}

export function calculatePlayerRoundIncome(game: GameState, playerId: string) {
  return getPlayerTitles(game, playerId).reduce(
    (total, title) => total + calculateTitleReceivables(title),
    0,
  );
}

function getTitleBonusTarget(title: TitleOwnership) {
  const boardSpace = BOARD_SPACES_BY_INDEX[title.boardIndex];

  if (!boardSpace?.neighborhoodKey) {
    return undefined;
  }

  return boardSpace.neighborhoodKey;
}

function getNeighborhoodBonusTarget(title: TitleOwnership) {
  const neighborhoodKey = getTitleBonusTarget(title);

  return neighborhoodKey
    ? NEIGHBORHOODS.find((neighborhood) => neighborhood.key === neighborhoodKey)?.bonusTarget
    : undefined;
}

function calculateTitleBaseReceivables(title: TitleOwnership) {
  return (title.properties ?? []).reduce((total, property) => {
    const blueprint = PROPERTY_BLUEPRINTS.find((item) => item.key === property.blueprintKey);

    return total + (blueprint?.dividendsPerRound ?? 0);
  }, 0);
}

function calculateTitleBaseRent(title: TitleOwnership) {
  return (title.properties ?? []).reduce((total, property) => {
    const blueprint = PROPERTY_BLUEPRINTS.find((item) => item.key === property.blueprintKey);

    return total + (blueprint?.category === 'real-estate' ? (blueprint.rent ?? 0) : 0);
  }, 0);
}

function calculateTitleLocalityBonusByTarget(
  title: TitleOwnership,
  target: 'real-estate' | 'business',
) {
  const bonusTarget = getNeighborhoodBonusTarget(title);

  if (bonusTarget !== target) {
    return 0;
  }

  return (title.properties ?? []).reduce((total, property) => {
    const blueprint = PROPERTY_BLUEPRINTS.find((item) => item.key === property.blueprintKey);

    if (!blueprint || blueprint.category !== target) {
      return total;
    }

    const baseValue =
      blueprint.category === 'real-estate'
        ? (blueprint.rent ?? 0)
        : (blueprint.dividendsPerRound ?? 0);

    return total + Math.round(baseValue * LOCALITY_BONUS_RATE);
  }, 0);
}

export function calculateTitleReceivablesLocalityBonus(title: TitleOwnership) {
  return calculateTitleLocalityBonusByTarget(title, 'business');
}

export function calculateTitleRentLocalityBonus(title: TitleOwnership) {
  return calculateTitleLocalityBonusByTarget(title, 'real-estate');
}

export function calculateTitleLocalityBonus(title: TitleOwnership) {
  return calculateTitleReceivablesLocalityBonus(title) + calculateTitleRentLocalityBonus(title);
}

export function calculateTitleReceivables(title: TitleOwnership) {
  return calculateTitleBaseReceivables(title) + calculateTitleReceivablesLocalityBonus(title);
}

export function calculateTitleRent(title: TitleOwnership) {
  return calculateTitleBaseRent(title) + calculateTitleRentLocalityBonus(title);
}

export function calculatePlayerRentIncome(game: GameState, playerId: string) {
  return getPlayerTitles(game, playerId).reduce(
    (total, title) => total + calculateTitleRent(title),
    0,
  );
}

export function calculateTitleMaintenance(title: TitleOwnership) {
  const baseValue = getTitleLandValue(title) + calculateTitleBuiltValue(title);

  return Math.round(baseValue * GAME_BALANCE.economy.titleMaintenanceRate);
}

export function calculatePlayerRoundExpenses(game: GameState, playerId: string) {
  return getPlayerTitles(game, playerId).reduce(
    (total, title) => total + calculateTitleMaintenance(title),
    0,
  );
}

export function calculateCreditLimit(game: GameState, playerId: string) {
  const netWorth = calculatePlayerNetWorth(game, playerId);

  return (
    BANK_LOAN_BASE_LIMIT +
    Math.floor(netWorth / BANK_LOAN_LIMIT_PATRIMONY_STEP) * BANK_LOAN_LIMIT_STEP
  );
}

export function calculateScoreFromDebt(game: GameState, playerId: string, totalDebt: number) {
  const creditLimit = calculateCreditLimit(game, playerId);

  if (creditLimit <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(
      GAME_BALANCE.bank.score.max - (totalDebt / creditLimit) * GAME_BALANCE.bank.score.max,
    ),
  );
}

export function calculateBankScore(game: GameState, playerId: string) {
  const finance = game.playerFinances[playerId];

  return calculateScoreFromDebt(game, playerId, calculateActiveDebtTotal(finance));
}

export function calculateLoanDebtAmount(amount: number, interestRate = BANK_LOAN_INTEREST_RATE) {
  return Math.round(amount * (1 + interestRate));
}

export function calculateProjectedBankScore(
  game: GameState,
  playerId: string,
  additionalDebtAmount: number,
) {
  const finance = game.playerFinances[playerId];

  return calculateScoreFromDebt(
    game,
    playerId,
    calculateActiveDebtTotal(finance) + additionalDebtAmount,
  );
}

export function getBankScoreLabel(score: number) {
  return (
    GAME_BALANCE.bank.score.labels.find((item) => score >= item.min)?.label ??
    GAME_BALANCE.bank.score.labels[GAME_BALANCE.bank.score.labels.length - 1].label
  );
}

export function calculateTitleTax(game: GameState, title: TitleOwnership) {
  const landValue = getTitleLandValue(title);

  return (title.properties ?? []).reduce((total, property) => {
    const blueprint = PROPERTY_BLUEPRINTS.find((item) => item.key === property.blueprintKey);
    const taxRate = blueprint?.taxRate ?? 0;

    return total + (landValue + property.constructionCost) * taxRate;
  }, 0);
}

export function isPlayerOnBankSpace(game: GameState, playerId: string) {
  const position = game.positions[playerId];

  return BOARD_SPACES_BY_INDEX[position]?.kind === 'bank';
}

export function getTaxPendingPayableAmount(game: GameState, playerId: string, tax: TaxPending) {
  return isPlayerOnBankSpace(game, playerId) &&
    game.status === 'playing' &&
    game.turnPlayerId === playerId
    ? calculateBankSettlementAmount(tax.amount)
    : tax.amount;
}

export function calculatePendingTaxTotal(game: GameState, playerId: string) {
  return Object.values(game.taxPendings ?? {}).reduce(
    (total, tax) =>
      total + (tax.playerId === playerId && tax.status === 'pending' ? tax.amount : 0),
    0,
  );
}

export function calculateTitleBankSaleValue(game: GameState, title: TitleOwnership) {
  const baseValue = getTitleLandValue(title) + calculateTitleBuiltValue(title);

  return Math.round(
    baseValue *
      Math.pow(
        1 + GAME_BALANCE.economy.titleBankSaleGrowthRatePerRound,
        Math.max(0, game.round - 1),
      ),
  );
}

export function didPassStart(currentPosition: number, nextPosition: number, spacesToMove: number) {
  return (
    spacesToMove > 0 &&
    currentPosition + spacesToMove > BOARD_SIZE &&
    nextPosition !== currentPosition
  );
}

export function createLapPendings(game: GameState, playerId: string, now = Date.now()) {
  const existingPendingForRound = Object.values(game.roundPendings ?? {}).some(
    (pending) => pending.playerId === playerId && pending.round === game.round,
  );

  if (existingPendingForRound) {
    return {
      roundPendings: game.roundPendings,
      taxPendings: game.taxPendings,
    };
  }

  const playerTitles = getPlayerTitles(game, playerId);
  const receivables = calculatePlayerRoundIncome(game, playerId);
  const maintenance = calculatePlayerRoundExpenses(game, playerId);
  const originalTaxes = playerTitles.reduce(
    (total, title) => total + Math.round(calculateTitleTax(game, title)),
    0,
  );
  const taxReduction = getPlayerAdvantageState(game, playerId).taxReduction;
  const taxDiscount = taxReduction?.remainingPasses
    ? Math.round(originalTaxes * taxReduction.discountRate)
    : 0;
  const taxes = Math.max(0, originalTaxes - taxDiscount);
  const netAmount = receivables - maintenance - taxes;

  if (receivables <= 0 && maintenance <= 0 && taxes <= 0) {
    return {
      roundPendings: game.roundPendings,
      taxPendings: game.taxPendings,
    };
  }

  const id = crypto.randomUUID();
  const roundPending: RoundPending = {
    id,
    playerId,
    kind: 'statement',
    amount: Math.abs(netAmount),
    round: game.round,
    titleRefs: playerTitles.map((title) => title.boardIndex),
    breakdown: {
      receivables,
      maintenance,
      taxes,
      netAmount,
      originalTaxes,
      taxDiscount,
      taxReductionAdvantageId: taxDiscount > 0 ? taxReduction?.id : undefined,
    },
    status: 'pending',
    createdAt: now,
  };

  return {
    roundPendings: {
      ...game.roundPendings,
      [id]: roundPending,
    },
    taxPendings: game.taxPendings,
  };
}

export function getNextRealEstateBlueprint(properties: BuiltProperty[] = []) {
  const realEstateLevels = properties
    .map((property) =>
      PROPERTY_BLUEPRINTS.find((blueprint) => blueprint.key === property.blueprintKey),
    )
    .filter((blueprint): blueprint is PropertyBlueprint => blueprint?.category === 'real-estate')
    .map((blueprint) => blueprint.level ?? 0);
  const nextLevel = realEstateLevels.length === 0 ? 1 : Math.max(...realEstateLevels) + 1;

  return Object.values(PROPERTY_BLUEPRINTS).find(
    (blueprint) => blueprint.category === 'real-estate' && blueprint.level === nextLevel,
  );
}

export function getTitlePropertySlots(
  properties: BuiltProperty[] = [],
  slotCount: number = GAME_BALANCE.board.defaultPropertySlots,
) {
  const slots: Array<BuiltProperty | null> = Array.from({ length: slotCount }, () => null);

  properties.forEach((property) => {
    const preferredSlot =
      typeof property.slotIndex === 'number' &&
      property.slotIndex >= 0 &&
      property.slotIndex < slotCount
        ? property.slotIndex
        : slots.findIndex((slot) => !slot);

    if (preferredSlot >= 0 && !slots[preferredSlot]) {
      slots[preferredSlot] = property;
    }
  });

  return slots;
}

export function getNextRealEstateBlueprintForSlot(property?: BuiltProperty | null) {
  const currentBlueprint = property
    ? PROPERTY_BLUEPRINTS.find((blueprint) => blueprint.key === property.blueprintKey)
    : undefined;
  const nextLevel =
    currentBlueprint?.category === 'real-estate' ? (currentBlueprint.level ?? 0) + 1 : 1;

  return PROPERTY_BLUEPRINTS.find(
    (blueprint) => blueprint.category === 'real-estate' && blueprint.level === nextLevel,
  );
}

export function getAvailableBlueprintsForPropertySlot(property?: BuiltProperty | null) {
  const currentBlueprint = property
    ? PROPERTY_BLUEPRINTS.find((blueprint) => blueprint.key === property.blueprintKey)
    : undefined;

  if (currentBlueprint?.category === 'business') {
    return [];
  }

  const nextRealEstateBlueprint = getNextRealEstateBlueprintForSlot(property);

  if (currentBlueprint?.category === 'real-estate') {
    return nextRealEstateBlueprint ? [nextRealEstateBlueprint] : [];
  }

  return [
    nextRealEstateBlueprint,
    ...PROPERTY_BLUEPRINTS.filter((blueprint) => blueprint.category === 'business'),
  ].filter((blueprint): blueprint is PropertyBlueprint => Boolean(blueprint));
}
