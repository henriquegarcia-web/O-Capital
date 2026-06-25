import {
  BankOutlined,
  CrownOutlined,
  GiftOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  ReconciliationOutlined,
  RocketOutlined,
  TrophyOutlined,
} from '@ant-design/icons';

import type { PlayerRole } from '@/types';

export const APP_MENU_ITEMS = [
  {
    key: 'partida',
    label: 'Partida',
    icon: PlayCircleOutlined,
  },
  {
    key: 'banco',
    label: 'Banco',
    icon: BankOutlined,
  },
  {
    key: 'titulos',
    label: 'Titulos',
    icon: ReconciliationOutlined,
  },
  {
    key: 'acoes',
    label: 'Acoes',
    icon: RocketOutlined,
  },
  {
    key: 'vantagens',
    label: 'Vantagens',
    icon: GiftOutlined,
  },
  {
    key: 'missoes',
    label: 'Missoes',
    icon: TrophyOutlined,
  },
  {
    key: 'banqueiro',
    label: 'Banqueiro',
    icon: CrownOutlined,
    role: 'banqueiro' satisfies PlayerRole,
  },
] as const;

export const APP_HISTORY_MENU = {
  key: 'historico',
  label: 'Historico',
  icon: HistoryOutlined,
} as const;

export const APP_RANKING_MENU = {
  key: 'ranking',
  label: 'Ranking',
  icon: TrophyOutlined,
} as const;

export type AppMenuKey =
  | (typeof APP_MENU_ITEMS)[number]['key']
  | typeof APP_HISTORY_MENU.key
  | typeof APP_RANKING_MENU.key;
