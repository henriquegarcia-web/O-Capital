import { App, Col, Row, Space } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createRoom } from '@/api';
import { RoomCreateCard, RoomsGrid } from '@/components/ui';
import { useRooms } from '@/hooks';
import type { CreateRoomInput } from '@/schemas';

export function HomePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { rooms, loading } = useRooms();
  const [creating, setCreating] = useState(false);

  async function handleCreateRoom(input: CreateRoomInput) {
    try {
      setCreating(true);
      const room = await createRoom(input);
      message.success('Sala criada.');
      navigate(`/rooms/${room.id}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Nao foi possivel criar a sala.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={8}>
          <RoomCreateCard loading={creating} onCreate={handleCreateRoom} />
        </Col>
        <Col xs={24} lg={16}>
          <RoomsGrid
            rooms={rooms}
            loading={loading}
            onEnter={(roomId) => navigate(`/rooms/${roomId}`)}
          />
        </Col>
      </Row>
    </Space>
  );
}
