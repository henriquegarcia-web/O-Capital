import { Card, Col, Flex, Row, Space, Typography } from 'antd';
import { APP_ICONS } from '@/constants';

import type { GameState, Player } from '@/types';
import {
  calculateBankScore,
  calculatePlayerNetWorth,
  calculatePortfolioValue,
  formatMoney,
} from '@/utils';

type PlayerFinanceCardProps = {
  game: GameState;
  currentPlayer: Player;
};

const metrics = [
  { key: 'balance', label: 'Saldo atual', icon: APP_ICONS.wallet },
  { key: 'netWorth', label: 'Valor de patrimonio', icon: APP_ICONS.lineChart },
  { key: 'stocks', label: 'Carteira de acoes', icon: APP_ICONS.areaChart },
] as const;

function getBankScoreTone(score: number) {
  if (score <= 10) return 'danger';
  if (score <= 50) return 'warning';

  return 'success';
}

export function PlayerFinanceCard({ currentPlayer, game }: PlayerFinanceCardProps) {
  const finance = game.playerFinances[currentPlayer.id];
  const bankScore = calculateBankScore(game, currentPlayer.id);
  const bankScoreTone = getBankScoreTone(bankScore);
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
        <Flex vertical>
          <Typography.Text type="secondary" className="player-finance-card__eyebrow">
            Ola,
          </Typography.Text>
          <Typography.Title level={4} className="player-finance-card__title">
            {currentPlayer.name}
          </Typography.Title>
        </Flex>

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
          <Col xs={12} sm={8}>
            <div className="player-finance-card__metric">
              <APP_ICONS.bank />
              <Typography.Text className="player-finance-card__metric-label">
                Pontuacao do banco
              </Typography.Text>
              <Typography.Text
                className={
                  bankScoreTone === 'success'
                    ? 'player-finance-card__metric-value bank-score-value bank-score-value--success'
                    : bankScoreTone === 'warning'
                      ? 'player-finance-card__metric-value bank-score-value bank-score-value--warning'
                      : 'player-finance-card__metric-value bank-score-value bank-score-value--danger'
                }
              >
                {bankScore}
              </Typography.Text>
            </div>
          </Col>
        </Row>
      </Space>
    </Card>
  );
}
