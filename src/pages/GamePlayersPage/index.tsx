import { Navigate, useParams } from 'react-router-dom';
import { Result, Skeleton } from 'antd';

import { APP_HISTORY_MENU, APP_MENU_ITEMS, type AppMenuKey } from '@/constants';
import { AppBottomNavigation } from '@/components/ui';
import { useCurrentRoomPlayer, useRoom } from '@/hooks';

function isValidMenuKey(menuKey: string | undefined): menuKey is AppMenuKey {
  if (!menuKey) {
    return false;
  }

  return APP_MENU_ITEMS.some((item) => item.key === menuKey) || APP_HISTORY_MENU.key === menuKey;
}

export function GamePlayersPage() {
  const { menuKey, roomId } = useParams();
  const { players, loading } = useRoom(roomId);
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

  if (menuKey === 'banqueiro' && currentPlayer.role !== 'banqueiro') {
    return <Result status="403" title="Apenas o banqueiro pode acessar este menu." />;
  }

  return (
    <AppBottomNavigation
      activeMenuKey={menuKey}
      playerRole={currentPlayer.role}
      roomId={roomId}
    />
  );
}
