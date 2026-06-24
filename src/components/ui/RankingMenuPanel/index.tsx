import { WalletOutlined } from '@ant-design/icons';
import { Card, Empty, Flex, Space, Typography } from 'antd';

import type { GameState, Player } from '@/types';
import { calculatePlayerFortune, formatMoney } from '@/utils';

type RankingMenuPanelProps = {
  game: GameState;
  players: Player[];
};

export function RankingMenuPanel({ game, players }: RankingMenuPanelProps) {
  const ranking = players
    .filter((player) => player.status !== 'eliminated')
    .map((player) => ({
      player,
      fortune: calculatePlayerFortune(game, player.id),
    }))
    .sort((current, next) => next.fortune - current.fortune);

  return (
    <Card className="bank-app-card ranking-card">
      {ranking.length === 0 ? (
        <Empty description="Nenhum jogador no ranking" />
      ) : (
        <Space orientation="vertical" size={0} className="ranking-list">
          {ranking.map((item, index) => (
            <Flex key={item.player.id} align="center" gap={12} className="ranking-row">
              <span
                className={
                  index === 0 ? 'ranking-position ranking-position--leader' : 'ranking-position'
                }
              >
                {index + 1}
              </span>
              <Typography.Text strong className="ranking-player-name">
                {item.player.name}
              </Typography.Text>
              <Flex align="center" gap={5} className="ranking-fortune">
                <WalletOutlined />
                <Typography.Text>{formatMoney(item.fortune)}</Typography.Text>
              </Flex>
            </Flex>
          ))}
        </Space>
      )}
    </Card>
  );
}
