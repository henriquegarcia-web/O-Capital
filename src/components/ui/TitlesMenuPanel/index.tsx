import { useMemo, useState } from 'react';
import {
  BankOutlined,
  HomeOutlined,
  RiseOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';

import {
  acceptTitleSaleOffer,
  closeTitleAuction,
  createTitleAuction,
  createTitleSaleOffer,
  placeTitleAuctionBid,
  sellTitleToBank,
} from '@/api';
import { BOARD_SPACES_BY_INDEX, PROPERTY_BLUEPRINTS } from '@/constants';
import type {
  GameState,
  Player,
  Room,
  TitleAuction,
  TitleOwnership,
  TitleSaleOffer,
} from '@/types';
import {
  calculateTitleBankSaleValue,
  calculateTitleBuiltValue,
  calculateTitleTax,
  formatMoney,
  getPlayerTitles,
  getTitleLandValue,
} from '@/utils';

type TitlesMenuPanelProps = {
  room: Room;
  game: GameState;
  currentPlayer: Player;
  players: Player[];
};

type TitleActionState =
  | { type: 'direct-sale'; title: TitleOwnership }
  | { type: 'auction'; title: TitleOwnership };

function getBlueprintName(blueprintKey: string) {
  return (
    PROPERTY_BLUEPRINTS.find((blueprint) => blueprint.key === blueprintKey)?.name ?? blueprintKey
  );
}

function getPlayerName(players: Player[], playerId: string) {
  return players.find((player) => player.id === playerId)?.name ?? 'Jogador';
}

export function TitlesMenuPanel({ currentPlayer, game, players, room }: TitlesMenuPanelProps) {
  const { message } = App.useApp();
  const [saleForm] = Form.useForm<{ buyerId: string; amount: number }>();
  const [auctionForm] = Form.useForm<{ initialBid: number }>();
  const [bidForm] = Form.useForm<{ amount: number }>();
  const [actionState, setActionState] = useState<TitleActionState | null>(null);
  const [bidAuction, setBidAuction] = useState<TitleAuction | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const myTitles = useMemo(() => getPlayerTitles(game, currentPlayer.id), [currentPlayer.id, game]);
  const offersToMe = useMemo(
    () =>
      Object.values(game.titleSaleOffers ?? {}).filter(
        (offer) => offer.buyerId === currentPlayer.id && offer.status === 'pending',
      ),
    [currentPlayer.id, game.titleSaleOffers],
  );
  const openAuctions = useMemo(
    () => Object.values(game.titleAuctions ?? {}).filter((auction) => auction.status === 'open'),
    [game.titleAuctions],
  );
  const activePlayers = players.filter(
    (player) => player.status !== 'eliminated' && player.id !== currentPlayer.id,
  );

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setLoadingAction(true);

    try {
      await action();
      message.success(successMessage);
      saleForm.resetFields();
      auctionForm.resetFields();
      bidForm.resetFields();
      setActionState(null);
      setBidAuction(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Nao foi possivel concluir a acao.');
    } finally {
      setLoadingAction(false);
    }
  }

  const titleColumns: ColumnsType<TitleOwnership> = [
    {
      title: 'Titulo',
      key: 'title',
      render: (_, title) => {
        const boardSpace = BOARD_SPACES_BY_INDEX[title.boardIndex];

        return (
          <Space orientation="vertical" size={3}>
            <Flex align="center" gap={8}>
              <span className="board-space-color" style={{ backgroundColor: boardSpace?.color }} />
              <Typography.Text strong>{boardSpace?.streetName ?? boardSpace?.name}</Typography.Text>
            </Flex>
            <Typography.Text type="secondary">{boardSpace?.name}</Typography.Text>
          </Space>
        );
      },
    },
    {
      title: 'Valores',
      key: 'values',
      render: (_, title) => (
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="Terreno">
            {formatMoney(getTitleLandValue(title))}
          </Descriptions.Item>
          <Descriptions.Item label="Construido">
            {formatMoney(calculateTitleBuiltValue(title))}
          </Descriptions.Item>
          <Descriptions.Item label="Banco">
            {formatMoney(calculateTitleBankSaleValue(game, title))}
          </Descriptions.Item>
          <Descriptions.Item label="Impostos">
            {formatMoney(Math.round(calculateTitleTax(game, title)))}
          </Descriptions.Item>
        </Descriptions>
      ),
    },
    {
      title: 'Propriedades',
      key: 'properties',
      render: (_, title) => (
        <Flex gap={8} wrap>
          {(title.properties ?? []).length === 0 ? (
            <Tag icon={<BankOutlined />}>Terreno</Tag>
          ) : (
            title.properties?.map((property) => (
              <Tooltip
                key={property.id}
                title={property.optionName ?? getBlueprintName(property.blueprintKey)}
              >
                <Tag icon={property.category === 'business' ? <ShopOutlined /> : <HomeOutlined />}>
                  {property.optionName ?? getBlueprintName(property.blueprintKey)}
                </Tag>
              </Tooltip>
            ))
          )}
        </Flex>
      ),
    },
    {
      title: 'Acoes',
      key: 'actions',
      align: 'right',
      render: (_, title) => (
        <Space direction="vertical" size={6}>
          <Button
            size="small"
            icon={<BankOutlined />}
            onClick={() =>
              runAction(
                () => sellTitleToBank(room.id, currentPlayer.id, title.boardIndex),
                'Titulo vendido ao banco.',
              )
            }
          >
            Banco
          </Button>
          <Button
            size="small"
            icon={<SwapOutlined />}
            onClick={() => setActionState({ type: 'direct-sale', title })}
          >
            Vender
          </Button>
          <Button
            size="small"
            icon={<RiseOutlined />}
            onClick={() => setActionState({ type: 'auction', title })}
          >
            Leilao
          </Button>
        </Space>
      ),
    },
  ];
  const offerColumns: ColumnsType<TitleSaleOffer> = [
    {
      title: 'Titulo',
      key: 'title',
      render: (_, offer) => BOARD_SPACES_BY_INDEX[offer.boardIndex]?.name ?? offer.boardIndex,
    },
    {
      title: 'Vendedor',
      dataIndex: 'sellerId',
      key: 'sellerId',
      render: (sellerId) => getPlayerName(players, sellerId),
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
      render: (_, offer) => (
        <Button
          size="small"
          icon={<ShoppingCartOutlined />}
          onClick={() =>
            runAction(
              () => acceptTitleSaleOffer(room.id, currentPlayer.id, offer.id),
              'Proposta aceita.',
            )
          }
        >
          Aceitar
        </Button>
      ),
    },
  ];
  const auctionColumns: ColumnsType<TitleAuction> = [
    {
      title: 'Titulo',
      key: 'title',
      render: (_, auction) => BOARD_SPACES_BY_INDEX[auction.boardIndex]?.name ?? auction.boardIndex,
    },
    {
      title: 'Vendedor',
      dataIndex: 'sellerId',
      key: 'sellerId',
      render: (sellerId) => getPlayerName(players, sellerId),
    },
    {
      title: 'Maior oferta',
      key: 'highest',
      align: 'right',
      render: (_, auction) => {
        const bid = auction.highestBidId ? auction.bids[auction.highestBidId] : undefined;

        return bid ? formatMoney(bid.amount) : formatMoney(auction.initialBid);
      },
    },
    {
      title: 'Acoes',
      key: 'actions',
      align: 'right',
      render: (_, auction) =>
        auction.sellerId === currentPlayer.id ? (
          <Button
            size="small"
            disabled={!auction.highestBidId}
            onClick={() =>
              runAction(
                () => closeTitleAuction(room.id, currentPlayer.id, auction.id),
                'Leilao fechado.',
              )
            }
          >
            Fechar
          </Button>
        ) : (
          <Button size="small" onClick={() => setBidAuction(auction)}>
            Ofertar
          </Button>
        ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Flex align="center" justify="space-between" gap={12} wrap>
          <Space orientation="vertical" size={2}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Titulos
            </Typography.Title>
            <Typography.Text type="secondary">{myTitles.length} titulos adquiridos</Typography.Text>
          </Space>
          <Tag color="green">Rodada {game.round}</Tag>
        </Flex>
      </Card>

      <Card title="Meus titulos">
        <Table
          rowKey="boardIndex"
          size="small"
          tableLayout="fixed"
          pagination={false}
          columns={titleColumns}
          dataSource={myTitles}
          locale={{ emptyText: <Empty description="Nenhum titulo adquirido" /> }}
        />
      </Card>

      <Card title="Propostas recebidas">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          columns={offerColumns}
          dataSource={offersToMe}
        />
      </Card>

      <Card title="Leiloes abertos">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          columns={auctionColumns}
          dataSource={openAuctions}
        />
      </Card>

      <Modal
        title="Venda direta"
        open={actionState?.type === 'direct-sale'}
        okText="Criar proposta"
        cancelText="Cancelar"
        confirmLoading={loadingAction}
        onCancel={() => setActionState(null)}
        onOk={() => saleForm.submit()}
      >
        <Form
          form={saleForm}
          layout="vertical"
          onFinish={(values) => {
            if (!actionState || actionState.type !== 'direct-sale') return;
            void runAction(
              () =>
                createTitleSaleOffer(
                  room.id,
                  currentPlayer.id,
                  values.buyerId,
                  actionState.title.boardIndex,
                  values.amount,
                ),
              'Proposta criada.',
            );
          }}
        >
          <Form.Item
            name="buyerId"
            label="Comprador"
            rules={[{ required: true, message: 'Selecione o comprador.' }]}
          >
            <Select
              placeholder="Selecione"
              options={activePlayers.map((player) => ({ value: player.id, label: player.name }))}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Valor solicitado"
            rules={[{ required: true, message: 'Informe o valor.' }]}
          >
            <InputNumber min={1} precision={0} addonBefore="R$" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Abrir leilao"
        open={actionState?.type === 'auction'}
        okText="Abrir leilao"
        cancelText="Cancelar"
        confirmLoading={loadingAction}
        onCancel={() => setActionState(null)}
        onOk={() => auctionForm.submit()}
      >
        <Form
          form={auctionForm}
          layout="vertical"
          onFinish={(values) => {
            if (!actionState || actionState.type !== 'auction') return;
            void runAction(
              () =>
                createTitleAuction(
                  room.id,
                  currentPlayer.id,
                  actionState.title.boardIndex,
                  values.initialBid,
                ),
              'Leilao aberto.',
            );
          }}
        >
          <Form.Item
            name="initialBid"
            label="Lance inicial"
            rules={[{ required: true, message: 'Informe o lance inicial.' }]}
          >
            <InputNumber min={1} precision={0} addonBefore="R$" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Fazer oferta"
        open={Boolean(bidAuction)}
        okText="Ofertar"
        cancelText="Cancelar"
        confirmLoading={loadingAction}
        onCancel={() => setBidAuction(null)}
        onOk={() => bidForm.submit()}
      >
        <Form
          form={bidForm}
          layout="vertical"
          onFinish={(values) => {
            if (!bidAuction) return;
            void runAction(
              () => placeTitleAuctionBid(room.id, currentPlayer.id, bidAuction.id, values.amount),
              'Oferta registrada.',
            );
          }}
        >
          <Form.Item
            name="amount"
            label="Valor da oferta"
            rules={[{ required: true, message: 'Informe a oferta.' }]}
          >
            <InputNumber min={1} precision={0} addonBefore="R$" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
