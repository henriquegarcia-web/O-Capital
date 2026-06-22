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
  Form,
  InputNumber,
  Modal,
  Progress,
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
  const { message } = App.useApp();
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

  const debtColumns: ColumnsType<PlayerDebt> = [
    {
      title: 'Origem',
      dataIndex: 'description',
      key: 'description',
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
      align: 'right',
      render: (value) => formatMoney(value),
    },
    {
      title: 'Acoes',
      key: 'actions',
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
    },
    {
      title: 'Valor',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (value) => formatMoney(value),
    },
    {
      title: 'Acoes',
      key: 'actions',
      align: 'right',
      render: (_, receivable) => (
        <Button
          size="small"
          onClick={() =>
            runAction(
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
    },
    {
      title: 'Valor',
      dataIndex: 'amount',
      key: 'amount',
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
      align: 'right',
      render: (_, tax) => (
        <Button
          size="small"
          onClick={() =>
            runAction(() => payTaxPending(room.id, currentPlayer.id, tax.id), 'Imposto pago.')
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
      render: (value) => pendingKindLabel(value),
    },
    {
      title: 'Valor',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (value) => formatMoney(value),
    },
    {
      title: 'Acoes',
      key: 'actions',
      align: 'right',
      render: (_, pending) => (
        <Button
          size="small"
          onClick={() =>
            runAction(
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
      <Card>
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Banco
          </Typography.Title>
          <Row gutter={[10, 10]}>
            <Col xs={12} md={8}>
              <Statistic
                title="Limite"
                value={creditLimit}
                formatter={(value) => formatMoney(Number(value))}
              />
            </Col>
            <Col xs={12} md={8}>
              <Statistic
                title="Disponivel"
                value={availableCredit}
                formatter={(value) => formatMoney(Number(value))}
              />
            </Col>
            <Col xs={24} md={8}>
              <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                <Typography.Text type="secondary">Pontuacao bancaria</Typography.Text>
                <Progress
                  percent={score}
                  size="small"
                  status={score <= BANK_LOAN_MIN_SCORE ? 'exception' : 'active'}
                />
                <Tag color={score <= BANK_LOAN_MIN_SCORE ? 'red' : 'green'}>
                  {score} - {getBankScoreLabel(score)}
                </Tag>
              </Space>
            </Col>
          </Row>
        </Space>
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Receber por rodada"
              value={calculatePlayerRoundIncome(game, currentPlayer.id)}
              prefix={<LineChartOutlined />}
              formatter={(value) => formatMoney(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Pagar por rodada"
              value={calculatePlayerRoundExpenses(game, currentPlayer.id)}
              prefix={<DollarOutlined />}
              formatter={(value) => formatMoney(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Dividas"
              value={activeDebtTotal}
              prefix={<BankOutlined />}
              formatter={(value) => formatMoney(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="A receber"
              value={calculateReceivableTotal(finance)}
              prefix={<SafetyCertificateOutlined />}
              formatter={(value) => formatMoney(Number(value))}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Emprestimo do Banco
          </Typography.Title>
          <Form
            form={loanForm}
            layout="vertical"
            onFinish={(values) =>
              runAction(
                () => requestBankLoan(room.id, currentPlayer.id, values.amount),
                'Emprestimo contratado.',
              )
            }
          >
            <Form.Item
              name="amount"
              label="Valor desejado"
              rules={[{ required: true, message: 'Informe o valor.' }]}
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
              block
              disabled={score <= BANK_LOAN_MIN_SCORE || availableCredit <= 0}
              loading={loadingAction}
            >
              Solicitar emprestimo
            </Button>
          </Form>
        </Space>
      </Card>

      <Card title="Pendencias de volta">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          columns={pendingColumns}
          dataSource={roundPendings}
          locale={{ emptyText: <Empty description="Nenhuma pendencia" /> }}
        />
      </Card>

      <Card title="Dividas ativas">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          columns={debtColumns}
          dataSource={activeDebts}
        />
      </Card>

      <Card title="Dividas a receber">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          columns={receivableColumns}
          dataSource={receivables}
        />
      </Card>

      <Card title="Impostos pendentes">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          columns={taxColumns}
          dataSource={taxes}
        />
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
            void runAction(
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
