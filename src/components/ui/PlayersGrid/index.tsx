import { Avatar, Button, Card, Empty, Flex, Space, Tag, Typography } from 'antd';

import { PLAYER_ROLE_LABELS, PROFILE_COLORS, PROFILE_PHOTOS } from '@/constants';
import type { Player } from '@/types';

type PlayersGridProps = {
  players: Player[];
  showEnterAction?: boolean;
  onEnter?: (playerId: string) => void;
};

export function PlayersGrid({ players, showEnterAction = false, onEnter }: PlayersGridProps) {
  if (players.length === 0) {
    return <Empty description="Nenhum jogador ativo nesta sala." />;
  }

  return (
    <Flex vertical gap={12}>
      {players.map((player) => {
        const photo = PROFILE_PHOTOS.find((item) => item.key === player.photoKey);
        const color = PROFILE_COLORS.find((item) => item.key === player.colorKey);

        return (
          <Card key={player.id} size="small">
            <Flex justify="space-between" align="center" gap={16} wrap>
              <Space>
                <Avatar
                  src={photo?.path}
                  style={{
                    background: color?.value,
                    border: color ? `3px solid ${color.value}` : undefined,
                  }}
                >
                  {player.name.charAt(0)}
                </Avatar>
                <Space orientation="vertical" size={2}>
                  <Typography.Text strong>{player.name}</Typography.Text>
                  <Space size={6}>
                    <Tag color={player.role === 'banqueiro' ? 'gold' : 'blue'}>
                      {PLAYER_ROLE_LABELS[player.role]}
                    </Tag>
                  </Space>
                </Space>
              </Space>
              {showEnterAction ? (
                <Button onClick={() => onEnter?.(player.id)}>Entrar</Button>
              ) : null}
            </Flex>
          </Card>
        );
      })}
    </Flex>
  );
}
