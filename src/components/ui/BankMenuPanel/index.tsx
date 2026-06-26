import { useMemo, useState } from 'react';
import {
  BankOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Flex,
  Form,
  Grid,
  InputNumber,
  Modal,
  Select,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';

import {
  acceptPlayerLoanOffer,
  createPlayerLoanOffer,
  declinePlayerLoanOffer,
  forgiveReceivable,
  payDebt,
  payTaxPending,
  requestBankLoan,
} from '@/api';
import type { GameState, Player, PlayerDebt, PlayerLoanOffer, Room, TaxPending } from '@/types';
import {
  BANK_LOAN_INTEREST_RATE,
  calculateActiveDebtTotal,
  calculateBankScore,
  calculateCreditLimit,
  calculateLoanDebtAmount,
  calculatePendingTaxTotal,
  calculateProjectedBankScore,
  calculateReceivableTotal,
  formatMoney,
  getBankScoreLabel,
  getTaxPendingPayableAmount,
  isPlayerOnBankSpace,
} from '@/utils';

type BankMenuPanelProps = {
  room: Room;
  game: GameState;
  currentPlayer: Player;
  players: Player[];
};

type DebtPaymentState = {
  debt: PlayerDebt;
};

function getPlayerName(players: Player[], playerId: string) {
  return players.find((player) => player.id === playerId)?.name ?? 'Jogador';
}

function formatPropertyCount(count: number) {
  return `${count} ${count === 1 ? 'propriedade' : 'propriedades'}`;
}

function getBankScoreColor(score: number) {
  if (score <= 10) return 'red';
  if (score <= 50) return 'yellow';

  return 'green';
}

export function BankMenuPanel({ currentPlayer, game, players, room }: BankMenuPanelProps) {
  const { message, modal } = App.useApp();
  const screens = Grid.useBreakpoint();
  const [loanForm] = Form.useForm<{ amount: number }>();
  const [playerLoanForm] = Form.useForm<{ lenderId: string; amount: number }>();
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
  const receivedLoanOffers = useMemo(
    () =>
      Object.values(game.playerLoanOffers ?? {}).filter(
        (offer) => offer.lenderId === currentPlayer.id && offer.status === 'pending',
      ),
    [currentPlayer.id, game.playerLoanOffers],
  );
  const sentLoanOffers = useMemo(
    () =>
      Object.values(game.playerLoanOffers ?? {}).filter(
        (offer) => offer.borrowerId === currentPlayer.id && offer.status === 'pending',
      ),
    [currentPlayer.id, game.playerLoanOffers],
  );
  const loanLenderOptions = players
    .filter((player) => player.id !== currentPlayer.id && player.status !== 'eliminated')
    .map((player) => ({ value: player.id, label: player.name }));
  const creditLimit = calculateCreditLimit(game, currentPlayer.id);
  const score = calculateBankScore(game, currentPlayer.id);
  const activeDebtTotal = calculateActiveDebtTotal(finance);
  const availableCredit = Math.max(0, creditLimit - activeDebtTotal);
  const loanAmount = Form.useWatch('amount', loanForm) ?? 0;
  const playerLoanAmount = Form.useWatch('amount', playerLoanForm) ?? 0;
  const playerLoanProjectedScore =
    Number(playerLoanAmount || 0) > 0
      ? calculateProjectedBankScore(game, currentPlayer.id, Number(playerLoanAmount))
      : score;
  const isPlayerLoanBankruptcy = Number(playerLoanAmount || 0) > 0 && playerLoanProjectedScore <= 0;
  const isPlayerLoanPreBankruptcy = playerLoanProjectedScore >= 1 && playerLoanProjectedScore <= 10;
  const loanDebtTotal = calculateLoanDebtAmount(Number(loanAmount || 0));
  const projectedScore =
    loanDebtTotal > 0 ? calculateProjectedBankScore(game, currentPlayer.id, loanDebtTotal) : score;
  const isProjectedBankruptcy = loanDebtTotal > 0 && projectedScore <= 0;
  const isProjectedPreBankruptcy = projectedScore >= 1 && projectedScore <= 10;
  const isAtBank =
    isPlayerOnBankSpace(game, currentPlayer.id) &&
    game.status === 'playing' &&
    game.turnPlayerId === currentPlayer.id;
  const pendingTaxTotal = calculatePendingTaxTotal(game, currentPlayer.id);
  const activeLoanCount = activeDebts.filter(
    (debt) => debt.kind === 'bank' || debt.kind === 'player-loan',
  ).length;
  const interestPercent = Math.round(BANK_LOAN_INTEREST_RATE * 100);

  function renderPendingAccordionLabel(label: string, count: number) {
    const color =
      count === 0
        ? 'default'
        : label === 'Dividas a receber'
          ? 'green'
          : 'red';

    return (
      <Flex align="center" justify="space-between" gap={10}>
        <span>{label}</span>
        <Tag color={color}>{count}</Tag>
      </Flex>
    );
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setLoadingAction(true);

    try {
      await action();
      message.success(successMessage);
      loanForm.resetFields();
      playerLoanForm.resetFields();
      paymentForm.resetFields();
      setPaymentState(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Nao foi possivel concluir a acao.');
    } finally {
      setLoadingAction(false);
    }
  }

  function confirmAction(
    title: string,
    content: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
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

  function getTaxTitleLabel(tax: TaxPending) {
    const propertyCount = game.titles[tax.boardIndex]?.properties?.length ?? 0;

    return `${tax.titleName} (${formatPropertyCount(propertyCount)})`;
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
              <Typography.Text strong className="bank-money--success">
                {formatMoney(receivable.amount)}
              </Typography.Text>
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
        taxes.map((tax) => {
          const payableAmount = getTaxPendingPayableAmount(game, currentPlayer.id, tax);

          return (
            <div className="bank-list-card" key={tax.id}>
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                <Typography.Text strong>{getTaxTitleLabel(tax)}</Typography.Text>
                <Flex justify="space-between" gap={12}>
                  <Typography.Text type="secondary">Valor cheio</Typography.Text>
                  <Typography.Text className="bank-money--danger">
                    {formatMoney(tax.amount)}
                  </Typography.Text>
                </Flex>
                {isAtBank ? (
                  <>
                    <Flex justify="space-between" gap={12}>
                      <Typography.Text type="secondary">Com desconto</Typography.Text>
                      <Typography.Text strong className="bank-money--danger">
                        {formatMoney(payableAmount)}
                      </Typography.Text>
                    </Flex>
                    <Alert
                      type="info"
                      showIcon
                      title="Voce esta na casa Banco. O desconto vale individualmente para este imposto."
                    />
                  </>
                ) : null}
              </Space>
              <Button
                size="small"
                block
                onClick={() =>
                  confirmAction(
                    'Confirmar pagamento',
                    `Pagar imposto de ${formatMoney(payableAmount)} agora?`,
                    () => payTaxPending(room.id, currentPlayer.id, tax.id),
                    'Imposto pago.',
                  )
                }
              >
                Pagar
              </Button>
            </div>
          );
        })
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
      render: (value) => (
        <Typography.Text className="bank-money--danger">{formatMoney(value)}</Typography.Text>
      ),
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
      render: (value) => (
        <Typography.Text className="bank-money--success">{formatMoney(value)}</Typography.Text>
      ),
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
      key: 'titleName',
      width: 190,
      render: (_, tax) => getTaxTitleLabel(tax),
    },
    {
      title: 'Valor',
      dataIndex: 'amount',
      key: 'amount',
      width: 170,
      align: 'right',
      render: (_, tax) => {
        const payableAmount = getTaxPendingPayableAmount(game, currentPlayer.id, tax);

        return (
          <Space orientation="vertical" size={0} align="end">
            <Typography.Text className="bank-money--danger">
              {formatMoney(tax.amount)}
            </Typography.Text>
            {isAtBank ? (
              <Typography.Text type="secondary" className="bank-money--danger">
                No Banco: {formatMoney(payableAmount)}
              </Typography.Text>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: 'Aviso',
      key: 'notice',
      width: 220,
      render: () =>
        isAtBank ? (
          <Typography.Text type="secondary">
            Desconto disponivel individualmente na casa Banco.
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">Valor cheio fora do Banco.</Typography.Text>
        ),
    },
    {
      title: 'Acoes',
      key: 'actions',
      width: 96,
      align: 'right',
      render: (_, tax) => {
        const payableAmount = getTaxPendingPayableAmount(game, currentPlayer.id, tax);

        return (
          <Button
            size="small"
            onClick={() =>
              confirmAction(
                'Confirmar pagamento',
                `Pagar imposto de ${formatMoney(payableAmount)} agora?`,
                () => payTaxPending(room.id, currentPlayer.id, tax.id),
                'Imposto pago.',
              )
            }
          >
            Pagar
          </Button>
        );
      },
    },
  ];
  const renderMobileLoanOfferCards = () => (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      {receivedLoanOffers.length === 0 && sentLoanOffers.length === 0 ? (
        <Empty description="Nenhuma proposta de emprestimo" />
      ) : (
        <>
          {receivedLoanOffers.map((offer) => (
            <div className="bank-list-card" key={offer.id}>
              <Flex justify="space-between" gap={12} wrap>
                <Space orientation="vertical" size={2}>
                  <Typography.Text strong>
                    {getPlayerName(players, offer.borrowerId)}
                  </Typography.Text>
                  <Typography.Text type="secondary">Solicitou emprestimo</Typography.Text>
                </Space>
                <Typography.Text strong>{formatMoney(offer.amount)}</Typography.Text>
              </Flex>
              <Flex gap={8} wrap>
                <Button
                  size="small"
                  type="primary"
                  onClick={() =>
                    confirmAction(
                      'Aceitar emprestimo',
                      `Emprestar ${formatMoney(offer.amount)} para ${getPlayerName(players, offer.borrowerId)}?`,
                      () => acceptPlayerLoanOffer(room.id, currentPlayer.id, offer.id),
                      'Emprestimo aceito.',
                    )
                  }
                >
                  Aceitar
                </Button>
                <Button
                  size="small"
                  danger
                  onClick={() =>
                    confirmAction(
                      'Recusar emprestimo',
                      'Recusar esta proposta de emprestimo?',
                      () => declinePlayerLoanOffer(room.id, currentPlayer.id, offer.id),
                      'Proposta recusada.',
                    )
                  }
                >
                  Recusar
                </Button>
              </Flex>
            </div>
          ))}
          {sentLoanOffers.map((offer) => (
            <div className="bank-list-card" key={offer.id}>
              <Flex justify="space-between" gap={12} wrap>
                <Space orientation="vertical" size={2}>
                  <Typography.Text strong>{getPlayerName(players, offer.lenderId)}</Typography.Text>
                  <Typography.Text type="secondary">Aguardando resposta</Typography.Text>
                </Space>
                <Typography.Text strong>{formatMoney(offer.amount)}</Typography.Text>
              </Flex>
              <Button
                size="small"
                danger
                block
                onClick={() =>
                  confirmAction(
                    'Cancelar solicitacao',
                    'Cancelar esta solicitacao de emprestimo?',
                    () => declinePlayerLoanOffer(room.id, currentPlayer.id, offer.id),
                    'Solicitacao cancelada.',
                  )
                }
              >
                Cancelar
              </Button>
            </div>
          ))}
        </>
      )}
    </Space>
  );

  const loanOfferColumns: ColumnsType<PlayerLoanOffer> = [
    {
      title: 'Jogador',
      key: 'player',
      render: (_, offer) =>
        offer.lenderId === currentPlayer.id
          ? getPlayerName(players, offer.borrowerId)
          : getPlayerName(players, offer.lenderId),
    },
    {
      title: 'Tipo',
      key: 'type',
      render: (_, offer) => (offer.lenderId === currentPlayer.id ? 'Recebida' : 'Enviada'),
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
      render: (_, offer) =>
        offer.lenderId === currentPlayer.id ? (
          <Space size={6}>
            <Button
              size="small"
              type="primary"
              onClick={() =>
                confirmAction(
                  'Aceitar emprestimo',
                  `Emprestar ${formatMoney(offer.amount)} para ${getPlayerName(players, offer.borrowerId)}?`,
                  () => acceptPlayerLoanOffer(room.id, currentPlayer.id, offer.id),
                  'Emprestimo aceito.',
                )
              }
            >
              Aceitar
            </Button>
            <Button
              size="small"
              danger
              onClick={() =>
                confirmAction(
                  'Recusar emprestimo',
                  'Recusar esta proposta de emprestimo?',
                  () => declinePlayerLoanOffer(room.id, currentPlayer.id, offer.id),
                  'Proposta recusada.',
                )
              }
            >
              Recusar
            </Button>
          </Space>
        ) : (
          <Button
            size="small"
            danger
            onClick={() =>
              confirmAction(
                'Cancelar solicitacao',
                'Cancelar esta solicitacao de emprestimo?',
                () => declinePlayerLoanOffer(room.id, currentPlayer.id, offer.id),
                'Solicitacao cancelada.',
              )
            }
          >
            Cancelar
          </Button>
        ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card className="player-finance-card bank-menu-summary">
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Flex
            align="center"
            justify="space-between"
            gap={12}
            wrap
            className="bank-app-card-header"
          >
            <Typography.Title level={4} className="player-finance-card__title">
              Banco
            </Typography.Title>
            <Tag color={getBankScoreColor(score)}>
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
          <Row gutter={[10, 10]}>
            <Col xs={12}>
              <div className="player-finance-card__metric bank-page-metric">
                <BankOutlined />
                <Typography.Text className="player-finance-card__metric-label">
                  Dividas ativas
                </Typography.Text>
                <Typography.Text className="player-finance-card__metric-value">
                  {formatMoney(activeDebtTotal)}
                </Typography.Text>
              </div>
            </Col>
            <Col xs={12}>
              <div className="player-finance-card__metric bank-page-metric">
                <SafetyCertificateOutlined />
                <Typography.Text className="player-finance-card__metric-label">
                  Dividas a receber
                </Typography.Text>
                <Typography.Text className="player-finance-card__metric-value">
                  {formatMoney(calculateReceivableTotal(finance))}
                </Typography.Text>
              </div>
            </Col>
            <Col xs={12}>
              <div className="player-finance-card__metric bank-page-metric">
                <DollarOutlined />
                <Typography.Text className="player-finance-card__metric-label">
                  Impostos pendentes
                </Typography.Text>
                <Typography.Text className="player-finance-card__metric-value">
                  {formatMoney(pendingTaxTotal)}
                </Typography.Text>
              </div>
            </Col>
            <Col xs={12}>
              <div className="player-finance-card__metric bank-page-metric">
                <SwapOutlined />
                <Typography.Text className="player-finance-card__metric-label">
                  Emprestimos ativos
                </Typography.Text>
                <Typography.Text className="player-finance-card__metric-value">
                  {activeLoanCount}
                </Typography.Text>
              </div>
            </Col>
          </Row>
        </Space>
      </Card>

      <Collapse
        className="bank-app-card bank-loan-collapse"
        items={[
          {
            key: 'bank-loan',
            label: 'Emprestimo do Banco',
            children: (
              <Space orientation="vertical" size={14} style={{ width: '100%' }}>
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
                {isProjectedPreBankruptcy ? (
                  <Alert
                    type="warning"
                    showIcon
                    title={`Este emprestimo levara o jogador a pre-falencia: score ${projectedScore}.`}
                  />
                ) : null}
                {isProjectedBankruptcy ? (
                  <Alert
                    type="error"
                    showIcon
                    title="Emprestimo bloqueado: este valor levaria o jogador a falencia."
                  />
                ) : null}
                <Form
                  form={loanForm}
                  layout="vertical"
                  onFinish={(values) =>
                    confirmAction(
                      'Confirmar emprestimo',
                      `Contratar emprestimo de ${formatMoney(values.amount)} com total a pagar de ${formatMoney(
                        calculateLoanDebtAmount(values.amount),
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
                      rules={[{ required: true, message: '' }]}
                      style={{ flex: '1 1 180px', marginBottom: 0 }}
                    >
                      <Space.Compact style={{ width: '100%' }}>
                        <Button disabled className="money-input-prefix">
                          R$
                        </Button>
                        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                      </Space.Compact>
                    </Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      disabled={isProjectedBankruptcy}
                      loading={loadingAction}
                      className="bank-loan-submit"
                    >
                      Solicitar
                    </Button>
                  </Flex>
                </Form>
              </Space>
            ),
          },
        ]}
      />

      <Collapse
        className="bank-app-card bank-loan-collapse"
        items={[
          {
            key: 'player-loan',
            label: 'Emprestimo entre jogadores',
            children: (
              <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                {isPlayerLoanPreBankruptcy ? (
                  <Alert
                    type="warning"
                    showIcon
                    title={`Este emprestimo levara o jogador a pre-falencia: score ${playerLoanProjectedScore}.`}
                  />
                ) : null}
                {isPlayerLoanBankruptcy ? (
                  <Alert
                    type="error"
                    showIcon
                    title="Emprestimo bloqueado: este valor levaria o jogador a falencia."
                  />
                ) : null}
                <Form
                  form={playerLoanForm}
                  layout="vertical"
                  onFinish={(values) =>
                    confirmAction(
                      'Solicitar emprestimo',
                      `Solicitar ${formatMoney(values.amount)} a ${getPlayerName(players, values.lenderId)}?`,
                      () =>
                        createPlayerLoanOffer(
                          room.id,
                          currentPlayer.id,
                          values.lenderId,
                          values.amount,
                        ),
                      'Solicitacao enviada.',
                    )
                  }
                >
                  <Flex align="flex-end" gap={8} wrap>
                    <Form.Item
                      name="lenderId"
                      label="Jogador"
                      rules={[{ required: true, message: '' }]}
                      style={{ flex: '1 1 180px', marginBottom: 0 }}
                    >
                      <Select placeholder="Selecione" options={loanLenderOptions} />
                    </Form.Item>
                    <Form.Item
                      name="amount"
                      label="Valor"
                      rules={[{ required: true, message: '' }]}
                      style={{ flex: '1 1 150px', marginBottom: 0 }}
                    >
                      <Space.Compact style={{ width: '100%' }}>
                        <Button disabled className="money-input-prefix">
                          R$
                        </Button>
                        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                      </Space.Compact>
                    </Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      icon={<SwapOutlined />}
                      disabled={isPlayerLoanBankruptcy}
                      loading={loadingAction}
                      className="bank-loan-submit"
                    >
                      Solicitar
                    </Button>
                  </Flex>
                </Form>
                {screens.md ? (
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    columns={loanOfferColumns}
                    dataSource={[...receivedLoanOffers, ...sentLoanOffers]}
                    locale={{ emptyText: <Empty description="Nenhuma proposta de emprestimo" /> }}
                  />
                ) : (
                  renderMobileLoanOfferCards()
                )}
              </Space>
            ),
          },
        ]}
      />

      <Collapse
        className="bank-app-card bank-section-collapse"
        items={[
          {
            key: 'active-debts',
            label: renderPendingAccordionLabel('Dividas ativas', activeDebts.length),
            children: screens.md ? (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                columns={debtColumns}
                dataSource={activeDebts}
              />
            ) : (
              renderMobileDebtCards()
            ),
          },
        ]}
      />

      <Collapse
        className="bank-app-card bank-section-collapse"
        items={[
          {
            key: 'receivables',
            label: renderPendingAccordionLabel('Dividas a receber', receivables.length),
            children: screens.md ? (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                columns={receivableColumns}
                dataSource={receivables}
              />
            ) : (
              renderMobileReceivableCards()
            ),
          },
        ]}
      />

      <Collapse
        className="bank-app-card bank-section-collapse"
        items={[
          {
            key: 'taxes',
            label: renderPendingAccordionLabel('Impostos pendentes', taxes.length),
            children: screens.md ? (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                columns={taxColumns}
                dataSource={taxes}
              />
            ) : (
              renderMobileTaxCards()
            ),
          },
        ]}
      />

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
          <Form.Item label="Valor" name="amount" rules={[{ required: true, message: '' }]}>
            <Space.Compact style={{ width: '100%' }}>
              <Button disabled className="money-input-prefix">
                R$
              </Button>
              <InputNumber
                min={1}
                max={paymentState?.debt.amount}
                precision={0}
                style={{ width: '100%' }}
              />
            </Space.Compact>
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
