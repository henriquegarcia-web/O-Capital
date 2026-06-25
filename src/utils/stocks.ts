import type {
  GameState,
  PlayerStockPortfolio,
  StockKey,
  StockMarketAsset,
  StockPricePoint,
  StockRisk,
} from '@/types';

export type StockDefinition = {
  key: StockKey;
  name: string;
  ticker: string;
  risk: StockRisk;
  behavior: string;
  basePrice: number;
  drift: number;
  volatility: number;
  shockChance: number;
  shockVolatility: number;
  minDailyChange: number;
  maxDailyChange: number;
};

export const STOCK_DEFINITIONS: StockDefinition[] = [
  {
    key: 'gold11',
    name: 'Ouro',
    ticker: 'GOLD11',
    risk: 'low',
    behavior: 'Cresce pouco e cai pouco',
    basePrice: 120,
    drift: 0.0012,
    volatility: 0.012,
    shockChance: 0.02,
    shockVolatility: 0.018,
    minDailyChange: -0.022,
    maxDailyChange: 0.026,
  },
  {
    key: 'bbas3',
    name: 'Banco do Brasil',
    ticker: 'BBAS3',
    risk: 'medium',
    behavior: 'Oscilacao aleatoria com tendencia de valorizacao',
    basePrice: 58,
    drift: 0.004,
    volatility: 0.038,
    shockChance: 0.08,
    shockVolatility: 0.05,
    minDailyChange: -0.072,
    maxDailyChange: 0.09,
  },
  {
    key: 'petr4',
    name: 'Petrobras',
    ticker: 'PETR4',
    risk: 'medium',
    behavior: 'Oscilacao aleatoria com tendencia de valorizacao',
    basePrice: 42,
    drift: 0.0045,
    volatility: 0.046,
    shockChance: 0.1,
    shockVolatility: 0.06,
    minDailyChange: -0.086,
    maxDailyChange: 0.105,
  },
  {
    key: 'btc',
    name: 'Bitcoin',
    ticker: 'BTC',
    risk: 'high',
    behavior: 'Grandes picos e grandes quedas',
    basePrice: 250,
    drift: 0.0025,
    volatility: 0.105,
    shockChance: 0.2,
    shockVolatility: 0.22,
    minDailyChange: -0.32,
    maxDailyChange: 0.38,
  },
];

export const STOCK_DEFINITIONS_BY_KEY = Object.fromEntries(
  STOCK_DEFINITIONS.map((stock) => [stock.key, stock]),
) as Record<StockKey, StockDefinition>;

export const STOCK_HISTORY_LIMIT = 30;

export const STOCK_RISK_LABELS: Record<StockRisk, string> = {
  low: 'Baixo',
  medium: 'Medio',
  high: 'Alto',
};

export const STOCK_RISK_COLORS: Record<StockRisk, string> = {
  low: 'green',
  medium: 'gold',
  high: 'red',
};

function seededUnit(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0) / 4294967295;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundMoney(value: number) {
  return Math.max(1, Math.round(value));
}

function createStockAsset(definition: StockDefinition, day: number, now: number): StockMarketAsset {
  return {
    key: definition.key,
    price: definition.basePrice,
    previousPrice: definition.basePrice,
    history: {
      [day]: {
        day,
        price: definition.basePrice,
        createdAt: now,
      },
    },
    updatedAtDay: day,
  };
}

export function createInitialStockMarket(day = 1, now = Date.now()) {
  return Object.fromEntries(
    STOCK_DEFINITIONS.map((definition) => [definition.key, createStockAsset(definition, day, now)]),
  ) as Record<StockKey, StockMarketAsset>;
}

