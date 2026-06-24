import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { App, Card, Flex, Modal, Result, Skeleton, Space, Typography } from 'antd';

import { confirmRoundPending } from '@/api';
import { APP_HISTORY_MENU, APP_MENU_ITEMS, APP_RANKING_MENU, type AppMenuKey } from '@/constants';
import {
  AppBottomNavigation,
  BankMenuPanel,
  BankerMatchControlCard,
  CurrentBoardSpaceCard,
  HistoryMenuPanel,
  MatchControlCard,
  PlayerFinanceCard,
  RankingMenuPanel,
  TitlesMenuPanel,
} from '@/components/ui';
import { useCurrentRoomPlayer, useRoom } from '@/hooks';
import { formatMoney, hydrateGameState } from '@/utils';

function isValidMenuKey(menuKey: string | undefined): menuKey is AppMenuKey {
  if (!menuKey) {
    return false;
  }

  return (
    APP_MENU_ITEMS.some((item) => item.key === menuKey) ||
    APP_HISTORY_MENU.key === menuKey ||
    APP_RANKING_MENU.key === menuKey
  );
}

function AppMenuPlaceholder({ title }: { title: string }) {
  return (
    <Card>
      <Space orientation="vertical" size={8}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        <Typography.Text type="secondary">
          Estrutura preparada para as proximas regras desta area.
        </Typography.Text>
      </Space>
    </Card>
  );
}

