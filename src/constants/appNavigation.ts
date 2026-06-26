import type { PlayerRole } from '@/types';

import { APP_ICONS } from './icons';

export const APP_MENU_ITEMS = [
  {
    key: 'partida',
    label: 'Partida',
    icon: APP_ICONS.playCircle,
  },
  {
    key: 'banco',
    label: 'Banco',
    icon: APP_ICONS.bank,
  },
  {
    key: 'titulos',
    label: 'Titulos',
    icon: APP_ICONS.reconciliation,
  },
  {
    key: 'acoes',
    label: 'Acoes',
    icon: APP_ICONS.rocket,
  },
  {
    key: 'vantagens',
    label: 'Vantagens',
    icon: APP_ICONS.gift,
  },
  {
    key: 'missoes',
    label: 'Missoes',
    icon: APP_ICONS.trophy,
  },
  {
    key: 'banqueiro',
    label: 'Banqueiro',
    icon: APP_ICONS.crown,
    role: 'banqueiro' satisfies PlayerRole,
  },
] as const;

export const APP_HISTORY_MENU = {
  key: 'historico',
  label: 'Historico',
  icon: APP_ICONS.history,
} as const;

export const APP_RANKING_MENU = {
  key: 'ranking',
  label: 'Ranking',
  icon: APP_ICONS.trophy,
} as const;

export type AppMenuKey =
  | (typeof APP_MENU_ITEMS)[number]['key']
  | typeof APP_HISTORY_MENU.key
  | typeof APP_RANKING_MENU.key;