export function hydrateStockMarket(
  stockMarket: GameState['stockMarket'] | undefined,
  day = 1,
  now = Date.now(),
) {
  return Object.fromEntries(
    STOCK_DEFINITIONS.map((definition) => {
      const currentAsset = stockMarket?.[definition.key];
      const fallbackAsset = createStockAsset(definition, day, now);

      return [
        definition.key,
        {
          ...fallbackAsset,
          ...currentAsset,
          key: definition.key,
          previousPrice: currentAsset?.previousPrice ?? currentAsset?.price ?? definition.basePrice,
          history: currentAsset?.history ?? fallbackAsset.history,
          updatedAtDay: currentAsset?.updatedAtDay ?? day,
        },
      ];
    }),
  ) as Record<StockKey, StockMarketAsset>;
}

export function hydratePlayerStockPortfolio(
  portfolio: PlayerStockPortfolio | undefined,
): PlayerStockPortfolio {
  return {
    holdings: portfolio?.holdings ?? {},
  };
}

function calculateNextStockPrice(
  asset: StockMarketAsset,
  definition: StockDefinition,
  day: number,
) {
  const noise = seededUnit(`${definition.key}:${day}:noise`) * 2 - 1;
  const shockRoll = seededUnit(`${definition.key}:${day}:shock`);
  const shockDirection = seededUnit(`${definition.key}:${day}:direction`) >= 0.5 ? 1 : -1;
  const shockSize = seededUnit(`${definition.key}:${day}:size`) * definition.shockVolatility;
  const shock = shockRoll < definition.shockChance ? shockDirection * shockSize : 0;
  const dailyChange = clamp(
    definition.drift + noise * definition.volatility + shock,
    definition.minDailyChange,
    definition.maxDailyChange,
  );

  return roundMoney(asset.price * (1 + dailyChange));
}

export function advanceStockMarketDay(
  stockMarket: GameState['stockMarket'] | undefined,
  day: number,
  now = Date.now(),
) {
  const hydratedMarket = hydrateStockMarket(stockMarket, Math.max(1, day - 1), now);

  return Object.fromEntries(
    STOCK_DEFINITIONS.map((definition) => {
      const asset = hydratedMarket[definition.key];

      if (asset.updatedAtDay >= day) {
        return [definition.key, asset];
      }

      let nextAsset = asset;

      for (let nextDay = asset.updatedAtDay + 1; nextDay <= day; nextDay += 1) {
        const nextPrice = calculateNextStockPrice(nextAsset, definition, nextDay);
        const nextHistory: Record<string, StockPricePoint> = {
          ...nextAsset.history,
          [nextDay]: {
            day: nextDay,
            price: nextPrice,
            createdAt: now,
          },
        };
        const recentHistory = Object.fromEntries(
          Object.values(nextHistory)
            .sort((current, next) => current.day - next.day)
            .slice(-STOCK_HISTORY_LIMIT)
            .map((point) => [point.day, point]),
        );

        nextAsset = {
          key: definition.key,
          price: nextPrice,
          previousPrice: nextAsset.price,
          history: recentHistory,
          updatedAtDay: nextDay,
        };
      }

      return [definition.key, nextAsset];
    }),
  ) as Record<StockKey, StockMarketAsset>;
}

export function getStockHistory(asset: StockMarketAsset | undefined) {
  return Object.values(asset?.history ?? {}).sort((current, next) => current.day - next.day);
}

export function getStockDailyChange(asset: StockMarketAsset | undefined) {
  if (!asset || asset.previousPrice <= 0) {
    return 0;
  }

  return (asset.price - asset.previousPrice) / asset.previousPrice;
}

export function calculatePortfolioValue(
  portfolio: PlayerStockPortfolio | undefined,
  stockMarket: GameState['stockMarket'],
) {
  const hydratedPortfolio = hydratePlayerStockPortfolio(portfolio);

  return Object.values(hydratedPortfolio.holdings).reduce((total, holding) => {
    if (!holding) {
      return total;
    }

    return total + holding.quantity * (stockMarket[holding.stockKey]?.price ?? 0);
  }, 0);
}
