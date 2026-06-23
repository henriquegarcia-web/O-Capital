import { useMemo, useState } from 'react';
import {
  BankOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  LineChartOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Form,
  Grid,
  InputNumber,
  Modal,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';

import {
  confirmRoundPending,
  forgiveReceivable,
  payDebt,
  payTaxPending,
  requestBankLoan,
} from '@/api';
import type { GameState, Player, PlayerDebt, Room, RoundPending, TaxPending } from '@/types';
import {
  BANK_LOAN_INTEREST_RATE,
  BANK_LOAN_MIN_SCORE,
  calculateActiveDebtTotal,
  calculateBankScore,
  calculateCreditLimit,
  calculatePlayerRoundExpenses,
  calculatePlayerRoundIncome,
  calculateReceivableTotal,
  formatMoney,
  getBankScoreLabel,
} from '@/utils';

type BankMenuPanelProps = {
  room: Room;
  game: GameState;
  currentPlayer: Player;
};

type DebtPaymentState = {
  debt: PlayerDebt;
};

function pendingKindLabel(kind: RoundPending['kind']) {
  const labels: Record<RoundPending['kind'], string> = {
    dividends: 'Dividendos',
    maintenance: 'Manutencoes',
    taxes: 'Impostos',
  };

  return labels[kind];
}

export function BankMenuPanel({ currentPlayer, game, room }: BankMenuPanelProps) {
  const { message, modal } = App.useApp();
  const screens = Grid.useBreakpoint();
  const [loanForm] = Form.useForm<{ amount: number }>();
  const [paymentForm] = Form.useForm<{ amount: number }>();
  const [paymentState, setPaymentState] = useState<DebtPaymentState | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const finance = game.playerFinances[currentPlayer.id];
  const activeDebts = useMemo(
    () => Object.values(finance?.debts ?? {}).filter((debt) => debt.status === 'active'),
    [finance?.debts],
  );
  const receivables = useMemo(
    () =>
      Object.values(finance?.receivables ?? {}).filter(
        (receivable) => receivable.status === 'active',
      ),
    [finance?.receivables],
  );
  const taxes = useMemo(
    () =>
      Object.values(game.taxPendings ?? {}).filter(
        (tax) => tax.playerId === currentPlayer.id && tax.status === 'pending',
      ),
    [currentPlayer.id, game.taxPendings],
  );
  const roundPendings = useMemo(
    () =>
      Object.values(game.roundPendings ?? {}).filter(
        (pending) =>
          pending.playerId === currentPlayer.id &&
          pending.status === 'pending' &&
          pending.kind !== 'taxes',
      ),
    [currentPlayer.id, game.roundPendings],
  );
  const creditLimit = calculateCreditLimit(game, currentPlayer.id);
  const score = calculateBankScore(game, currentPlayer.id);
  const activeDebtTotal = calculateActiveDebtTotal(finance);
  const availableCredit = Math.max(0, creditLimit - activeDebtTotal);
  const loanAmount = Form.useWatch('amount', loanForm) ?? 0;
  const loanDebtTotal = Math.round(Number(loanAmount || 0) * (1 + BANK_LOAN_INTEREST_RATE));
  const interestPercent = Math.round(BANK_LOAN_INTEREST_RATE * 100);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setLoadingAction(true);

    try {
      await action();
      message.success(successMessage);
      loanForm.resetFields();
      paymentForm.resetFields();
      setPaymentState(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Nao foi possivel concluir a acao.');
    } finally {
      setLoadingAction(false);
    }
  }

  function confirmAction(title: string, content: string, action: () => Promise<unknown>, successMessage: string) {
    modal.confirm({
      title,
      content,
      okText: 'Confirmar',
      cancelText: 'Cancelar',
      async onOk() {
        await runAction(action, successMessage);
      },
    });
  }

  const renderMobileDebtCards = () => (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      {activeDebts.length === 0 ? (
        <Empty description="Nenhuma divida ativa" />
      ) : (
        activeDebts.map((debt) => (
          <div className="bank-list-card" key={debt.id}>
            <Flex justify="space-between" gap={12} wrap>
              <Space orientation="vertical" size={2}>
                <Typography.Text strong>{debt.description}</Typography.Text>
                <Typography.Text type="secondary">{debt.kind}</Typography.Text>
              </Space>
              <Typography.Text strong>{formatMoney(debt.amount)}</Typography.Text>
            </Flex>
            <Button size="small" block onClick={() => setPaymentState({ debt })}>
              Pagar
            </Button>
          </div>
        ))
      )}
    </Space>
  );

  const renderMobileReceivableCards = () => (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      {receivables.length === 0 ? (
        <Empty description="Nenhuma divida a receber" />
      ) : (
        receivables.map((receivable) => (
          <div className="bank-list-card" key={receivable.id}>
            <Flex justify="space-between" gap={12} wrap>
              <Typography.Text strong>{receivable.description}</Typography.Text>
              <Typography.Text strong>{formatMoney(receivable.amount)}</Typography.Text>
            </Flex>
            <Button
              size="small"
              block
              onClick={() =>
                confirmAction(
                  'Confirmar perdao',
                  `Perdoar a divida de ${formatMoney(receivable.amount)}?`,
                  () => forgiveReceivable(room.id, currentPlayer.id, receivable.id),
                  'Divida perdoada.',
                )
              }
            >
              Perdoar
            </Button>
          </div>
        ))
      )}
    </Space>
  );

  const renderMobileTaxCards = () => (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      {taxes.length === 0 ? (
        <Empty description="Nenhum imposto pendente" />
      ) : (
        taxes.map((tax) => (
          <div className="bank-list-card" key={tax.id}>
            <Space orientation="vertical" size={6} style={{ width: '100%' }}>
              <Typography.Text strong>{tax.titleName}</Typography.Text>
              <Flex justify="space-between" gap={12}>
                <Typography.Text type="secondary">Valor</Typography.Text>
                <Typography.Text>{formatMoney(tax.amount)}</Typography.Text>
              </Flex>
              <Flex justify="space-between" gap={12}>
                <Typography.Text type="secondary">Agora</Typography.Text>
                <Typography.Text strong>{formatMoney(tax.discountedAmount)}</Typography.Text>
              </Flex>
            </Space>
            <Button
              size="small"
              block
              onClick={() =>
                confirmAction(
                  'Confirmar pagamento',
                  `Pagar imposto de ${formatMoney(tax.discountedAmount)} agora?`,
                  () => payTaxPending(room.id, currentPlayer.id, tax.id),
                  'Imposto pago.',
                )
              }
            >
              Pagar
            </Button>
          </div>
        ))
      )}
    </Space>
  );

  const renderMobilePendingCards = () => (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      {roundPendings.length === 0 ? (
        <Empty description="Nenhuma pendencia" />
      ) : (
        roundPendings.map((pending) => (
          <div className="bank-list-card" key={pending.id}>
            <Flex justify="space-between" gap={12} wrap>
              <Typography.Text strong>{pendingKindLabel(pending.kind)}</Typography.Text>
              <Typography.Text strong>{formatMoney(pending.amount)}</Typography.Text>
            </Flex>
            <Button
              size="small"
              block
              onClick={() =>
                confirmAction(
                  'Confirmar pendencia',
                  `Confirmar ${pendingKindLabel(pending.kind)} de ${formatMoney(pending.amount)}?`,
                  () => confirmRoundPending(room.id, currentPlayer.id, pending.id),
                  'Pendencia confirmada.',
                )
              }
            >
              Confirmar
            </Button>
          </div>
        ))
      )}
    </Space>
  );

  const debtColumns: ColumnsType<PlayerDebt> = [
    {
      title: 'Origem',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      render: (_, debt) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{debt.description}</Typography.Text>
          <Typography.Text type="secondary">{debt.kind}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Valor',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (value) => formatMoney(value),
    },
    {
      title: 'Acoes',
      key: 'actions',
      width: 96,
      align: 'right',
      render: (_, debt) => (
        <Button size="small" onClick={() => setPaymentState({ debt })}>
          Pagar
        </Button>
      ),
    },
  ];
  const receivableColumns: ColumnsType<PlayerDebt> = [
    {
      title: 'Descricao',
      dataIndex: 'description',
      key: 'description',
      width: 220,
    },
    {
      title: 'Valor',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (value) => formatMoney(value),
    },
    {
      title: 'Acoes',
      key: 'actions',
      width: 104,
      align: 'right',
      render: (_, receivable) => (
        <Button
          size="small"
          onClick={() =>
            confirmAction(
              'Confirmar perdao',
              `Perdoar a divida de ${formatMoney(receivable.amount)}?`,
              () => forgiveReceivable(room.id, currentPlayer.id, receivable.id),
              'Divida perdoada.',
            )
          }
        >
          Perdoar
        </Button>
      ),
    },
  ];
  const taxColumns: ColumnsType<TaxPending> = [
    {
      title: 'Titulo',
      dataIndex: 'titleName',
      key: 'titleName',
      width: 190,
    },
    {
      title: 'Valor',
      dataIndex: 'amount',
      key: 'amount',
      width: 140,
      align: 'right',
      render: (_, tax) => (
        <Space orientation="vertical" size={0} align="end">
          <Typography.Text>{formatMoney(tax.amount)}</Typography.Text>
          <Typography.Text type="secondary">
            Agora: {formatMoney(tax.discountedAmount)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Acoes',
      key: 'actions',
      width: 96,
      align: 'right',
      render: (_, tax) => (
        <Button
          size="small"
          onClick={() =>
            confirmAction(
              'Confirmar pagamento',
              `Pagar imposto de ${formatMoney(tax.discountedAmount)} agora?`,
              () => payTaxPending(room.id, currentPlayer.id, tax.id),
              'Imposto pago.',
            )
          }
        >
          Pagar
        </Button>
      ),
    },
  ];
  const pendingColumns: ColumnsType<RoundPending> = [
    {
      title: 'Tipo',
      dataIndex: 'kind',
      key: 'kind',
      width: 160,
      render: (value) => pendingKindLabel(value),
    },
    {
      title: 'Valor',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (value) => formatMoney(value),
    },
    {
      title: 'Acoes',
      key: 'actions',
      width: 112,
      align: 'right',
      render: (_, pending) => (
        <Button
          size="small"
          onClick={() =>
            confirmAction(
              'Confirmar pendencia',
              `Confirmar ${pendingKindLabel(pending.kind)} de ${formatMoney(pending.amount)}?`,
              () => confirmRoundPending(room.id, currentPlayer.id, pending.id),
              'Pendencia confirmada.',
            )
          }
        >
          Confirmar
        </Button>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card className="bank-app-card bank-app-card--dark bank-menu-summary">
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Flex align="center" justify="space-between" gap={12} wrap className="bank-app-card-header">
            <Typography.Title level={4} style={{ margin: 0 }}>
              Banco
            </Typography.Title>
            <Tag color={score <= BANK_LOAN_MIN_SCORE ? 'red' : 'green'}>
              {score} - {getBankScoreLabel(score)}
            </Tag>
          </Flex>
          <Row gutter={[10, 10]}>
            <Col xs={12}>
              <Statistic
                title="Limite"
                value={creditLimit}
                formatter={(value) => formatMoney(Number(value))}
              />
            </Col>
            <Col xs={12}>
              <Statistic
                title="Disponivel"
                value={availableCredit}
                formatter={(value) => formatMoney(Number(value))}
              />
            </Col>
          </Row>
        </Space>
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card className="bank-app-card">
            <Statistic
              title="Receber por rodada"
              value={calculatePlayerRoundIncome(game, currentPlayer.id)}
              prefix={<LineChartOutlined />}
              formatter={(value) => formatMoney(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="bank-app-card">
            <Statistic
              title="Pagar por rodada"
              value={calculatePlayerRoundExpenses(game, currentPlayer.id)}
              prefix={<DollarOutlined />}
              formatter={(value) => formatMoney(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="bank-app-card">
            <Statistic
              title="Dividas"
              value={activeDebtTotal}
              prefix={<BankOutlined />}
              formatter={(value) => formatMoney(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="bank-app-card">
            <Statistic
              title="A receber"
              value={calculateReceivableTotal(finance)}
              prefix={<SafetyCertificateOutlined />}
              formatter={(value) => formatMoney(Number(value))}
            />
          </Card>
        </Col>
      </Row>

      <Card className="bank-app-card">
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Emprestimo do Banco
          </Typography.Title>
          <div className="bank-loan-info">
            <Flex justify="space-between" gap={12}>
              <Typography.Text type="secondary">Limite total</Typography.Text>
              <Typography.Text strong>{formatMoney(creditLimit)}</Typography.Text>
            </Flex>
            <Flex justify="space-between" gap={12}>
              <Typography.Text type="secondary">Limite disponivel</Typography.Text>
              <Typography.Text strong>{formatMoney(availableCredit)}</Typography.Text>
            </Flex>
            <Flex justify="space-between" gap={12}>
              <Typography.Text type="secondary">Dividas ativas</Typography.Text>
              <Typography.Text strong>{formatMoney(activeDebtTotal)}</Typography.Text>
            </Flex>
            <Flex justify="space-between" gap={12}>
              <Typography.Text type="secondary">Taxa de juros</Typography.Text>
              <Typography.Text strong>{interestPercent}%</Typography.Text>
            </Flex>
            <Flex justify="space-between" gap={12}>
              <Typography.Text type="secondary">Total a pagar</Typography.Text>
              <Typography.Text strong>{formatMoney(loanDebtTotal)}</Typography.Text>
            </Flex>
          </div>
          <Form
            form={loanForm}
            layout="vertical"
            onFinish={(values) =>
              confirmAction(
                'Confirmar emprestimo',
                `Contratar emprestimo de ${formatMoney(values.amount)} com total a pagar de ${formatMoney(
                  Math.round(values.amount * (1 + BANK_LOAN_INTEREST_RATE)),
                )}?`,
                () => requestBankLoan(room.id, currentPlayer.id, values.amount),
                'Emprestimo contratado.',
              )
            }
          >
            <Flex align="flex-end" gap={8} wrap>
              <Form.Item
                name="amount"
                label="Valor desejado"
                rules={[{ required: true, message: 'Informe o valor.' }]}
                style={{ flex: '1 1 180px', marginBottom: 0 }}
              >
                <InputNumber
                  min={1}
                  max={availableCredit}
                  precision={0}
                  addonBefore="R$"
                  style={{ width: '100%' }}
                  disabled={score <= BANK_LOAN_MIN_SCORE}
                />
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                disabled={score <= BANK_LOAN_MIN_SCORE || availableCredit <= 0}
                loading={loadingAction}
                className="bank-loan-submit"
              >
                Solicitar
              </Button>
            </Flex>
          </Form>
        </Space>
      </Card>

      <Card title="Pendencias de volta" className="bank-app-card">
        {screens.md ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={pendingColumns}
            dataSource={roundPendings}
            locale={{ emptyText: <Empty description="Nenhuma pendencia" /> }}
          />
        ) : (
          renderMobilePendingCards()
        )}
      </Card>

      <Card title="Dividas ativas" className="bank-app-card">
        {screens.md ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={debtColumns}
            dataSource={activeDebts}
          />
        ) : (
          renderMobileDebtCards()
        )}
      </Card>

      <Card title="Dividas a receber" className="bank-app-card">
        {screens.md ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={receivableColumns}
            dataSource={receivables}
          />
        ) : (
          renderMobileReceivableCards()
        )}
      </Card>

      <Card title="Impostos pendentes" className="bank-app-card">
        {screens.md ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={taxColumns}
            dataSource={taxes}
          />
        ) : (
          renderMobileTaxCards()
        )}
      </Card>

      <Modal
        title="Pagar divida"
        open={Boolean(paymentState)}
        okText="Pagar"
        cancelText="Cancelar"
        confirmLoading={loadingAction}
        onCancel={() => setPaymentState(null)}
        onOk={() => paymentForm.submit()}
      >
        <Form
          form={paymentForm}
          layout="vertical"
          onFinish={(values) => {
            if (!paymentState) return;
            confirmAction(
              'Confirmar pagamento',
              `Pagar ${formatMoney(values.amount)} desta divida?`,
              () => payDebt(room.id, currentPlayer.id, paymentState.debt.id, values.amount),
              'Divida paga.',
            );
          }}
        >
          <Form.Item
            label="Valor"
            name="amount"
            rules={[{ required: true, message: 'Informe o valor.' }]}
          >
            <InputNumber
              min={1}
              max={paymentState?.debt.amount}
              precision={0}
              addonBefore="R$"
              style={{ width: '100%' }}
            />
          </Form.Item>
          {paymentState ? (
            <Button
              block
              icon={<CheckCircleOutlined />}
              onClick={() => paymentForm.setFieldValue('amount', paymentState.debt.amount)}
            >
              Usar valor total: {formatMoney(paymentState.debt.amount)}
            </Button>
          ) : null}
        </Form>
      </Modal>
    </Space>
  );
}
