import { Button, Card, Empty, Flex, Grid, Space, Tag, Typography } from 'antd';

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
        <Card key={room.id} loading={loading} size={screens.xs ? 'small' : 'medium'}>
          <Flex justify="space-between" gap={12} align="center" wrap>
            <Space orientation="vertical" size={4}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                {room.name}
              </Typography.Title>
              <Tag color="green">
                {room.playerCount} {room.playerCount === 1 ? 'jogador' : 'jogadores'}
              </Tag>
            </Space>
            <Button onClick={() => onEnter(room.id)}>
              Entrar
            </Button>
          </Flex>
        </Card>
      ))}
    </Flex>
  );
}
