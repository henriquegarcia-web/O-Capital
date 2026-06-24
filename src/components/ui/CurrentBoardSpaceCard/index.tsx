import { useMemo, useState } from 'react';
import {
  ArrowUpOutlined,
  BankOutlined,
  BuildOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  HomeOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Flex,
  Form,
  Modal,
  Select,
  Space,
  Tooltip,
  Typography,
} from 'antd';

import {
  applyFederalTaxAudit,
  buildTitleProperty,
  buyTitle,
  destroyTitleProperty,
  payDebtWithBankDiscount,
  payTaxPendingWithBankDiscount,
} from '@/api';
import { BOARD_SPACES_BY_INDEX, NEIGHBORHOODS, PROPERTY_BLUEPRINTS } from '@/constants';
import type { GameState, Player, PlayerDebt, TaxPending } from '@/types';
import {
  calculateBankSettlementAmount,
  calculateFederalTaxAudit,
  formatMoney,
  getAvailableBlueprintsForPropertySlot,
  getNextRealEstateBlueprintForSlot,
  getTitlePropertySlots,
  hasCurrentSpaceAction,
} from '@/utils';

type CurrentBoardSpaceCardProps = {
  roomId: string;
  game: GameState;
  currentPlayer: Player;
  players: Player[];
};

type PropertyFormValues = {
  slotIndex: number;
  blueprintKey: string;
  optionName?: string;
};

const EMPTY_PROPERTIES: NonNullable<GameState['titles'][string]['properties']> = [];

function getOwnerName(ownerId: string | null | undefined, players: Player[]) {
  if (!ownerId) {
    return null;
  }

  return players.find((player) => player.id === ownerId)?.name ?? 'Outro jogador';
}

function getBlueprint(blueprintKey: string) {
  return PROPERTY_BLUEPRINTS.find((blueprint) => blueprint.key === blueprintKey);
}

