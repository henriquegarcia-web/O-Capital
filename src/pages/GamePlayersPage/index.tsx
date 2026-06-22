import { Navigate, useParams } from 'react-router-dom';
import { Card, Result, Skeleton, Space, Typography } from 'antd';

import { APP_HISTORY_MENU, APP_MENU_ITEMS, type AppMenuKey } from '@/constants';
import {
  AppBottomNavigation,
  BankerMatchControlCard,
  CurrentBoardSpaceCard,
  MatchControlCard,
} from '@/components/ui';
import { useCurrentRoomPlayer, useRoom } from '@/hooks';
import { hydrateGameState } from '@/utils';

function isValidMenuKey(menuKey: string | undefined): menuKey is AppMenuKey {
  if (!menuKey) {
    return false;
  }

  return APP_MENU_ITEMS.some((item) => item.key === menuKey) || APP_HISTORY_MENU.key === menuKey;
}

function AppMenuPlaceholder({ title }: { title: string }) {
  return (
    <Card>
      <Space orientation="vertical" size={8}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        <Typography.Text type="secondary">
          Estrutura preparada para as proximas regras desta area.
        </Typography.Text>
      </Space>
    </Card>
  );
}

export function GamePlayersPage() {
  const { menuKey, roomId } = useParams();
  const { players, room, loading } = useRoom(roomId);
  const currentPlayer = useCurrentRoomPlayer(roomId, players);

  if (!roomId) {
    return <Result status="404" title="Sala nao encontrada." />;
  }

  if (!isValidMenuKey(menuKey)) {
    return <Navigate to={`/rooms/${roomId}/app/partida`} replace />;
  }

  if (loading) {
    return <Skeleton active />;
  }

  if (!currentPlayer) {
    return <Result status="403" title="Entre como um jogador para acessar o aplicativo." />;
  }

  if (!room) {
    return <Result status="404" title="Sala nao encontrada." />;
  }

  if (currentPlayer.status === 'eliminated') {
    return <Result status="403" title="Este jogador foi eliminado da partida." />;
  }

  if (menuKey === 'banqueiro' && currentPlayer.role !== 'banqueiro') {
    return <Result status="403" title="Apenas o banqueiro pode acessar este menu." />;
  }

  const hydratedGame = hydrateGameState(room.game, players);
  const pageContent =
    menuKey === 'partida' ? (
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <MatchControlCard room={room} players={players} currentPlayer={currentPlayer} />
        <CurrentBoardSpaceCard game={hydratedGame} players={players} currentPlayer={currentPlayer} />
      </Space>
    ) : menuKey === 'banqueiro' ? (
      <BankerMatchControlCard room={room} players={players} />
    ) : menuKey === 'historico' ? (
      <AppMenuPlaceholder title="Historico" />
    ) : (
      <AppMenuPlaceholder
        title={APP_MENU_ITEMS.find((item) => item.key === menuKey)?.label ?? 'Aplicativo'}
      />
    );

  return (
    <>
      {pageContent}
      <AppBottomNavigation
        activeMenuKey={menuKey}
        playerRole={currentPlayer.role}
        roomId={roomId}
      />
    </>
  );
}
