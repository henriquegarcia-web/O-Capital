import {
  BOARD_SIZE,
  BOARD_SPACES_BY_INDEX,
  PROPERTY_BLUEPRINTS,
  START_SPACE_INDEX,
} from '@/constants';
import type {
  BuiltProperty,
  DiceRoll,
  GameState,
  Player,
  PlayerFinance,
  PropertyBlueprint,
  RoundPending,
  TaxPending,
  TitleOwnership,
} from '@/types';

export const INITIAL_PLAYER_BALANCE = 10000;
export const BANK_LOAN_INTEREST_RATE = 0.2;
export const BANK_LOAN_BASE_LIMIT = 5000;
export const BANK_LOAN_LIMIT_STEP = 1000;
export const BANK_LOAN_LIMIT_PATRIMONY_STEP = 5000;
export const BANK_LOAN_MIN_SCORE = 50;

export function getActivePlayers(players: Player[]) {
  return players.filter((player) => player.status !== 'eliminated');
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
    titleSaleOffers: {},
    titleAuctions: {},
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
  const turnPlayerId =
    baseGame.turnPlayerId && playerOrder.includes(baseGame.turnPlayerId)
      ? baseGame.turnPlayerId
      : (playerOrder[0] ?? null);

  return {
    ...baseGame,
    playerOrder,
    positions,
    completedTurns,
    playerLastRolls: baseGame.playerLastRolls ?? {},
    titles: baseGame.titles ?? {},
    playerFinances,
    bankLoans: baseGame.bankLoans ?? {},
    taxPendings: baseGame.taxPendings ?? {},
    roundPendings: baseGame.roundPendings ?? {},
    titleSaleOffers: baseGame.titleSaleOffers ?? {},
    titleAuctions: baseGame.titleAuctions ?? {},
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
  return getPlayerTitles(game, playerId).reduce((total, title) => {
    const income = (title.properties ?? []).reduce((subtotal, property) => {
      const blueprint = PROPERTY_BLUEPRINTS.find((item) => item.key === property.blueprintKey);

      return subtotal + (blueprint?.dividendsPerRound ?? 0);
    }, 0);

    return total + income;
  }, 0);
}

export function calculatePlayerRoundExpenses(
  game: GameState,
  playerId: string,
  round = game.round,
) {
  return getPlayerTitles(game, playerId).reduce((total, title) => {
    const maintenance = (title.properties ?? []).reduce((subtotal, property) => {
      const blueprint = PROPERTY_BLUEPRINTS.find((item) => item.key === property.blueprintKey);

      if (!blueprint || round <= property.acquiredAtRound) {
        return subtotal;
      }

      const due =
        blueprint.maintenanceIntervalRounds > 0 &&
        (round - property.acquiredAtRound) % blueprint.maintenanceIntervalRounds === 0;

      return subtotal + (due ? blueprint.maintenanceCost : 0);
    }, 0);

    return total + maintenance;
  }, 0);
}

export function calculateCreditLimit(game: GameState, playerId: string) {
  const netWorth = calculatePlayerNetWorth(game, playerId);

  return (
    BANK_LOAN_BASE_LIMIT +
    Math.floor(netWorth / BANK_LOAN_LIMIT_PATRIMONY_STEP) * BANK_LOAN_LIMIT_STEP
  );
}

export function calculateBankScore(game: GameState, playerId: string) {
  const finance = game.playerFinances[playerId];
  const creditLimit = calculateCreditLimit(game, playerId);
  const totalDebt = calculateActiveDebtTotal(finance);

  if (creditLimit <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(100 - (totalDebt / creditLimit) * 100));
}

export function getBankScoreLabel(score: number) {
  if (score >= 81) return 'Excelente';
  if (score >= 61) return 'Boa';
  if (score >= 41) return 'Atencao';
  if (score >= 26) return 'Risco';
  if (score >= 11) return 'Critico';
  if (score >= 1) return 'Pre-falencia';

  return 'Falencia';
}

export function calculateTitleTax(game: GameState, title: TitleOwnership) {
  const landValue = getTitleLandValue(title);

  return (title.properties ?? []).reduce((total, property) => {
    const blueprint = PROPERTY_BLUEPRINTS.find((item) => item.key === property.blueprintKey);
    const taxRate = blueprint?.taxRate ?? 0;

    return total + (landValue + property.constructionCost) * taxRate;
  }, 0);
}

export function calculateTitleBankSaleValue(game: GameState, title: TitleOwnership) {
  const baseValue = getTitleLandValue(title) + calculateTitleBuiltValue(title);

  return Math.round(baseValue * Math.pow(1.02, Math.max(0, game.round - 1)));
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
  const dividendTitles = playerTitles.filter((title) =>
    (title.properties ?? []).some((property) => {
      const blueprint = PROPERTY_BLUEPRINTS.find((item) => item.key === property.blueprintKey);

      return (blueprint?.dividendsPerRound ?? 0) > 0;
    }),
  );
  const taxItems = playerTitles
    .map((title) => {
      const amount = Math.round(calculateTitleTax(game, title));
      const boardSpace = BOARD_SPACES_BY_INDEX[title.boardIndex];

      if (amount <= 0) {
        return null;
      }

      const id = crypto.randomUUID();
      const taxPending: TaxPending = {
        id,
        playerId,
        boardIndex: title.boardIndex,
        titleName: boardSpace?.streetName ?? boardSpace?.name ?? `Titulo ${title.boardIndex}`,
        amount,
        discountedAmount: Math.round(amount * 0.95),
        round: game.round,
        status: 'pending',
        createdAt: now,
      };

      return taxPending;
    })
    .filter((item): item is TaxPending => Boolean(item));
  const nextTaxPendings = {
    ...game.taxPendings,
    ...Object.fromEntries(taxItems.map((item) => [item.id, item])),
  };
  const roundPendings = [
    {
      kind: 'dividends' as const,
      amount: calculatePlayerRoundIncome(game, playerId),
      titleRefs: dividendTitles.map((title) => title.boardIndex),
    },
    {
      kind: 'maintenance' as const,
      amount: calculatePlayerRoundExpenses(game, playerId),
      titleRefs: playerTitles.map((title) => title.boardIndex),
    },
    {
      kind: 'taxes' as const,
      amount: taxItems.reduce((total, item) => total + item.amount, 0),
      titleRefs: taxItems.map((item) => item.boardIndex),
    },
  ]
    .filter((item) => item.amount > 0)
    .map((item): RoundPending => {
      const id = crypto.randomUUID();

      return {
        id,
        playerId,
        kind: item.kind,
        amount: item.amount,
        round: game.round,
        titleRefs: item.titleRefs,
        status: 'pending',
        createdAt: now,
      };
    });

  return {
    roundPendings: {
      ...game.roundPendings,
      ...Object.fromEntries(roundPendings.map((pending) => [pending.id, pending])),
    },
    taxPendings: nextTaxPendings,
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
