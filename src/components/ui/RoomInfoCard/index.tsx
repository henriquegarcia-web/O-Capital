import { Card, Descriptions, Space, Tag, Typography } from 'antd';

import { GAME_LIMITS, ROOM_STATUS_LABELS } from '@/constants';
import type { Room } from '@/types';

type RoomInfoCardProps = {
  playerCount: number;
  room: Room;
};

export function RoomInfoCard({ playerCount, room }: RoomInfoCardProps) {
  return (
    <Card>
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {room.name}
        </Typography.Title>
        <Descriptions bordered column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Status">
            <Tag color={room.status === 'waiting' ? 'green' : 'blue'}>
              {ROOM_STATUS_LABELS[room.status]}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Jogadores">
            {playerCount}/{GAME_LIMITS.maxPlayers}
          </Descriptions.Item>
        </Descriptions>
      </Space>
    </Card>
  );
}
