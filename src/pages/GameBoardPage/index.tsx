import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Result, Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';

import { GameBoard } from '@/components/ui';
import { useRoom } from '@/hooks';

export function GameBoardPage() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const { room, players, loading } = useRoom(roomId);

  if (loading) {
    return <Skeleton active />;
  }

  if (!room) {
    return <Result status="404" title="Crie ou acesse uma sala para abrir o tabuleiro." />;
  }

  return (
    <div className="game-board-page">
      <Button
        type="primary"
        shape="circle"
        size="large"
        icon={<ArrowLeftOutlined />}
        aria-label="Voltar"
        className="game-board-page__back"
        onClick={() => navigate(-1)}
      />
      <GameBoard room={room} players={players} />
    </div>
  );
}
