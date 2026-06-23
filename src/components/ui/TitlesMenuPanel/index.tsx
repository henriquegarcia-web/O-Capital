import { useMemo, useState } from 'react';
import {
  BankOutlined,
  RiseOutlined,
  ShoppingCartOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Grid,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
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
import { BOARD_SPACES_BY_INDEX, NEIGHBORHOODS, PROPERTY_BLUEPRINTS } from '@/constants';
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

function getNeighborhoodName(neighborhoodKey?: string) {
  return (
    NEIGHBORHOODS.find((neighborhood) => neighborhood.key === neighborhoodKey)?.name ??
    'Bairro'
  );
}

export function TitlesMenuPanel({ currentPlayer, game, players, room }: TitlesMenuPanelProps) {
  const { message, modal } = App.useApp();
  const screens = Grid.useBreakpoint();
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

  function renderTitleIdentity(title: TitleOwnership) {
    const boardSpace = BOARD_SPACES_BY_INDEX[title.boardIndex];
    const streetName = boardSpace?.streetName ?? boardSpace?.name;
    const neighborhoodName = getNeighborhoodName(boardSpace?.neighborhoodKey);

    return (
      <Flex align="center" gap={10} className="bank-title-identity">
        <span
          className="board-space-color bank-title-identity__color"
          style={{ backgroundColor: boardSpace?.color }}
        />
        <Space orientation="vertical" size={0} className="bank-title-identity__copy">
          <Typography.Text strong className="bank-title-identity__name">
            {streetName}
          </Typography.Text>
          <Typography.Text type="secondary" className="bank-title-identity__meta">
            Bairro {neighborhoodName}
          </Typography.Text>
        </Space>
      </Flex>
    );
  }

  function calculateTitleMaintenanceDue(title: TitleOwnership) {
    return (title.properties ?? []).reduce((total, property) => {
      const blueprint = PROPERTY_BLUEPRINTS.find((item) => item.key === property.blueprintKey);

      if (!blueprint || game.round <= property.acquiredAtRound) {
        return total;
      }

      const due =
        blueprint.maintenanceIntervalRounds > 0 &&
        (game.round - property.acquiredAtRound) % blueprint.maintenanceIntervalRounds === 0;

      return total + (due ? blueprint.maintenanceCost : 0);
    }, 0);
  }

  function renderTitleValues(title: TitleOwnership) {
    const values = [
      ['Terreno', formatMoney(getTitleLandValue(title))],
      ['Construido', formatMoney(calculateTitleBuiltValue(title))],
      ['Valor estimado', formatMoney(calculateTitleBankSaleValue(game, title))],
      ['Impostos', formatMoney(Math.round(calculateTitleTax(game, title)))],
      ['Manutencao', formatMoney(calculateTitleMaintenanceDue(title))],
    ];

    return (
      <div className="bank-title-values">
        {values.map(([label, value]) => (
          <Flex key={label} align="center" justify="space-between" gap={10}>
            <Typography.Text type="secondary">{label}</Typography.Text>
            <Typography.Text strong>{value}</Typography.Text>
          </Flex>
        ))}
      </div>
    );
  }

  function renderTitleProperties(title: TitleOwnership) {
    const properties = title.properties ?? [];
    const tax = Math.round(calculateTitleTax(game, title));
    const maintenance = calculateTitleMaintenanceDue(title);

    return (
      <Space orientation="vertical" size={6} className="bank-title-properties">
        <Typography.Text type="secondary">
          {properties.length > 0
            ? properties
                .map((property) => property.optionName ?? getBlueprintName(property.blueprintKey))
                .join(', ')
            : 'Sem propriedades'}
        </Typography.Text>
        <Flex justify="space-between" gap={10}>
          <Typography.Text type="secondary">Impostos</Typography.Text>
          <Typography.Text strong>{formatMoney(tax)}</Typography.Text>
        </Flex>
        <Flex justify="space-between" gap={10}>
          <Typography.Text type="secondary">Manutencao</Typography.Text>
          <Typography.Text strong>{formatMoney(maintenance)}</Typography.Text>
        </Flex>
      </Space>
    );
  }

  function renderTitleActions(title: TitleOwnership) {
    return (
      <Flex gap={8} wrap className="bank-title-actions">
        <Button
          size="small"
          icon={<BankOutlined />}
          onClick={() =>
            confirmAction(
              'Confirmar venda ao banco',
              'Vender este titulo ao banco? Esta acao nao podera ser desfeita.',
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
      </Flex>
    );
  }

  const renderMobileTitles = () => (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      {myTitles.length === 0 ? (
        <Empty description="Nenhum titulo adquirido" />
      ) : (
        myTitles.map((title) => (
          <div className="bank-title-card" key={title.boardIndex}>
            {renderTitleIdentity(title)}
            {renderTitleValues(title)}
            {renderTitleProperties(title)}
            {renderTitleActions(title)}
          </div>
        ))
      )}
    </Space>
  );

  const renderMobileOffers = () => (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      {offersToMe.length === 0 ? (
        <Empty description="Nenhuma proposta recebida" />
      ) : (
        offersToMe.map((offer) => (
          <div className="bank-list-card" key={offer.id}>
            <Space orientation="vertical" size={6} style={{ width: '100%' }}>
              <Typography.Text strong>
                {BOARD_SPACES_BY_INDEX[offer.boardIndex]?.name ?? offer.boardIndex}
              </Typography.Text>
              <Flex justify="space-between" gap={12}>
                <Typography.Text type="secondary">Vendedor</Typography.Text>
                <Typography.Text>{getPlayerName(players, offer.sellerId)}</Typography.Text>
              </Flex>
              <Flex justify="space-between" gap={12}>
                <Typography.Text type="secondary">Valor</Typography.Text>
                <Typography.Text strong>{formatMoney(offer.amount)}</Typography.Text>
              </Flex>
            </Space>
            <Button
              size="small"
              block
              icon={<ShoppingCartOutlined />}
              onClick={() =>
                confirmAction(
                  'Confirmar proposta',
                  `Aceitar a proposta de ${formatMoney(offer.amount)}?`,
                  () => acceptTitleSaleOffer(room.id, currentPlayer.id, offer.id),
                  'Proposta aceita.',
                )
              }
            >
              Aceitar
            </Button>
          </div>
        ))
      )}
    </Space>
  );

  const renderMobileAuctions = () => (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      {openAuctions.length === 0 ? (
        <Empty description="Nenhum leilao aberto" />
      ) : (
        openAuctions.map((auction) => {
          const bid = auction.highestBidId ? auction.bids[auction.highestBidId] : undefined;

          return (
            <div className="bank-list-card" key={auction.id}>
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                <Typography.Text strong>
                  {BOARD_SPACES_BY_INDEX[auction.boardIndex]?.name ?? auction.boardIndex}
                </Typography.Text>
                <Flex justify="space-between" gap={12}>
                  <Typography.Text type="secondary">Vendedor</Typography.Text>
                  <Typography.Text>{getPlayerName(players, auction.sellerId)}</Typography.Text>
                </Flex>
                <Flex justify="space-between" gap={12}>
                  <Typography.Text type="secondary">Maior oferta</Typography.Text>
                  <Typography.Text strong>
                    {bid ? formatMoney(bid.amount) : formatMoney(auction.initialBid)}
                  </Typography.Text>
                </Flex>
              </Space>
              {auction.sellerId === currentPlayer.id ? (
                <Button
                  size="small"
                  block
                  disabled={!auction.highestBidId}
                  onClick={() =>
                    confirmAction(
                      'Confirmar fechamento',
                      'Fechar este leilao e transferir o titulo para a maior oferta?',
                      () => closeTitleAuction(room.id, currentPlayer.id, auction.id),
                      'Leilao fechado.',
                    )
                  }
                >
                  Fechar
                </Button>
              ) : (
                <Button size="small" block onClick={() => setBidAuction(auction)}>
                  Ofertar
                </Button>
              )}
            </div>
          );
        })
      )}
    </Space>
  );

  const titleColumns: ColumnsType<TitleOwnership> = [
    {
      title: 'Titulo',
      key: 'title',
      width: 180,
      render: (_, title) => renderTitleIdentity(title),
    },
    {
      title: 'Valores',
      key: 'values',
      width: 190,
      render: (_, title) => renderTitleValues(title),
    },
    {
      title: 'Propriedades',
      key: 'properties',
      width: 180,
      render: (_, title) => renderTitleProperties(title),
    },
    {
      title: 'Acoes',
      key: 'actions',
      width: 190,
      align: 'right',
      render: (_, title) => renderTitleActions(title),
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
            confirmAction(
              'Confirmar proposta',
              `Aceitar a proposta de ${formatMoney(offer.amount)}?`,
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
              confirmAction(
                'Confirmar fechamento',
                'Fechar este leilao e transferir o titulo para a maior oferta?',
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
      <Card className="bank-app-card bank-app-card--dark">
        <Flex align="center" justify="space-between" gap={12} wrap>
          <Space orientation="vertical" size={2} className="bank-app-card-header">
            <Typography.Title level={4} style={{ margin: 0 }}>
              Titulos
            </Typography.Title>
            <Typography.Text type="secondary">{myTitles.length} titulos adquiridos</Typography.Text>
          </Space>
          <Tag color="green">Rodada {game.round}</Tag>
        </Flex>
      </Card>

      <Card title="Meus titulos" className="bank-app-card">
        {screens.md ? (
          <Table
            rowKey="boardIndex"
            size="small"
            pagination={false}
            columns={titleColumns}
            dataSource={myTitles}
            scroll={{ x: 740 }}
            locale={{ emptyText: <Empty description="Nenhum titulo adquirido" /> }}
          />
        ) : (
          renderMobileTitles()
        )}
      </Card>

      <Card title="Propostas recebidas" className="bank-app-card">
        {screens.md ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={offerColumns}
            dataSource={offersToMe}
            locale={{ emptyText: <Empty description="Nenhuma proposta recebida" /> }}
          />
        ) : (
          renderMobileOffers()
        )}
      </Card>

      <Card title="Leiloes abertos" className="bank-app-card">
        {screens.md ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={auctionColumns}
            dataSource={openAuctions}
            locale={{ emptyText: <Empty description="Nenhum leilao aberto" /> }}
          />
        ) : (
          renderMobileAuctions()
        )}
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
            confirmAction(
              'Confirmar proposta de venda',
              `Criar proposta de venda por ${formatMoney(values.amount)}?`,
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
            confirmAction(
              'Confirmar leilao',
              `Abrir leilao com lance inicial de ${formatMoney(values.initialBid)}?`,
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
            confirmAction(
              'Confirmar oferta',
              `Registrar oferta de ${formatMoney(values.amount)}?`,
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
