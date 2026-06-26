import { Button, Flex, Layout, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { APP_HISTORY_MENU, APP_ICONS, APP_MENU_ITEMS, APP_RANKING_MENU } from '@/constants';
import { clearCurrentRoomPlayerId } from '@/utils';

const { Header, Content } = Layout;

function getRoomIdFromPath(pathname: string) {
  return pathname.match(/^\/rooms\/([^/]+)/)?.[1];
}

function getAppMenuKeyFromPath(pathname: string) {
  return pathname.match(/^\/rooms\/[^/]+\/app\/([^/]+)/)?.[1];
}

function getHeaderCenter(pathname: string) {
  const menuKey = getAppMenuKeyFromPath(pathname);

  if (menuKey) {
    const menu =
      APP_MENU_ITEMS.find((item) => item.key === menuKey) ??
      (APP_HISTORY_MENU.key === menuKey
        ? APP_HISTORY_MENU
        : APP_RANKING_MENU.key === menuKey
          ? APP_RANKING_MENU
          : null);

    return menu?.label ?? 'Aplicativo';
  }

  return null;
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';
  const roomId = getRoomIdFromPath(location.pathname);
  const activeAppMenuKey = getAppMenuKeyFromPath(location.pathname);
  const isBottomNavigatorMenu = APP_MENU_ITEMS.some((item) => item.key === activeAppMenuKey);
  const isRoomDetails = /^\/rooms\/[^/]+$/.test(location.pathname);
  const isGameBoard = /^\/rooms\/[^/]+\/game\/board$/.test(location.pathname);
  const showCenteredLogo = isHome || isRoomDetails;
  const headerCenter = getHeaderCenter(location.pathname);

  function handleBack() {
    if (isRoomDetails) {
      navigate('/');
      return;
    }

    navigate(-1);
  }

  function handleExitApp() {
    if (roomId) {
      clearCurrentRoomPlayerId(roomId);
    }

    navigate('/');
  }

  return (
    <Layout className="app-layout">
      {!isGameBoard ? (
        <Header className="app-layout__header">
          <Flex align="center" justify="space-between" className="app-layout__header-inner">
            <div className="app-layout__header-side">
              {isBottomNavigatorMenu ? (
                <Button
                  type="text"
                  icon={<APP_ICONS.logout />}
                  aria-label="Sair"
                  onClick={handleExitApp}
                />
              ) : activeAppMenuKey && roomId ? (
                <Button
                  type="text"
                  icon={<APP_ICONS.arrowLeft />}
                  aria-label="Voltar para partida"
                  onClick={() => navigate(`/rooms/${roomId}/app/partida`)}
                />
              ) : !isHome ? (
                <Button
                  type="text"
                  icon={<APP_ICONS.arrowLeft />}
                  aria-label="Voltar"
                  onClick={handleBack}
                />
              ) : null}
            </div>

            <div className="app-layout__header-center">
              {showCenteredLogo ? (
                <img src="/logo_full.png" alt="O Capital" className="app-layout__logo" />
              ) : (
                <Typography.Text strong className="app-layout__header-label">
                  {headerCenter}
                </Typography.Text>
              )}
            </div>

            <div className="app-layout__header-side app-layout__header-side--right">
              {isBottomNavigatorMenu && roomId ? (
                <Flex align="center" gap={2}>
                  <Button
                    type="text"
                    icon={<APP_ICONS.history />}
                    aria-label="Historico"
                    onClick={() => navigate(`/rooms/${roomId}/app/${APP_HISTORY_MENU.key}`)}
                  />
                  <Button
                    type="text"
                    icon={<APP_ICONS.trophy />}
                    aria-label="Ranking"
                    onClick={() => navigate(`/rooms/${roomId}/app/${APP_RANKING_MENU.key}`)}
                  />
                </Flex>
              ) : isRoomDetails && roomId ? (
                <Button
                  type="text"
                  icon={<APP_ICONS.appstore />}
                  aria-label="Acessar tabuleiro"
                  onClick={() => navigate(`/rooms/${roomId}/game/board`)}
                />
              ) : null}
            </div>
          </Flex>
        </Header>
      ) : null}

      <Content
        className={
          isGameBoard
            ? 'app-layout__content app-layout__content--game-board'
            : activeAppMenuKey
              ? 'app-layout__content app-layout__content--with-bottom-nav'
              : 'app-layout__content'
        }
      >
        <Outlet />
      </Content>
    </Layout>
  );
}