export function GamePlayersPage() {
  const { message } = App.useApp();
  const { menuKey, roomId } = useParams();
  const { players, room, loading } = useRoom(roomId);
  const currentPlayer = useCurrentRoomPlayer(roomId, players);
  const [confirmingStatement, setConfirmingStatement] = useState(false);

  if (!roomId) {
    return <Result status="404" title="Sala nao encontrada." />;
  }

  if (!isValidMenuKey(menuKey)) {
    return <Navigate to={`/rooms/${roomId}/app/partida`} replace />;
  }

  if (loading) {
    return <Skeleton active />;
  }

  if (!currentPlayer) {
    return <Result status="403" title="Entre como um jogador para acessar o aplicativo." />;
  }

  if (!room) {
    return <Result status="404" title="Sala nao encontrada." />;
  }

  if (currentPlayer.status === 'eliminated') {
    return <Result status="403" title="Este jogador foi eliminado da partida." />;
  }

  if (menuKey === 'banqueiro' && currentPlayer.role !== 'banqueiro') {
    return <Result status="403" title="Apenas o banqueiro pode acessar este menu." />;
  }

  const activeRoom = room;
  const activePlayer = currentPlayer;
  const hydratedGame = hydrateGameState(activeRoom.game, players);
  const pendingToConfirm = Object.values(hydratedGame.roundPendings ?? {}).find(
    (pending) =>
      pending.playerId === activePlayer.id &&
      pending.status === 'pending' &&
      ['statement', 'rent', 'event', 'global-event'].includes(pending.kind),
  );
  const rentPending = pendingToConfirm?.kind === 'rent' ? pendingToConfirm : undefined;
  const eventPending =
    pendingToConfirm?.kind === 'event' || pendingToConfirm?.kind === 'global-event'
      ? pendingToConfirm
      : undefined;
  const statementBreakdown =
    pendingToConfirm?.kind === 'statement' && pendingToConfirm.breakdown
      ? pendingToConfirm.breakdown
      : {
          receivables: 0,
          maintenance: 0,
          taxes: 0,
          netAmount: 0,
        };

  async function handleConfirmPending() {
    if (!pendingToConfirm) return;

    setConfirmingStatement(true);

    try {
      await confirmRoundPending(activeRoom.id, activePlayer.id, pendingToConfirm.id);
      message.success(
        pendingToConfirm.kind === 'statement'
          ? 'Prestacao de contas confirmada.'
          : pendingToConfirm.kind === 'rent'
            ? 'Aluguel pago.'
            : 'Evento confirmado.',
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Nao foi possivel confirmar.');
    } finally {
      setConfirmingStatement(false);
    }
  }

  const pageContent =
    menuKey === 'partida' ? (
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <PlayerFinanceCard game={hydratedGame} currentPlayer={activePlayer} />
        <MatchControlCard room={activeRoom} players={players} currentPlayer={activePlayer} />
        <CurrentBoardSpaceCard
          roomId={roomId}
          game={hydratedGame}
          players={players}
          currentPlayer={activePlayer}
        />
      </Space>
    ) : menuKey === 'banqueiro' ? (
      <BankerMatchControlCard room={activeRoom} players={players} />
    ) : menuKey === 'banco' ? (
      <BankMenuPanel
        room={activeRoom}
        game={hydratedGame}
        players={players}
        currentPlayer={activePlayer}
      />
    ) : menuKey === 'titulos' ? (
      <TitlesMenuPanel
        room={activeRoom}
        game={hydratedGame}
        players={players}
        currentPlayer={activePlayer}
      />
    ) : menuKey === 'ranking' ? (
      <RankingMenuPanel game={hydratedGame} players={players} currentPlayer={activePlayer} />
    ) : menuKey === 'historico' ? (
      <HistoryMenuPanel game={hydratedGame} players={players} currentPlayer={activePlayer} />
    ) : (
      <AppMenuPlaceholder
        title={APP_MENU_ITEMS.find((item) => item.key === menuKey)?.label ?? 'Aplicativo'}
      />
    );

  return (
    <>
      {pageContent}
      <AppBottomNavigation activeMenuKey={menuKey} playerRole={activePlayer.role} roomId={roomId} />

      <Modal
        title={
          pendingToConfirm?.kind === 'rent'
            ? 'Pagamento de aluguel'
            : eventPending
              ? eventPending.kind === 'global-event'
                ? 'Evento global'
                : 'Evento'
              : 'Prestacao de contas'
        }
        open={Boolean(pendingToConfirm)}
        okText="Confirmar"
        cancelButtonProps={{ style: { display: 'none' } }}
        closable={false}
        mask={{ closable: false }}
        confirmLoading={confirmingStatement}
        onOk={() => void handleConfirmPending()}
      >
        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
          {rentPending ? (
            <>
              <Typography.Text>
                Voce se hospedou na propriedade de{' '}
                <Typography.Text strong>
                  {players.find((player) => player.id === rentPending.relatedPlayerId)?.name ??
                    'outro jogador'}
                </Typography.Text>{' '}
                e devera pagar aluguel.
              </Typography.Text>
              <div className="bank-statement-total">
                <Typography.Text type="secondary">Valor do aluguel</Typography.Text>
                <Typography.Text strong className="bank-money--danger">
                  {formatMoney(rentPending.amount)}
                </Typography.Text>
              </div>
            </>
          ) : eventPending ? (
            <>
              <Typography.Text>{eventPending.message}</Typography.Text>
              <div className="bank-statement-total">
                <Typography.Title
                  level={4}
                  style={{ margin: 0 }}
                  className={
                    eventPending.eventTone === 'luck' ? 'bank-money--success' : 'bank-money--danger'
                  }
                >
                  {eventPending.eventTone === 'luck' ? '+ ' : '- '}
                  {formatMoney(eventPending.amount)}
                </Typography.Title>
              </div>
            </>
          ) : (
            <>
              <Flex justify="space-between" gap={12}>
                <Typography.Text type="secondary">Recebiveis</Typography.Text>
                <Typography.Text strong className="bank-money--success">
                  {formatMoney(statementBreakdown.receivables)}
                </Typography.Text>
              </Flex>
              <Flex justify="space-between" gap={12}>
                <Typography.Text type="secondary">Manutencao</Typography.Text>
                <Typography.Text strong className="bank-money--danger">
                  {formatMoney(statementBreakdown.maintenance)}
                </Typography.Text>
              </Flex>
              <Flex justify="space-between" gap={12}>
                <Typography.Text type="secondary">Impostos</Typography.Text>
                <Typography.Text strong className="bank-money--danger">
                  {formatMoney(statementBreakdown.taxes)}
                </Typography.Text>
              </Flex>
              <div className="bank-statement-total">
                <Typography.Text type="secondary">Valor final</Typography.Text>
                <Typography.Text
                  strong
                  className={
                    statementBreakdown.netAmount >= 0 ? 'bank-money--success' : 'bank-money--danger'
                  }
                >
                  {formatMoney(statementBreakdown.netAmount)}
                </Typography.Text>
              </div>
            </>
          )}
        </Space>
      </Modal>
    </>
  );
}
