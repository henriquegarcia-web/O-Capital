import {
  BankOutlined,
  CrownOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  ReconciliationOutlined,
  RiseOutlined,
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
    label: 'Títulos',
    icon: ReconciliationOutlined,
  },
  {
    key: 'missoes',
    label: 'Missões',
    icon: TrophyOutlined,
  },
  {
    key: 'ranking',
    label: 'Ranking',
    icon: RiseOutlined,
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
  label: 'Histórico',
  icon: HistoryOutlined,
} as const;

export type AppMenuKey = (typeof APP_MENU_ITEMS)[number]['key'] | typeof APP_HISTORY_MENU.key;
