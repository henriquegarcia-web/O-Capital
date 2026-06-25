import { Flex, Typography } from 'antd';
import { NavLink } from 'react-router-dom';

import { APP_MENU_ITEMS } from '@/constants';
import type { PlayerRole } from '@/types';

type AppBottomNavigationProps = {
  activeMenuKey: string;
  playerRole: PlayerRole;
  roomId: string;
};

export function AppBottomNavigation({
  activeMenuKey,
  playerRole,
  roomId,
}: AppBottomNavigationProps) {
  const visibleItems = APP_MENU_ITEMS.filter(
    (item) => !('role' in item) || item.role === playerRole,
  );

  return (
    <nav className="app-bottom-navigation" aria-label="Menu do aplicativo">
      <Flex justify="space-around" align="center" gap={2}>
        {visibleItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.key}
              to={`/rooms/${roomId}/app/${item.key}`}
              className={({ isActive }) =>
                isActive || activeMenuKey === item.key
                  ? 'app-bottom-navigation__item app-bottom-navigation__item--active'
                  : 'app-bottom-navigation__item'
              }
            >
              <Icon />
              <Typography.Text>{item.label}</Typography.Text>
            </NavLink>
          );
        })}
      </Flex>
    </nav>
  );
}
