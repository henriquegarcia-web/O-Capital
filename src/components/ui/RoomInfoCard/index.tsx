import { Card, Col, Row, Space, Statistic, Typography } from 'antd';

import { APP_ICONS, GAME_LIMITS } from '@/constants';
import type { Room } from '@/types';

type RoomInfoCardProps = {
  playerCount: number;
  room: Room;
};

export function RoomInfoCard({ playerCount, room }: RoomInfoCardProps) {
  return (
    <Card className="bank-app-card bank-app-card--dark room-info-card">
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Space size={12} align="start">
          <span className="bank-app-avatar">
            <APP_ICONS.bank />
          </span>
          <Space orientation="vertical" size={4}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {room.name}
            </Typography.Title>
          </Space>
        </Space>
        <Row gutter={[10, 10]}>
          <Col span={12}>
            <Statistic
              title="Jogadores"
              value={`${playerCount}/${GAME_LIMITS.maxPlayers}`}
              prefix={<APP_ICONS.team />}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Status"
              value={room.status === 'waiting' ? 'Aberta' : 'Ativa'}
              prefix={<APP_ICONS.calendar />}
            />
          </Col>
        </Row>
      </Space>
    </Card>
  );
}
