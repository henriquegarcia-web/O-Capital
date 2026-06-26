import {
  AreaChartOutlined,
  BarChartOutlined,
  DollarOutlined,
  LineChartOutlined,
  NumberOutlined,
  RiseOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Flex,
  Form,
  InputNumber,
  Modal,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';

import { buyPlayerStock, sellPlayerStock } from '@/api';
import type { GameState, Player, Room, StockKey, StockMarketAsset } from '@/types';
import type { ReactNode } from 'react';
import {
  calculatePortfolioCost,
  calculatePortfolioQuantity,
  calculatePortfolioValue,
  formatMoney,
  getStockDailyChange,
  getStockHistory,
  getStockPriceRange,
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
  quantity: number;
};

type StockTradeState = {
  action: 'buy' | 'sell';
  stockKey: StockKey;
};

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function calculateReturnRate(currentValue: number, invested: number) {
  if (invested <= 0) {
    return 0;
  }

  return (currentValue - invested) / invested;
}

type SummaryMetricProps = {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: 'success' | 'danger';
};

function SummaryMetric({ icon, label, tone, value }: SummaryMetricProps) {
  return (
    <div className="stocks-summary-metric">
      <div className="stocks-summary-metric__icon">{icon}</div>
      <Typography.Text className="stocks-summary-metric__label">{label}</Typography.Text>
      <Typography.Text
        className={
          tone === 'success'
            ? 'stocks-summary-metric__value bank-money--success'
            : tone === 'danger'
              ? 'stocks-summary-metric__value bank-money--danger'
              : 'stocks-summary-metric__value'
        }
      >
        {value}
      </Typography.Text>
    </div>
  );
}

function StockSparkline({ asset }: { asset: StockMarketAsset | undefined }) {
  const history = getStockHistory(asset);

  if (history.length <= 1) {
    return <div className="stock-chart-frame stock-chart-frame--empty" />;
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
    <div className="stock-chart-frame">
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
    </div>
  );
}

export function StocksMenuPanel({ currentPlayer, game, room }: StocksMenuPanelProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<StockTradeFormValues>();
  const [tradeState, setTradeState] = useState<StockTradeState | null>(null);
  const [loadingTrade, setLoadingTrade] = useState(false);
  const portfolio = game.playerStocks[currentPlayer.id] ?? { holdings: {} };
  const availableBalance = game.playerFinances[currentPlayer.id]?.balance ?? 0;
  const portfolioValue = calculatePortfolioValue(portfolio, game.stockMarket);
  const portfolioCost = calculatePortfolioCost(portfolio);
  const portfolioQuantity = calculatePortfolioQuantity(portfolio);
  const portfolioResult = portfolioValue - portfolioCost;
  const selectedQuantity = Number(Form.useWatch('quantity', form) ?? 0);
  const selectedStockKey = tradeState?.stockKey;
  const selectedAction = tradeState?.action ?? 'buy';
  const selectedAsset = selectedStockKey ? game.stockMarket[selectedStockKey] : undefined;
  const selectedStock = selectedStockKey
    ? STOCK_DEFINITIONS.find((stock) => stock.key === selectedStockKey)
    : undefined;
  const selectedTotal = selectedAsset ? selectedAsset.price * selectedQuantity : 0;
  const selectedHolding = selectedStockKey ? portfolio.holdings[selectedStockKey] : undefined;
  const selectedInvested = selectedHolding
    ? selectedHolding.quantity * selectedHolding.averagePrice
    : 0;
  const selectedCurrentValue = selectedHolding
    ? selectedHolding.quantity * (selectedAsset?.price ?? 0)
    : 0;
  const selectedResult = selectedCurrentValue - selectedInvested;
  const isTradeInvalid =
    !selectedStockKey ||
    !selectedAsset ||
    selectedQuantity <= 0 ||
    (selectedAction === 'buy' && selectedTotal > availableBalance) ||
    (selectedAction === 'sell' && (selectedHolding?.quantity ?? 0) < selectedQuantity);

  function openTradeModal(action: StockTradeState['action'], stockKey: StockKey) {
    form.setFieldsValue({ quantity: 1 });
    setTradeState({ action, stockKey });
  }

  async function handleSubmit(values: StockTradeFormValues) {
    if (!tradeState) return;

    const stock = STOCK_DEFINITIONS.find((item) => item.key === tradeState.stockKey);
    const asset = game.stockMarket[tradeState.stockKey];

    if (!stock || !asset) {
      message.error('Acao indisponivel.');
      return;
    }

    const quantity = Math.floor(values.quantity);
    const totalAmount = asset.price * quantity;
    const verb = tradeState.action === 'buy' ? 'Comprar' : 'Vender';

    modal.confirm({
      title: `${verb} ${stock.ticker}`,
      content: `${verb} ${quantity} unidade(s) por ${formatMoney(totalAmount)}?`,
      okText: 'Confirmar',
      cancelText: 'Cancelar',
      async onOk() {
        setLoadingTrade(true);

        try {
          if (tradeState.action === 'buy') {
            await buyPlayerStock(room.id, currentPlayer.id, {
              stockKey: tradeState.stockKey,
              quantity,
            });
          } else {
            await sellPlayerStock(room.id, currentPlayer.id, {
              stockKey: tradeState.stockKey,
              quantity,
            });
          }

          message.success('Operacao aplicada.');
          form.setFieldsValue({ quantity: 1 });
          setTradeState(null);
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : 'Nao foi possivel aplicar a operacao.',
          );
        } finally {
          setLoadingTrade(false);
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
            <SummaryMetric
              icon={<NumberOutlined />}
              label="Cotas"
              value={String(portfolioQuantity)}
            />
            <SummaryMetric
              icon={<DollarOutlined />}
              label="Valor investido"
              value={formatMoney(portfolioCost)}
            />
            <SummaryMetric
              icon={<RiseOutlined />}
              label="Lucro/prejuizo"
              value={formatMoney(portfolioResult)}
              tone={portfolioResult >= 0 ? 'success' : 'danger'}
            />
            <SummaryMetric
              icon={<BarChartOutlined />}
              label="Patrimonio atual"
              value={formatMoney(portfolioValue)}
            />
          </Flex>
        </Space>
      </Card>

      {STOCK_DEFINITIONS.map((stock) => {
        const asset = game.stockMarket[stock.key];
        const holding = portfolio.holdings[stock.key];
        const dailyChange = getStockDailyChange(asset);
        const currentValue = (holding?.quantity ?? 0) * (asset?.price ?? 0);
        const invested = (holding?.quantity ?? 0) * (holding?.averagePrice ?? 0);
        const result = currentValue - invested;
        const resultRate = calculateReturnRate(currentValue, invested);
        const priceRange = getStockPriceRange(asset);

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
                  <Typography.Text type="secondary">Valor investido</Typography.Text>
                  <Typography.Text strong>{formatMoney(invested)}</Typography.Text>
                </div>
                <div>
                  <Typography.Text type="secondary">Resultado</Typography.Text>
                  <Space size={4} wrap className="stock-card__result-value">
                    <Typography.Text strong>{formatMoney(currentValue)}</Typography.Text>
                    <Typography.Text
                      strong
                      className={result >= 0 ? 'bank-money--success' : 'bank-money--danger'}
                    >
                      ({formatPercent(resultRate)})
                    </Typography.Text>
                  </Space>
                </div>
                <div>
                  <Typography.Text type="secondary">Maior preco</Typography.Text>
                  <Typography.Text strong>{formatMoney(priceRange.high)}</Typography.Text>
                </div>
                <div>
                  <Typography.Text type="secondary">Menor preco</Typography.Text>
                  <Typography.Text strong>{formatMoney(priceRange.low)}</Typography.Text>
                </div>
              </Flex>

              <Typography.Text type="secondary" className="stock-card__behavior">
                {stock.behavior}
              </Typography.Text>

              <Flex justify="flex-end" gap={8} wrap className="stock-card__actions">
                <Button
                  type="primary"
                  icon={<ShoppingCartOutlined />}
                  onClick={() => openTradeModal('buy', stock.key)}
                >
                  Comprar
                </Button>
                <Button
                  disabled={(holding?.quantity ?? 0) <= 0}
                  onClick={() => openTradeModal('sell', stock.key)}
                >
                  Vender
                </Button>
              </Flex>
            </Space>
          </Card>
        );
      })}

      <Modal
        title={
          selectedStock
            ? `${selectedAction === 'buy' ? 'Comprar' : 'Vender'} ${selectedStock.ticker}`
            : 'Operar acao'
        }
        open={Boolean(tradeState)}
        okText={selectedAction === 'buy' ? 'Comprar' : 'Vender'}
        cancelText="Cancelar"
        confirmLoading={loadingTrade}
        okButtonProps={{ disabled: isTradeInvalid }}
        onCancel={() => setTradeState(null)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" initialValues={{ quantity: 1 }} onFinish={handleSubmit}>
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            {selectedStock ? (
              <div className="stock-trade-preview">
                <Space orientation="vertical" size={0}>
                  <Typography.Text strong>{selectedStock.name}</Typography.Text>
                  <Typography.Text type="secondary">{selectedStock.ticker}</Typography.Text>
                </Space>
                <Typography.Text strong>{formatMoney(selectedAsset?.price ?? 0)}</Typography.Text>
              </div>
            ) : null}

            <Form.Item
              label="Quantidade"
              name="quantity"
              rules={[{ required: true, message: '' }]}
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                min={1}
                max={selectedAction === 'sell' ? (selectedHolding?.quantity ?? 0) : undefined}
                precision={0}
                controls
                style={{ width: '100%' }}
              />
            </Form.Item>

            <div className="stock-trade-preview">
              <Typography.Text type="secondary">
                {selectedAction === 'buy' ? 'Custo estimado' : 'Receita estimada'}
              </Typography.Text>
              <Typography.Text strong>{formatMoney(selectedTotal)}</Typography.Text>
            </div>

            {selectedAction === 'sell' ? (
              <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                <Flex justify="space-between" gap={12}>
                  <Typography.Text type="secondary">Quantidade disponivel</Typography.Text>
                  <Typography.Text strong>{selectedHolding?.quantity ?? 0}</Typography.Text>
                </Flex>
                <Flex justify="space-between" gap={12}>
                  <Typography.Text type="secondary">Valor gasto</Typography.Text>
                  <Typography.Text strong>{formatMoney(selectedInvested)}</Typography.Text>
                </Flex>
                <Flex justify="space-between" gap={12}>
                  <Typography.Text type="secondary">Lucro/prejuizo atual</Typography.Text>
                  <Typography.Text
                    strong
                    className={selectedResult >= 0 ? 'bank-money--success' : 'bank-money--danger'}
                  >
                    {formatMoney(selectedResult)}
                  </Typography.Text>
                </Flex>
              </Space>
            ) : null}
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
