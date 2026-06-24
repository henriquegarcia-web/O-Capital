import { useMemo, useState } from 'react';
import {
  ArrowUpOutlined,
  BuildOutlined,
  DeleteOutlined,
  HomeOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import {
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

import { buildTitleProperty, buyTitle, destroyTitleProperty } from '@/api';
import { BOARD_SPACES_BY_INDEX, NEIGHBORHOODS, PROPERTY_BLUEPRINTS } from '@/constants';
import type { GameState, Player } from '@/types';
import {
  formatMoney,
  getAvailableBlueprintsForPropertySlot,
  getNextRealEstateBlueprintForSlot,
  getTitlePropertySlots,
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
  const selectedSlotProperty =
    typeof selectedSlotIndex === 'number' ? propertySlotItems[selectedSlotIndex] : null;
  const availableBlueprints = useMemo(
    () => getAvailableBlueprintsForPropertySlot(selectedSlotProperty),
    [selectedSlotProperty],
  );
  const hasAvailableBuildSlot = propertySlotItems.some(
    (property) => !property && getAvailableBlueprintsForPropertySlot(property).length > 0,
  );
  const propertyActionRound = title?.lastPropertyActionRound ?? title?.lastPropertyPurchaseRound;
  const selectedBlueprint = selectedBlueprintKey ? getBlueprint(selectedBlueprintKey) : undefined;
  const neighborhood = NEIGHBORHOODS.find((item) => item.key === boardSpace.neighborhoodKey);
  const neighborhoodName = neighborhood?.name ?? (isStreet ? 'Bairro' : boardSpace.name);
  const streetName = boardSpace.streetName ?? boardSpace.name;
  const bonusBlueprints = PROPERTY_BLUEPRINTS.filter((blueprint) =>
    neighborhood?.bonusTarget === 'business'
      ? blueprint.category === 'business'
      : blueprint.category === 'real-estate',
  );
  const bonusLabel =
    neighborhood?.bonusTarget === 'business' ? 'Empreendimentos com bonus' : 'Imoveis com bonus';
  const buyBlockReason = !isStreet
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
      : propertyActionRound === game.round
        ? 'Ja houve construcao ou destruicao neste titulo nesta rodada.'
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

          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Status">{status}</Descriptions.Item>
            {isStreet ? (
              <Descriptions.Item label="Terreno">
                {landValue > 0 ? formatMoney(landValue) : 'Valor pendente'}
              </Descriptions.Item>
            ) : null}
          </Descriptions>

          {isStreet ? (
            <div className="current-space-bonus">
              <Flex align="center" justify="space-between" gap={10} wrap>
                <Typography.Text type="secondary">Bonus do bairro</Typography.Text>
                <Typography.Text strong>{bonusLabel}</Typography.Text>
              </Flex>
              <Typography.Text type="secondary" className="current-space-bonus__items">
                {bonusBlueprints.map((blueprint) => blueprint.name).join(', ')}
              </Typography.Text>
            </div>
          ) : null}

          {isStreet && title?.ownerId ? (
            <Space orientation="vertical" size={8} style={{ width: '100%' }}>
              {propertySlotItems.map((property, slotIndex) => {
                const blueprint = property ? getBlueprint(property.blueprintKey) : undefined;
                const propertyLabel = property?.optionName ?? blueprint?.name ?? 'Terreno vazio';
                const nextUpgradeBlueprint = getNextRealEstateBlueprintForSlot(property);
                const canActOnProperty =
                  isOwner &&
                  title.acquiredAtRound !== game.round &&
                  propertyActionRound !== game.round;
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
                    key={property?.id ?? slotIndex}
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
                        <Typography.Text type="secondary">{`Terreno ${slotIndex + 1}`}</Typography.Text>
                      </Space>
                    </Flex>
                    {property ? (
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
                              onClick={() => handleUpgradeProperty(slotIndex)}
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
              {isOwnedByOtherPlayer ? (
                <Typography.Text type="secondary">
                  Aluguel automatico sera aplicado ao cair em titulo com imovel.
                </Typography.Text>
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
          <Form.Item
            name="slotIndex"
            label="Terreno"
            rules={[{ required: true, message: 'Selecione um terreno.' }]}
          >
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
            rules={[{ required: true, message: 'Selecione uma propriedade.' }]}
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
            <Form.Item
              name="optionName"
              label="Tipo"
              rules={[{ required: true, message: 'Selecione o tipo do empreendimento.' }]}
            >
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
