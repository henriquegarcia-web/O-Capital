import { App, Button, Flex, Modal, Result, Skeleton } from 'antd';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { addPlayerToRoom } from '@/api';
import { PlayerJoinCard, PlayersGrid, RoomInfoCard } from '@/components/ui';
import { useRoom } from '@/hooks';
import type { CreatePlayerInput } from '@/schemas';
import { getCurrentRoomPlayerId, setCurrentRoomPlayerId } from '@/utils';

export function RoomPage() {
  const { message } = App.useApp();
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
    setCurrentRoomPlayerId(activeRoomId, playerId);
    navigate(`/rooms/${activeRoomId}/app/partida`);
  }

  return (
    <Flex vertical align="flex=end" gap={12}>
      <RoomInfoCard room={room} playerCount={players.length} />
      <Flex justify="flex-end">
        <Button type="primary" onClick={() => setIsJoinModalOpen(true)}>
          Novo jogador
        </Button>
      </Flex>
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
          disabledColorKeys={players.map((player) => player.colorKey)}
          onJoin={handleJoin}
        />
      </Modal>
    </Flex>
  );
}
