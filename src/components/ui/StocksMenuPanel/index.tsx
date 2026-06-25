import {
  AreaChartOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  LineChartOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Flex,
  Form,
  InputNumber,
  Segmented,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import { useMemo } from 'react';

import { buyPlayerStock, sellPlayerStock } from '@/api';
import type { GameState, Player, Room, StockKey, StockMarketAsset } from '@/types';
import {
  calculatePortfolioValue,
  formatMoney,
  getStockDailyChange,
  getStockHistory,
  STOCK_DEFINITIONS,
  STOCK_RISK_COLORS,
  STOCK_RISK_LABELS,
} from '@/utils';

type StocksMenuPanelProps = {
  room: Room;
  game: GameState;
  currentPlayer: Player;
};

type StockTradeFormValues = {
  action: 'buy' | 'sell';
  stockKey: StockKey;
  quantity: number;
};

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function StockSparkline({ asset }: { asset: StockMarketAsset | undefined }) {
  const history = getStockHistory(asset);

  if (history.length <= 1) {
    return <div className="stock-chart stock-chart--empty" />;
  }

  const width = 280;
  const height = 92;
  const padding = 8;
  const prices = history.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(1, max - min);
  const points = history.map((point, index) => {
    const x = padding + (index / Math.max(1, history.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.price - min) / range) * (height - padding * 2);

    return `${x},${y}`;
  });
  const areaPoints = `${padding},${height - padding} ${points.join(' ')} ${
    width - padding
  },${height - padding}`;
  const change = getStockDailyChange(asset);

  return (
    <svg className="stock-chart" viewBox={`0 0 ${width} ${height}`} role="img">
      <polygon
        points={areaPoints}
        className={change >= 0 ? 'stock-chart__area--up' : 'stock-chart__area--down'}
      />
      <polyline
        points={points.join(' ')}
        className={change >= 0 ? 'stock-chart__line--up' : 'stock-chart__line--down'}
      />
    </svg>
  );
}

export function StocksMenuPanel({ currentPlayer, game, room }: StocksMenuPanelProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<StockTradeFormValues>();
  const portfolio = game.playerStocks[currentPlayer.id] ?? { holdings: {} };
  const portfolioValue = calculatePortfolioValue(portfolio, game.stockMarket);
  const stockOptions = STOCK_DEFINITIONS.map((stock) => ({
    value: stock.key,
    label: `${stock.name} (${stock.ticker})`,
  }));
  const selectedStockKey = Form.useWatch('stockKey', form);
  const selectedQuantity = Form.useWatch('quantity', form) ?? 0;
  const selectedAction = Form.useWatch('action', form) ?? 'buy';
  const selectedAsset = selectedStockKey ? game.stockMarket[selectedStockKey] : undefined;
  const selectedTotal = selectedAsset ? selectedAsset.price * selectedQuantity : 0;
  const totalInvested = useMemo(
    () =>
      Object.values(portfolio.holdings).reduce(
        (total, holding) => total + (holding?.quantity ?? 0) * (holding?.averagePrice ?? 0),
        0,
      ),
    [portfolio.holdings],
  );
  const portfolioResult = portfolioValue - totalInvested;

  async function handleSubmit(values: StockTradeFormValues) {
    const stock = STOCK_DEFINITIONS.find((item) => item.key === values.stockKey);
    const asset = game.stockMarket[values.stockKey];

    if (!stock || !asset) {
      message.error('Acao indisponivel.');
      return;
    }

    const quantity = Math.floor(values.quantity);
    const totalAmount = asset.price * quantity;
    const verb = values.action === 'buy' ? 'Comprar' : 'Vender';

    modal.confirm({
      title: `${verb} ${stock.ticker}`,
      content: `${verb} ${quantity} unidade(s) por ${formatMoney(totalAmount)}?`,
      okText: 'Confirmar',
      cancelText: 'Cancelar',
      async onOk() {
        try {
          if (values.action === 'buy') {
            await buyPlayerStock(room.id, currentPlayer.id, {
              stockKey: values.stockKey,
              quantity,
            });
          } else {
            await sellPlayerStock(room.id, currentPlayer.id, {
              stockKey: values.stockKey,
              quantity,
            });
          }

          message.success('Operacao aplicada.');
          form.setFieldsValue({ quantity: 1 });
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : 'Nao foi possivel aplicar a operacao.',
          );
        }
      },
    });
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card className="bank-app-card bank-app-card--dark stocks-summary-card">
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Flex align="center" justify="space-between" gap={12} wrap>
            <Space size={10}>
              <LineChartOutlined />
              <Typography.Title level={4} style={{ margin: 0 }}>
                Investimentos
              </Typography.Title>
            </Space>
            <Tag color="cyan">Dia {game.day}</Tag>
          </Flex>

          <Flex gap={10} wrap>
            <Card size="small" className="bank-page-metric stocks-summary-card__metric">
              <Statistic
                title="Carteira"
                value={portfolioValue}
                formatter={(value) => formatMoney(Number(value))}
              />
            </Card>
            <Card size="small" className="bank-page-metric stocks-summary-card__metric">
              <Statistic
                title="Resultado"
                value={portfolioResult}
                formatter={(value) => formatMoney(Number(value))}
                valueStyle={{ color: portfolioResult >= 0 ? '#86efac' : '#fecdd3' }}
              />
            </Card>
          </Flex>
        </Space>
      </Card>

      <Card className="bank-app-card">
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Flex align="center" gap={10} wrap className="bank-app-card-header">
            <SwapOutlined className="bank-actions-card__icon" />
            <Typography.Title level={4} style={{ margin: 0 }}>
              Operar Acoes
            </Typography.Title>
          </Flex>

          <Form
            form={form}
            layout="vertical"
            initialValues={{ action: 'buy', quantity: 1 }}
            onFinish={handleSubmit}
          >
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Form.Item label="Acao" name="stockKey" rules={[{ required: true, message: '' }]}>
                <Select placeholder="Selecione" options={stockOptions} />
              </Form.Item>

              <Flex gap={12} wrap align="flex-start">
                <Form.Item
                  label="Quantidade"
                  name="quantity"
                  rules={[{ required: true, message: '' }]}
                  className="stocks-trade-field"
                >
                  <InputNumber min={1} precision={0} controls style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  label="Operacao"
                  name="action"
                  rules={[{ required: true, message: '' }]}
                  className="stocks-trade-field"
                >
                  <Segmented
                    block
                    options={[
                      { label: 'Comprar', value: 'buy', icon: <ArrowUpOutlined /> },
                      { label: 'Vender', value: 'sell', icon: <ArrowDownOutlined /> },
                    ]}
                  />
                </Form.Item>
              </Flex>

              <div className="stock-trade-preview">
                <Typography.Text type="secondary">
                  {selectedAction === 'buy' ? 'Custo estimado' : 'Receita estimada'}
                </Typography.Text>
                <Typography.Text strong>{formatMoney(selectedTotal)}</Typography.Text>
              </div>

              <Button type="primary" htmlType="submit" block>
                Aplicar operacao
              </Button>
            </Space>
          </Form>
        </Space>
      </Card>

      {STOCK_DEFINITIONS.map((stock) => {
        const asset = game.stockMarket[stock.key];
        const holding = portfolio.holdings[stock.key];
        const dailyChange = getStockDailyChange(asset);
        const currentValue = (holding?.quantity ?? 0) * (asset?.price ?? 0);
        const invested = (holding?.quantity ?? 0) * (holding?.averagePrice ?? 0);
        const result = currentValue - invested;

        return (
          <Card key={stock.key} className="bank-app-card stock-card">
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Flex align="flex-start" justify="space-between" gap={12} wrap>
                <Space size={10} align="start" className="stock-card__identity">
                  <AreaChartOutlined className="stock-card__icon" />
                  <Space orientation="vertical" size={2}>
                    <Typography.Title level={5} className="stock-card__title">
                      {stock.name}
                    </Typography.Title>
                    <Typography.Text type="secondary">{stock.ticker}</Typography.Text>
                  </Space>
                </Space>
                <Space size={6} wrap>
                  <Tag color={STOCK_RISK_COLORS[stock.risk]}>
                    Risco {STOCK_RISK_LABELS[stock.risk]}
                  </Tag>
                  <Tag color={dailyChange >= 0 ? 'green' : 'red'}>{formatPercent(dailyChange)}</Tag>
                </Space>
              </Flex>

              <StockSparkline asset={asset} />

              <Flex gap={8} wrap className="stock-card__values">
                <div>
                  <Typography.Text type="secondary">Preco atual</Typography.Text>
                  <Typography.Text strong>{formatMoney(asset?.price ?? 0)}</Typography.Text>
                </div>
                <div>
                  <Typography.Text type="secondary">Quantidade</Typography.Text>
                  <Typography.Text strong>{holding?.quantity ?? 0}</Typography.Text>
                </div>
                <div>
                  <Typography.Text type="secondary">Valor</Typography.Text>
                  <Typography.Text strong>{formatMoney(currentValue)}</Typography.Text>
                </div>
                <div>
                  <Typography.Text type="secondary">Resultado</Typography.Text>
                  <Typography.Text
                    strong
                    className={result >= 0 ? 'bank-money--success' : 'bank-money--danger'}
                  >
                    {formatMoney(result)}
                  </Typography.Text>
                </div>
              </Flex>

              <Typography.Text type="secondary" className="stock-card__behavior">
                {stock.behavior}
              </Typography.Text>
            </Space>
          </Card>
        );
      })}
    </Space>
  );
}