export function CurrentBoardSpaceCard({
  currentPlayer,
  game,
  players,
  roomId,
}: CurrentBoardSpaceCardProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<PropertyFormValues>();
  const [building, setBuilding] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buildModalOpen, setBuildModalOpen] = useState(false);
  const [spaceActionLoading, setSpaceActionLoading] = useState<string | null>(null);
  const [selectedBlueprintKey, setSelectedBlueprintKey] = useState<string>();
  const selectedSlotIndex = Form.useWatch('slotIndex', form);
  const position = game.positions[currentPlayer.id] ?? 1;
  const boardSpace = BOARD_SPACES_BY_INDEX[position] ?? BOARD_SPACES_BY_INDEX[1];
  const title = game.titles?.[String(boardSpace.index)];
  const ownerName = getOwnerName(title?.ownerId, players);
  const isStreet = boardSpace.kind === 'street';
  const isOwner = title?.ownerId === currentPlayer.id;
  const isOwnedByOtherPlayer = Boolean(title?.ownerId && !isOwner);
  const finance = game.playerFinances[currentPlayer.id];
  const landValue = boardSpace.landValue ?? 0;
  const properties = title?.properties ?? EMPTY_PROPERTIES;
  const propertySlots = boardSpace.propertySlots ?? 3;
  const propertySlotItems = useMemo(
    () => getTitlePropertySlots(properties, propertySlots),
    [properties, propertySlots],
  );
  const visiblePropertySlotItems = isOwnedByOtherPlayer
    ? propertySlotItems.filter((property) => Boolean(property))
    : propertySlotItems;
  const selectedSlotProperty =
    typeof selectedSlotIndex === 'number' ? propertySlotItems[selectedSlotIndex] : null;
  const availableBlueprints = useMemo(
    () => getAvailableBlueprintsForPropertySlot(selectedSlotProperty),
    [selectedSlotProperty],
  );
  const hasAvailableBuildSlot = propertySlotItems.some(
    (property) => !property && getAvailableBlueprintsForPropertySlot(property).length > 0,
  );
  const propertyActionTurnStartedAt = title?.lastPropertyActionTurnStartedAt;
  const isCurrentPlayerTurn = game.status === 'playing' && game.turnPlayerId === currentPlayer.id;
  const isAtBankSpace = boardSpace.kind === 'bank';
  const isAtTaxSpace = boardSpace.kind === 'tax';
  const selectedBlueprint = selectedBlueprintKey ? getBlueprint(selectedBlueprintKey) : undefined;
  const federalTaxAudit = useMemo(
    () => calculateFederalTaxAudit(game, currentPlayer.id),
    [currentPlayer.id, game],
  );
  const federalTaxAuditConfirmed = hasCurrentSpaceAction(
    game,
    currentPlayer.id,
    boardSpace.index,
    'federal-tax-audit',
  );
  const eligibleBankDebts = useMemo(
    () =>
      Object.values(finance?.debts ?? {}).filter(
        (debt) =>
          debt.status === 'active' && debt.kind !== 'player-loan' && debt.creditorId === null,
      ),
    [finance?.debts],
  );
  const bankTaxPendings = useMemo(
    () =>
      Object.values(game.taxPendings ?? {}).filter(
        (tax) => tax.playerId === currentPlayer.id && tax.status === 'pending',
      ),
    [currentPlayer.id, game.taxPendings],
  );
  const neighborhood = NEIGHBORHOODS.find((item) => item.key === boardSpace.neighborhoodKey);
  const neighborhoodName = neighborhood?.name ?? (isStreet ? 'Bairro' : boardSpace.name);
  const streetName = boardSpace.streetName ?? boardSpace.name;
  const bonusLabel = neighborhood?.bonusTarget === 'business' ? 'Empreendimentos' : 'Imoveis';
  const bonusBaseLabel =
    neighborhood?.bonusTarget === 'business' ? '20% sobre recebiveis' : '20% sobre alugueis';
  const buyBlockReason = !isCurrentPlayerTurn
    ? 'A compra fica disponivel apenas na sua vez de jogar.'
    : !isStreet
      ? 'Esta casa nao possui titulo.'
      : title?.ownerId
        ? 'Titulo indisponivel.'
        : landValue <= 0
          ? 'Titulo sem valor definido.'
          : (finance?.balance ?? 0) < landValue
            ? 'Saldo insuficiente.'
            : null;
  const buildBlockReason = !isOwner
    ? 'Apenas o dono pode construir.'
    : title?.acquiredAtRound === game.round
      ? 'Construcao disponivel apenas a partir da proxima rodada.'
      : !isCurrentPlayerTurn
        ? 'Acoes de propriedade disponiveis apenas na sua vez.'
        : propertyActionTurnStartedAt === game.turnStartedAt
          ? 'Ja houve construcao, destruicao ou evolucao neste titulo nesta vez.'
          : !hasAvailableBuildSlot
            ? 'Sem terrenos vazios disponiveis para construcao.'
            : null;
  const status = isStreet
    ? ownerName
      ? `${ownerName} e dono desse terreno`
      : 'Disponivel para compra'
    : 'Casa especial estruturada para logica futura';

  function getSlotLabel(slotIndex: number) {
    const property = propertySlotItems[slotIndex];
    const blueprint = property ? getBlueprint(property.blueprintKey) : undefined;

    if (!property || !blueprint) {
      return `Terreno ${slotIndex + 1} - vazio`;
    }

    return `Terreno ${slotIndex + 1} - ${property.optionName ?? blueprint.name}`;
  }

  function openBuildModal() {
    const firstAvailableSlotIndex = propertySlotItems.findIndex(
      (property) => !property && getAvailableBlueprintsForPropertySlot(property).length > 0,
    );

    form.setFieldsValue({
      slotIndex: firstAvailableSlotIndex >= 0 ? firstAvailableSlotIndex : 0,
      blueprintKey: undefined,
      optionName: undefined,
    });
    setSelectedBlueprintKey(undefined);
    setBuildModalOpen(true);
  }

  async function handleBuyTitle() {
    modal.confirm({
      title: 'Confirmar compra',
      content: `Comprar ${boardSpace.name} por ${formatMoney(landValue)}?`,
      okText: 'Comprar',
      cancelText: 'Cancelar',
      async onOk() {
        setBuying(true);

        try {
          await buyTitle(roomId, currentPlayer.id, boardSpace.index);
          message.success('Titulo comprado com sucesso.');
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : 'Nao foi possivel comprar o titulo.',
          );
        } finally {
          setBuying(false);
        }
      },
    });
  }

  async function handleBuildProperty(values: PropertyFormValues) {
    const blueprint = getBlueprint(values.blueprintKey);
    const optionLabel = values.optionName ? ` (${values.optionName})` : '';

    modal.confirm({
      title: 'Confirmar construcao',
      content: `Construir ${blueprint?.name ?? 'propriedade'}${optionLabel} em ${boardSpace.name}?`,
      okText: 'Construir',
      cancelText: 'Cancelar',
      async onOk() {
        setBuilding(true);

        try {
          await buildTitleProperty(
            roomId,
            currentPlayer.id,
            boardSpace.index,
            values.blueprintKey,
            values.slotIndex,
            values.optionName,
          );
          message.success('Propriedade construida com sucesso.');
          setBuildModalOpen(false);
          form.resetFields();
          setSelectedBlueprintKey(undefined);
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : 'Nao foi possivel construir a propriedade.',
          );
        } finally {
          setBuilding(false);
        }
      },
    });
  }

  async function handleDestroyProperty(propertyId: string) {
    const property = properties.find((item) => item.id === propertyId);
    const blueprint = property ? getBlueprint(property.blueprintKey) : undefined;
    const propertyLabel = property?.optionName ?? blueprint?.name ?? 'propriedade';

    modal.confirm({
      title: 'Confirmar destruicao',
      content: `Destruir ${propertyLabel} em ${boardSpace.name}?`,
      okText: 'Destruir',
      okButtonProps: { danger: true },
      cancelText: 'Cancelar',
      async onOk() {
        try {
          await destroyTitleProperty(roomId, currentPlayer.id, boardSpace.index, propertyId);
          message.success('Propriedade destruida com sucesso.');
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : 'Nao foi possivel destruir a propriedade.',
          );
        }
      },
    });
  }

  function getDebtSettlementLabel(debt: PlayerDebt) {
    if (debt.kind === 'bank') return 'Emprestimo do Banco';
    if (debt.kind === 'tax') return 'Divida ativa de imposto';
    if (debt.kind === 'round-fees') return 'Taxas de rodada';

    return debt.description;
  }

  function getTaxSettlementLabel(tax: TaxPending) {
    return `${tax.titleName} - imposto pendente`;
  }

  async function runSpaceAction(actionKey: string, action: () => Promise<unknown>) {
    setSpaceActionLoading(actionKey);

    try {
      await action();
      message.success('Acao aplicada com sucesso.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Nao foi possivel aplicar a acao.');
    } finally {
      setSpaceActionLoading(null);
    }
  }

  function handleFederalTaxAudit() {
    const hasPendingTaxes = federalTaxAudit.pendingTaxTotal > 0;

    modal.confirm({
      title: hasPendingTaxes ? 'Confirmar Malha fina' : 'Confirmar restituicao',
      content: (
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <Flex justify="space-between" gap={12}>
            <Typography.Text type="secondary">Total de propriedades</Typography.Text>
            <Typography.Text strong>{formatMoney(federalTaxAudit.propertyTotal)}</Typography.Text>
          </Flex>
          <Flex justify="space-between" gap={12}>
            <Typography.Text type="secondary">Impostos pendentes</Typography.Text>
            <Typography.Text strong className={hasPendingTaxes ? 'bank-money--danger' : undefined}>
              {formatMoney(federalTaxAudit.pendingTaxTotal)}
            </Typography.Text>
          </Flex>
          <Flex justify="space-between" gap={12}>
            <Typography.Text type="secondary">
              {hasPendingTaxes ? 'Multa de 50%' : 'Bonus de 10%'}
            </Typography.Text>
            <Typography.Text
              strong
              className={hasPendingTaxes ? 'bank-money--danger' : 'bank-money--success'}
            >
              {formatMoney(
                hasPendingTaxes ? federalTaxAudit.fineAmount : federalTaxAudit.refundAmount,
              )}
            </Typography.Text>
          </Flex>
        </Space>
      ),
      okText: 'Confirmar',
      cancelText: 'Cancelar',
      async onOk() {
        await runSpaceAction('tax-audit', () => applyFederalTaxAudit(roomId, currentPlayer.id));
      },
    });
  }

  function handlePayDebtWithDiscount(debt: PlayerDebt) {
    const discountedAmount = calculateBankSettlementAmount(debt.amount);

    modal.confirm({
      title: 'Pagar com desconto',
      content: `Quitar ${debt.description} de ${formatMoney(debt.amount)} por ${formatMoney(
        discountedAmount,
      )}?`,
      okText: 'Pagar',
      cancelText: 'Cancelar',
      async onOk() {
        await runSpaceAction(debt.id, () =>
          payDebtWithBankDiscount(roomId, currentPlayer.id, debt.id),
        );
      },
    });
  }

  function handlePayTaxWithDiscount(tax: TaxPending) {
    const discountedAmount = calculateBankSettlementAmount(tax.amount);

    modal.confirm({
      title: 'Pagar imposto com desconto',
      content: `Quitar ${tax.titleName} de ${formatMoney(tax.amount)} por ${formatMoney(
        discountedAmount,
      )}?`,
      okText: 'Pagar',
      cancelText: 'Cancelar',
      async onOk() {
        await runSpaceAction(tax.id, () =>
          payTaxPendingWithBankDiscount(roomId, currentPlayer.id, tax.id),
        );
      },
    });
  }
  async function handleUpgradeProperty(slotIndex: number) {
    const property = propertySlotItems[slotIndex];
    const nextBlueprint = getNextRealEstateBlueprintForSlot(property);

    if (!property || !nextBlueprint) return;

    modal.confirm({
      title: 'Confirmar upgrade',
      content: `Evoluir para ${nextBlueprint.name} por ${formatMoney(nextBlueprint.constructionCost)}?`,
      okText: 'Evoluir',
      cancelText: 'Cancelar',
      async onOk() {
        try {
          await buildTitleProperty(
            roomId,
            currentPlayer.id,
            boardSpace.index,
            nextBlueprint.key,
            slotIndex,
          );
          message.success('Imovel evoluido com sucesso.');
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : 'Nao foi possivel evoluir o imovel.',
          );
        }
      },
    });
  }

  return (
    <>
      <Card className="bank-app-card">
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Flex
            align="center"
            justify="space-between"
            gap={12}
            wrap
            className="bank-app-card-header"
          >
            <Typography.Title level={4} className="bank-app-section-title">
              Casa atual
            </Typography.Title>
          </Flex>

          <div className="current-space-identity">
            <Flex align="center" gap={10} className="board-space-heading">
              <span
                className="board-space-color"
                style={{ backgroundColor: boardSpace.color }}
                aria-label="Cor da casa"
              />
              {isStreet ? (
                <Space orientation="vertical" size={0} className="board-space-heading__copy">
                  <Typography.Text className="board-space-heading__neighborhood">
                    {neighborhoodName}
                  </Typography.Text>
                  <Typography.Title level={5} className="board-space-heading__title">
                    {streetName}
                  </Typography.Title>
                </Space>
              ) : (
                <Typography.Title level={5} className="board-space-heading__title">
                  {boardSpace.name}
                </Typography.Title>
              )}
            </Flex>
          </div>

          {isStreet && !isOwnedByOtherPlayer ? (
            <div className="current-space-bonus">
              <span
                className="current-space-bonus__accent"
                style={{ backgroundColor: boardSpace.color }}
              />
              <Space orientation="vertical" size={8} className="current-space-bonus__content">
                <Flex align="flex-start" justify="space-between" gap={12} wrap>
                  <Flex vertical gap={6} flex={1} style={{ paddingTop: 3 }}>
                    <Typography.Text type="secondary" className="current-space-bonus__eyebrow">
                      Bonus de localidade
                    </Typography.Text>
                    <Flex align="center" justify="space-between" flex={1}>
                      <Typography.Text strong className="current-space-bonus__title">
                        {bonusLabel}
                      </Typography.Text>
                      <span className="current-space-bonus__rate">{bonusBaseLabel}</span>
                    </Flex>
                  </Flex>
                </Flex>
              </Space>
            </div>
          ) : null}

          {!isOwner ? (
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Status">{status}</Descriptions.Item>
              {isStreet ? (
                <Descriptions.Item label="Terreno">
                  {landValue > 0 ? formatMoney(landValue) : 'Valor pendente'}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
          ) : null}

          {isAtTaxSpace ? (
            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
              <Alert
                type={federalTaxAudit.pendingTaxTotal > 0 ? 'warning' : 'success'}
                showIcon
                title={
                  federalTaxAudit.pendingTaxTotal > 0
                    ? 'Foram encontrados impostos pendentes. A multa sera de 50% sobre o total.'
                    : 'Impostos em dia. O jogador recebe restituicao de 10% sobre o patrimonio em propriedades.'
                }
              />
              <Descriptions bordered column={1} size="small">
                <Descriptions.Item label="Total de propriedades">
                  {formatMoney(federalTaxAudit.propertyTotal)}
                </Descriptions.Item>
                <Descriptions.Item label="Impostos pendentes">
                  {formatMoney(federalTaxAudit.pendingTaxTotal)}
                </Descriptions.Item>
                <Descriptions.Item
                  label={federalTaxAudit.pendingTaxTotal > 0 ? 'Multa 50%' : 'Bonus 10%'}
                >
                  {formatMoney(
                    federalTaxAudit.pendingTaxTotal > 0
                      ? federalTaxAudit.fineAmount
                      : federalTaxAudit.refundAmount,
                  )}
                </Descriptions.Item>
              </Descriptions>
              <Button
                block
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={!isCurrentPlayerTurn || federalTaxAuditConfirmed}
                loading={spaceActionLoading === 'tax-audit'}
                onClick={handleFederalTaxAudit}
              >
                {federalTaxAuditConfirmed ? 'Conferencia ja realizada' : 'Confirmar conferencia'}
              </Button>
              {!isCurrentPlayerTurn ? (
                <Typography.Text type="secondary">
                  Esta acao fica disponivel apenas durante a propria jogada.
                </Typography.Text>
              ) : null}
            </Space>
          ) : null}

          {isAtBankSpace ? (
            <Space orientation="vertical" size={10} style={{ width: '100%' }}>
              <Alert
                type="info"
                showIcon
                title="A casa Banco permite quitar dividas elegiveis e impostos pendentes com 20% de desconto. Emprestimos entre jogadores nao entram."
              />
              {[...eligibleBankDebts, ...bankTaxPendings].length === 0 ? (
                <Typography.Text type="secondary">
                  Nenhuma pendencia elegivel para acerto.
                </Typography.Text>
              ) : null}
              {eligibleBankDebts.map((debt) => {
                const discountedAmount = calculateBankSettlementAmount(debt.amount);

                return (
                  <Flex
                    key={debt.id}
                    align="center"
                    justify="space-between"
                    gap={10}
                    wrap
                    className="board-space-property-slot"
                  >
                    <Flex align="center" gap={8} className="board-space-property-slot__content">
                      <span className="board-space-property-icon board-space-property-icon--active">
                        <BankOutlined />
                      </span>
                      <Space orientation="vertical" size={0}>
                        <Typography.Text strong>{getDebtSettlementLabel(debt)}</Typography.Text>
                        <Typography.Text type="secondary">
                          {formatMoney(debt.amount)} por {formatMoney(discountedAmount)}
                        </Typography.Text>
                      </Space>
                    </Flex>
                    <Button
                      size="small"
                      type="primary"
                      disabled={!isCurrentPlayerTurn || (finance?.balance ?? 0) < discountedAmount}
                      loading={spaceActionLoading === debt.id}
                      onClick={() => handlePayDebtWithDiscount(debt)}
                    >
                      Pagar com desconto
                    </Button>
                  </Flex>
                );
              })}
              {bankTaxPendings.map((tax) => {
                const discountedAmount = calculateBankSettlementAmount(tax.amount);

                return (
                  <Flex
                    key={tax.id}
                    align="center"
                    justify="space-between"
                    gap={10}
                    wrap
                    className="board-space-property-slot"
                  >
                    <Flex align="center" gap={8} className="board-space-property-slot__content">
                      <span className="board-space-property-icon board-space-property-icon--active">
                        <BankOutlined />
                      </span>
                      <Space orientation="vertical" size={0}>
                        <Typography.Text strong>{getTaxSettlementLabel(tax)}</Typography.Text>
                        <Typography.Text type="secondary">
                          {formatMoney(tax.amount)} por {formatMoney(discountedAmount)}
                        </Typography.Text>
                      </Space>
                    </Flex>
                    <Button
                      size="small"
                      type="primary"
                      disabled={!isCurrentPlayerTurn || (finance?.balance ?? 0) < discountedAmount}
                      loading={spaceActionLoading === tax.id}
                      onClick={() => handlePayTaxWithDiscount(tax)}
                    >
                      Pagar com desconto
                    </Button>
                  </Flex>
                );
              })}
              {!isCurrentPlayerTurn ? (
                <Typography.Text type="secondary">
                  Os acertos ficam desabilitados depois que a vez passa para outro jogador.
                </Typography.Text>
              ) : null}
            </Space>
          ) : null}
          {isStreet && title?.ownerId ? (
            <Space orientation="vertical" size={8} style={{ width: '100%' }}>
              {isOwnedByOtherPlayer && visiblePropertySlotItems.length === 0 ? (
                <Typography.Text type="secondary">Nao ha propriedades ainda.</Typography.Text>
              ) : null}
              {visiblePropertySlotItems.map((property, slotIndex) => {
                const originalSlotIndex = property?.slotIndex ?? slotIndex;
                const blueprint = property ? getBlueprint(property.blueprintKey) : undefined;
                const propertyLabel = property?.optionName ?? blueprint?.name ?? 'Terreno vazio';
                const nextUpgradeBlueprint = getNextRealEstateBlueprintForSlot(property);
                const canActOnProperty =
                  isOwner &&
                  title.acquiredAtRound !== game.round &&
                  isCurrentPlayerTurn &&
                  propertyActionTurnStartedAt !== game.turnStartedAt;
                const canUpgrade = Boolean(
                  property &&
                  blueprint?.category === 'real-estate' &&
                  nextUpgradeBlueprint &&
                  canActOnProperty &&
                  (finance?.balance ?? 0) >= nextUpgradeBlueprint.constructionCost,
                );
                const canDestroy = Boolean(property && canActOnProperty);

                return (
                  <Flex
                    key={property?.id ?? originalSlotIndex}
                    align="center"
                    justify="space-between"
                    gap={8}
                    className="board-space-property-slot"
                  >
                    <Flex align="center" gap={8} className="board-space-property-slot__content">
                      <span
                        className={
                          property
                            ? 'board-space-property-icon board-space-property-icon--active'
                            : 'board-space-property-icon'
                        }
                      >
                        {blueprint?.category === 'business' ? <ShopOutlined /> : <HomeOutlined />}
                      </span>
                      <Space orientation="vertical" size={0}>
                        <Typography.Text strong>{propertyLabel}</Typography.Text>
                        {!isOwnedByOtherPlayer ? (
                          <Typography.Text type="secondary">{`Terreno ${originalSlotIndex + 1}`}</Typography.Text>
                        ) : null}
                      </Space>
                    </Flex>
                    {property && isOwner ? (
                      <Space.Compact>
                        {blueprint?.category === 'real-estate' ? (
                          <Tooltip
                            title={
                              nextUpgradeBlueprint
                                ? `Evoluir para ${nextUpgradeBlueprint.name}`
                                : 'Nivel maximo atingido'
                            }
                          >
                            <Button
                              size="small"
                              icon={<ArrowUpOutlined />}
                              disabled={!canUpgrade}
                              onClick={() => handleUpgradeProperty(originalSlotIndex)}
                            />
                          </Tooltip>
                        ) : null}
                        <Tooltip title="Destruir propriedade">
                          <Button
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            disabled={!canDestroy}
                            onClick={() => handleDestroyProperty(property.id)}
                          />
                        </Tooltip>
                      </Space.Compact>
                    ) : null}
                  </Flex>
                );
              })}
            </Space>
          ) : null}

          {isStreet ? (
            <Space orientation="vertical" size={8} style={{ width: '100%' }}>
              {!title?.ownerId ? (
                <Button
                  block
                  type="primary"
                  icon={<ShoppingCartOutlined />}
                  loading={buying}
                  disabled={Boolean(buyBlockReason)}
                  onClick={handleBuyTitle}
                >
                  Comprar titulo
                </Button>
              ) : null}

              {isOwner ? (
                <Button
                  block
                  type="primary"
                  icon={<BuildOutlined />}
                  disabled={Boolean(buildBlockReason)}
                  onClick={openBuildModal}
                >
                  Construir propriedade
                </Button>
              ) : null}

              {buyBlockReason && !title?.ownerId ? (
                <Typography.Text type="secondary">{buyBlockReason}</Typography.Text>
              ) : null}
              {buildBlockReason && isOwner ? (
                <Typography.Text type="secondary">{buildBlockReason}</Typography.Text>
              ) : null}
            </Space>
          ) : null}
        </Space>
      </Card>

      <Modal
        title="Construir propriedade"
        open={buildModalOpen}
        okText="Construir"
        cancelText="Cancelar"
        confirmLoading={building}
        onCancel={() => setBuildModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleBuildProperty}>
          <Form.Item name="slotIndex" label="Terreno" rules={[{ required: true, message: '' }]}>
            <Select
              placeholder="Selecione"
              onChange={() => {
                setSelectedBlueprintKey(undefined);
                form.setFieldValue('blueprintKey', undefined);
                form.setFieldValue('optionName', undefined);
              }}
              options={propertySlotItems.map((property, slotIndex) => ({
                value: slotIndex,
                label: getSlotLabel(slotIndex),
                disabled:
                  Boolean(property) || getAvailableBlueprintsForPropertySlot(property).length === 0,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="blueprintKey"
            label="Propriedade"
            rules={[{ required: true, message: '' }]}
          >
            <Select
              placeholder="Selecione"
              onChange={(value) => {
                setSelectedBlueprintKey(value);
                form.setFieldValue('optionName', undefined);
              }}
              options={availableBlueprints.map((blueprint) => ({
                value: blueprint.key,
                label: `${blueprint.name} - ${formatMoney(blueprint.constructionCost)}`,
                disabled: (finance?.balance ?? 0) < blueprint.constructionCost,
              }))}
            />
          </Form.Item>

          {selectedBlueprint?.options?.length ? (
            <Form.Item name="optionName" label="Tipo" rules={[{ required: true, message: '' }]}>
              <Select
                placeholder="Selecione"
                options={selectedBlueprint.options.map((option) => ({
                  value: option,
                  label: option,
                }))}
              />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
    </>
  );
}
