import { Button, Card, Empty, Flex, Grid, Space, Typography } from 'antd';
import { APP_ICONS } from '@/constants';

import type { RoomSummary } from '@/types';

const { useBreakpoint } = Grid;

type RoomsGridProps = {
  rooms: RoomSummary[];
  loading?: boolean;
  onEnter: (roomId: string) => void;
};

export function RoomsGrid({ rooms, loading, onEnter }: RoomsGridProps) {
  const screens = useBreakpoint();

  if (!loading && rooms.length === 0) {
    return <Empty description="Nenhuma sala ativa encontrada." />;
  }

  return (
    <Flex vertical gap={12}>
      {rooms.map((room) => (
        <Card
          key={room.id}
          loading={loading}
          size={screens.xs ? 'small' : 'medium'}
          className="bank-app-list-card"
        >
          <Flex className="bank-app-row" justify="space-between" gap={12} align="center">
            <Flex gap={12} align="center" style={{ minWidth: 0 }}>
              <span className="bank-app-avatar">
                <APP_ICONS.bank />
              </span>
              <Space orientation="vertical" size={4} style={{ minWidth: 0 }}>
                <Flex align="center" gap={8} wrap>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {room.name}
                  </Typography.Title>
                </Flex>
                <Flex gap={12} wrap className="bank-app-muted">
                  <Space size={4}>
                    <APP_ICONS.team />
                    <Typography.Text type="secondary">
                      {room.playerCount} {room.playerCount === 1 ? 'jogador' : 'jogadores'}
                    </Typography.Text>
                  </Space>
                  <Space size={4}>
                    <APP_ICONS.clockCircle />
                    <Typography.Text type="secondary">
                      {room.status === 'waiting' ? 'Aguardando inicio' : 'Partida ativa'}
                    </Typography.Text>
                  </Space>
                </Flex>
              </Space>
            </Flex>
            <Button
              shape="circle"
              icon={<APP_ICONS.arrowRight />}
              onClick={() => onEnter(room.id)}
            />
          </Flex>
        </Card>
      ))}
    </Flex>
  );
}
