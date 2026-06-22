import { Result, Skeleton, Space, Typography } from 'antd';
import { useParams } from 'react-router-dom';

import { PlayersGrid } from '@/components/ui';
import { useRoom } from '@/hooks';

export function GameBoardPage() {
  const { roomId } = useParams();
  const { room, players, loading } = useRoom(roomId);

  if (loading) {
    return <Skeleton active />;
  }

  if (!room) {
    return <Result status="404" title="Crie ou acesse uma sala para abrir o tabuleiro." />;
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={2} style={{ margin: 0 }}>
        Tabuleiro
      </Typography.Title>
      <Typography.Title level={4} style={{ margin: 0 }}>
        Jogadores na sala {room.name}
      </Typography.Title>
      <PlayersGrid players={players} />
    </Space>
  );
}
