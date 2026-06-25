import { AreaChartOutlined, LineChartOutlined, WalletOutlined } from '@ant-design/icons';
import { Card, Col, Row, Space, Typography } from 'antd';

import type { GameState, Player } from '@/types';
import { calculatePlayerNetWorth, calculatePortfolioValue, formatMoney } from '@/utils';

type PlayerFinanceCardProps = {
  game: GameState;
  currentPlayer: Player;
};

const metrics = [
  { key: 'balance', label: 'Saldo atual', icon: WalletOutlined },
  { key: 'netWorth', label: 'Valor de patrimonio', icon: LineChartOutlined },
  { key: 'stocks', label: 'Carteira de acoes', icon: AreaChartOutlined },
] as const;

export function PlayerFinanceCard({ currentPlayer, game }: PlayerFinanceCardProps) {
  const finance = game.playerFinances[currentPlayer.id];
  const values = {
    balance: formatMoney(finance?.balance ?? 0),
    netWorth: formatMoney(calculatePlayerNetWorth(game, currentPlayer.id)),
    stocks: formatMoney(
      calculatePortfolioValue(game.playerStocks[currentPlayer.id], game.stockMarket),
    ),
  };

  return (
    <Card className="player-finance-card">
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Typography.Title level={4} className="player-finance-card__title">
          {currentPlayer.name}
        </Typography.Title>

        <Row gutter={[10, 10]}>
          {metrics.map((metric) => {
            const Icon = metric.icon;

            return (
              <Col key={metric.key} xs={12} sm={8}>
                <div className="player-finance-card__metric">
                  <Icon />
                  <Typography.Text className="player-finance-card__metric-label">
                    {metric.label}
                  </Typography.Text>
                  <Typography.Text className="player-finance-card__metric-value">
                    {values[metric.key]}
                  </Typography.Text>
                </div>
              </Col>
            );
          })}
        </Row>
      </Space>
    </Card>
  );
}
