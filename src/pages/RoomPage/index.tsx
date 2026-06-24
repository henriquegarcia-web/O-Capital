import { App, Button, Modal, Result, Skeleton, Space } from 'antd';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { addPlayerToRoom } from '@/api';
import { PlayerJoinCard, PlayersGrid, RoomInfoCard } from '@/components/ui';
import { useRoom } from '@/hooks';
import type { CreatePlayerInput } from '@/schemas';
import { getCurrentRoomPlayerId, setCurrentRoomPlayerId } from '@/utils';

export function RoomPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { roomId } = useParams();
  const { room, players, loading } = useRoom(roomId);
  const [joining, setJoining] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  if (loading) {
    return <Skeleton active />;
  }

  if (!room || !roomId) {
    return <Result status="404" title="Sala nao encontrada" />;
  }

  const activeRoomId = roomId;
  const currentPlayerId = getCurrentRoomPlayerId(activeRoomId);
  const hasActivePlayer = players.some((player) => player.id === currentPlayerId);

  if (hasActivePlayer) {
    return <Navigate to={`/rooms/${activeRoomId}/app/partida`} replace />;
  }

  async function handleJoin(input: CreatePlayerInput) {
    try {
      setJoining(true);
      const player = await addPlayerToRoom(activeRoomId, input);
      setCurrentRoomPlayerId(activeRoomId, player.id);
      message.success('Jogador entrou na sala.');
      setIsJoinModalOpen(false);
      navigate(`/rooms/${activeRoomId}/app/partida`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Nao foi possivel entrar na sala.');
    } finally {
      setJoining(false);
    }
  }

  function handleEnterAsPlayer(playerId: string) {
    const player = players.find((item) => item.id === playerId);

    modal.confirm({
      title: 'Entrar como jogador?',
      content: `Entrar como ${player?.name ?? 'jogador'}?`,
      okText: 'Entrar',
      cancelText: 'Cancelar',
      onOk() {
        setCurrentRoomPlayerId(activeRoomId, playerId);
        navigate(`/rooms/${activeRoomId}/app/partida`);
      },
    });
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }} className="room-details-page">
      <RoomInfoCard room={room} playerCount={players.length} />
      <Button type="primary" size="large" block onClick={() => setIsJoinModalOpen(true)}>
        Novo jogador
      </Button>
      <PlayersGrid players={players} showEnterAction onEnter={handleEnterAsPlayer} />
      <Modal
        open={isJoinModalOpen}
        footer={null}
        onCancel={() => setIsJoinModalOpen(false)}
        title="Novo jogador"
      >
        <PlayerJoinCard
          framed={false}
          loading={joining}
          disabledColorKeys={players
            .filter((player) => player.status !== 'eliminated')
            .map((player) => player.colorKey)}
          onJoin={handleJoin}
        />
      </Modal>
    </Space>
  );
}
