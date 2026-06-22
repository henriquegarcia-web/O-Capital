import { useMemo, useState } from 'react';
import {
  BankOutlined,
  BuildOutlined,
  HomeOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
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

import { buildTitleProperty, buyTitle } from '@/api';
import { BOARD_SPACES_BY_INDEX, PROPERTY_BLUEPRINTS } from '@/constants';
import type { GameState, Player, PropertyBlueprint } from '@/types';
import { formatMoney, getNextRealEstateBlueprint } from '@/utils';

type CurrentBoardSpaceCardProps = {
  roomId: string;
  game: GameState;
  currentPlayer: Player;
  players: Player[];
};

type PropertyFormValues = {
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

function getAvailableBlueprints(
  properties = [] as NonNullable<GameState['titles'][string]['properties']>,
) {
  const nextRealEstateBlueprint = getNextRealEstateBlueprint(properties);
  const businessBlueprints = PROPERTY_BLUEPRINTS.filter(
    (blueprint) => blueprint.category === 'business',
  );

  return [nextRealEstateBlueprint, ...businessBlueprints].filter(
    (blueprint): blueprint is PropertyBlueprint => Boolean(blueprint),
  );
}

export function CurrentBoardSpaceCard({
  currentPlayer,
  game,
  players,
  roomId,
}: CurrentBoardSpaceCardProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PropertyFormValues>();
  const [building, setBuilding] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buildModalOpen, setBuildModalOpen] = useState(false);
  const [selectedBlueprintKey, setSelectedBlueprintKey] = useState<string>();
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
  const availableBlueprints = useMemo(() => getAvailableBlueprints(properties), [properties]);
  const selectedBlueprint = selectedBlueprintKey ? getBlueprint(selectedBlueprintKey) : undefined;
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
    : properties.length >= propertySlots
      ? 'Limite de propriedades atingido.'
      : title?.lastPropertyPurchaseRound === game.round
        ? 'Ja houve construcao neste titulo nesta rodada.'
        : availableBlueprints.length === 0
          ? 'Sem propriedades disponiveis para este titulo.'
          : null;
  const status = isStreet
    ? ownerName
      ? `${ownerName} e dono desse terreno`
      : 'Disponivel para compra'
    : 'Casa especial estruturada para logica futura';

  async function handleBuyTitle() {
    setBuying(true);

    try {
      await buyTitle(roomId, currentPlayer.id, boardSpace.index);
      message.success('Titulo comprado com sucesso.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Nao foi possivel comprar o titulo.');
    } finally {
      setBuying(false);
    }
  }

  async function handleBuildProperty(values: PropertyFormValues) {
    setBuilding(true);

    try {
      await buildTitleProperty(
        roomId,
        currentPlayer.id,
        boardSpace.index,
        values.blueprintKey,
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
  }

  return (
    <>
      <Card>
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Flex align="flex-start" justify="space-between" gap={12} wrap>
            <Flex align="center" gap={10} className="board-space-heading">
              <span
                className="board-space-color"
                style={{ backgroundColor: boardSpace.color }}
                aria-label="Cor da casa"
              />
              <Typography.Title level={5} style={{ fontSize: 14, margin: 0 }}>
                {boardSpace.name}
              </Typography.Title>
            </Flex>
          </Flex>

          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Status">{status}</Descriptions.Item>
            {isStreet ? (
              <Descriptions.Item label="Terreno">
                {landValue > 0 ? formatMoney(landValue) : 'Valor pendente'}
              </Descriptions.Item>
            ) : null}
          </Descriptions>

          {title?.ownerId ? (
            <Flex gap={10} align="center" wrap>
              {properties.length > 0 ? (
                properties.map((property) => {
                  const blueprint = getBlueprint(property.blueprintKey);
                  const iconTitle = property.optionName ?? blueprint?.name ?? property.blueprintKey;

                  return (
                    <Tooltip key={property.id} title={iconTitle}>
                      {blueprint?.category === 'business' ? (
                        <ShopOutlined className="board-space-business-icon" />
                      ) : (
                        <HomeOutlined className="board-space-business-icon" />
                      )}
                    </Tooltip>
                  );
                })
              ) : (
                <Tooltip title="Terreno sem propriedades">
                  <BankOutlined className="board-space-business-icon" />
                </Tooltip>
              )}
              <Tooltip title="Negociavel">
                <ShoppingOutlined className="board-space-business-icon" />
              </Tooltip>
            </Flex>
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
                  icon={<BuildOutlined />}
                  disabled={Boolean(buildBlockReason)}
                  onClick={() => setBuildModalOpen(true)}
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
