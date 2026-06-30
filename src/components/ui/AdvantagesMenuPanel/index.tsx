import { useMemo, useState } from 'react';
import { App, Button, Card, Empty, Flex, Form, Modal, Select, Space, Tag, Typography } from 'antd';

import { activateTaxReduction, useForceAuction as forceAuctionAdvantage } from '@/api';
import { APP_ICONS, BOARD_SPACES_BY_INDEX, GAME_BALANCE } from '@/constants';
import type { GameState, Player, Room } from '@/types';
import {
  calculateTitleBankSaleValue,
  formatMoney,
  getAdvantageQuantity,
  getPlayerAdvantageState,
  hasUsedAdvantageThisTurn,
  isPlayerActionBlocked,
} from '@/utils';

type AdvantagesMenuPanelProps = {
  room: Room;
  game: GameState;
  currentPlayer: Player;
  players: Player[];
};

type ForceAuctionForm = {
  playerId: string;
  boardIndex: number;
};

export function AdvantagesMenuPanel({
  currentPlayer,
  game,
  players,
  room,
}: AdvantagesMenuPanelProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ForceAuctionForm>();
  const [forceAuctionOpen, setForceAuctionOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const advantageState = getPlayerAdvantageState(game, currentPlayer.id);
  const isCurrentTurn = game.status === 'playing' && game.turnPlayerId === currentPlayer.id;
  const actionBlocked = isPlayerActionBlocked(game, currentPlayer.id);
  const targetPlayerId = Form.useWatch('playerId', form);
  const targetPlayers = players.filter(
    (player) => player.id !== currentPlayer.id && player.status !== 'eliminated',
  );
  const targetTitles = useMemo(
    () =>
      Object.values(game.titles ?? {}).filter(
        (title) => title.ownerId === targetPlayerId && title.properties !== undefined,
      ),
    [game.titles, targetPlayerId],
  );
  const selectedBoardIndex = Form.useWatch('boardIndex', form);
  const selectedTitle = selectedBoardIndex ? game.titles[String(selectedBoardIndex)] : undefined;
  const selectedInitialBid = selectedTitle ? calculateTitleBankSaleValue(game, selectedTitle) : 0;

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setLoading(true);

    try {
      await action();
      message.success(successMessage);
      setForceAuctionOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Nao foi possivel usar a vantagem.');
    } finally {
      setLoading(false);
    }
  }

  function getUseBlockReason(quantity: number, alreadyUsedThisTurn: boolean) {
    if (quantity <= 0) return 'Sem unidades no inventario.';
    if (!isCurrentTurn) return 'Disponivel apenas na sua vez.';
    if (actionBlocked) return 'Jogador travado nao pode usar esta vantagem agora.';
    if (alreadyUsedThisTurn) return 'Vantagem ja ativada nesta vez de jogar.';

    return null;
  }

  const forceAuctionQuantity = getAdvantageQuantity(game, currentPlayer.id, 'force-auction');
  const taxReductionQuantity = getAdvantageQuantity(game, currentPlayer.id, 'tax-reduction');
  const forceAuctionUsedThisTurn = hasUsedAdvantageThisTurn(
    game,
    currentPlayer.id,
    'force-auction',
  );
  const taxReductionUsedThisTurn = hasUsedAdvantageThisTurn(
    game,
    currentPlayer.id,
    'tax-reduction',
  );
  const forceAuctionBlockReason = getUseBlockReason(forceAuctionQuantity, forceAuctionUsedThisTurn);
  const taxReductionBlockReason = advantageState.taxReduction?.remainingPasses
    ? 'Reducao de Impostos ja esta ativa.'
    : getUseBlockReason(taxReductionQuantity, taxReductionUsedThisTurn);

  function getAdvantageIcon(advantageKey: (typeof GAME_BALANCE.advantages.items)[number]['key']) {
    if (advantageKey === 'force-auction') return <APP_ICONS.crown />;
    if (advantageKey === 'rent-insurance') return <APP_ICONS.wallet />;
    if (advantageKey === 'tax-reduction') return <APP_ICONS.shop />;

    return <APP_ICONS.safetyCertificate />;
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card className="bank-app-card bank-app-card--dark bank-menu-summary">
        <Space orientation="vertical" size={2} className="bank-app-card-header">
          <Typography.Title level={4} style={{ margin: 0 }}>
            Vantagens
          </Typography.Title>
          <Typography.Text type="secondary">
            Inventario estrategico do jogador
            {advantageState.taxReduction?.remainingPasses
              ? ` - Reducao ativa por ${advantageState.taxReduction.remainingPasses} passagens`
              : ''}
          </Typography.Text>
        </Space>
      </Card>

      <Space orientation="vertical" size={10} className="advantages-list">
        {GAME_BALANCE.advantages.items.map((advantage) => {
          const quantity = getAdvantageQuantity(game, currentPlayer.id, advantage.key);
          const isForceAuction = advantage.key === 'force-auction';
          const isTaxReduction = advantage.key === 'tax-reduction';
          const blockReason = isForceAuction
            ? forceAuctionBlockReason
            : isTaxReduction
              ? taxReductionBlockReason
              : null;

          return (
            <Card key={advantage.key} className="bank-app-card advantage-card" size="small">
              <Space orientation="vertical" size={12} className="advantage-card__content">
                <Flex align="flex-start" gap={10} className="advantage-card__identity">
                  <span
                    className={
                      quantity > 0
                        ? 'board-space-property-icon board-space-property-icon--active'
                        : 'board-space-property-icon'
                    }
                  >
                    {getAdvantageIcon(advantage.key)}
                  </span>
                  <Space
                    orientation="vertical"
                    size={3}
                    className={
                      quantity > 0
                        ? 'advantage-card__copy'
                        : 'advantage-card__copy advantage-card__copy--desactive'
                    }
                  >
                    <Typography.Title level={5} className="advantage-card__title">
                      {advantage.name}
                    </Typography.Title>
                    <Typography.Text type="secondary" className="advantage-card__description">
                      {advantage.shortDescription}
                    </Typography.Text>
                  </Space>
                  <Tag color="default">{quantity}</Tag>
                </Flex>

                {(isForceAuction || isTaxReduction) && (
                  <Space orientation="vertical" size={8} className="advantage-card__meta">
                    {isForceAuction && (
                      <Button
                        size="small"
                        type="primary"
                        block
                        icon={actionBlocked ? <APP_ICONS.lock /> : undefined}
                        disabled={Boolean(blockReason)}
                        onClick={() => setForceAuctionOpen(true)}
                      >
                        Ativar
                      </Button>
                    )}
                    {isTaxReduction && (
                      <Button
                        size="small"
                        type="primary"
                        block
                        icon={actionBlocked ? <APP_ICONS.lock /> : undefined}
                        disabled={Boolean(blockReason)}
                        loading={loading}
                        onClick={() =>
                          void runAction(
                            () => activateTaxReduction(room.id, currentPlayer.id),
                            'Reducao de Impostos ativada.',
                          )
                        }
                      >
                        Ativar
                      </Button>
                    )}
                  </Space>
                )}
              </Space>
            </Card>
          );
        })}
      </Space>

      <Modal
        title="Forcar leilao"
        open={forceAuctionOpen}
        okText="Ativar"
        cancelText="Cancelar"
        confirmLoading={loading}
        onCancel={() => setForceAuctionOpen(false)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            runAction(
              () =>
                forceAuctionAdvantage(
                  room.id,
                  currentPlayer.id,
                  values.playerId,
                  values.boardIndex,
                ),
              'Leilao forcado aberto.',
            )
          }
        >
          <Form.Item name="playerId" label="Jogador" rules={[{ required: true, message: '' }]}>
            <Select
              placeholder="Selecione"
              options={targetPlayers.map((player) => ({ value: player.id, label: player.name }))}
              onChange={() => form.setFieldValue('boardIndex', undefined)}
            />
          </Form.Item>
          <Form.Item name="boardIndex" label="Titulo" rules={[{ required: true, message: '' }]}>
            <Select
              placeholder="Selecione"
              options={targetTitles.map((title) => {
                const boardSpace = BOARD_SPACES_BY_INDEX[title.boardIndex];

                return {
                  value: title.boardIndex,
                  label: boardSpace?.streetName ?? boardSpace?.name ?? String(title.boardIndex),
                };
              })}
              notFoundContent={<Empty description="Jogador sem titulos" />}
            />
          </Form.Item>
          {selectedInitialBid > 0 ? (
            <div className="bank-statement-total">
              <Typography.Text type="secondary">Lance inicial automatico</Typography.Text>
              <Typography.Text strong>{formatMoney(selectedInitialBid)}</Typography.Text>
            </div>
          ) : null}
        </Form>
      </Modal>
    </Space>
  );
}
