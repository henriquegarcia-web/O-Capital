import { APP_ICONS, BOARD_SPACES_BY_INDEX } from '@/constants';
import { Card, Empty, Flex, Space, Tabs, Typography } from 'antd';

import type { GameState, Player, PlayerTransaction } from '@/types';
import { formatMoney } from '@/utils';

type HistoryMenuPanelProps = {
  game: GameState;
  currentPlayer: Player;
  players: Player[];
};

type HistoryEntry = PlayerTransaction & {
  playerId: string;
  playerName: string;
  relatedPlayerName?: string;
};

function getPlayerName(players: Player[], playerId: string) {
  return players.find((player) => player.id === playerId)?.name ?? 'Jogador';
}

function getTransactionTone(amount: number) {
  if (amount > 0) return 'success';
  if (amount < 0) return 'danger';

  return 'neutral';
}

function getHistoryDirection(entry: HistoryEntry) {
  if (!entry.relatedPlayerId) {
    return entry.playerName;
  }

  const relatedPlayerName = entry.relatedPlayerName ?? 'Jogador';
  const sourceName = entry.amount < 0 ? entry.playerName : relatedPlayerName;
  const targetName = entry.amount < 0 ? relatedPlayerName : entry.playerName;

  return `${sourceName} -> ${targetName}`;
}

function sortByNewest(entries: HistoryEntry[]) {
  return [...entries].sort((current, next) => next.createdAt - current.createdAt);
}

function getHistoryDescription(entry: HistoryEntry) {
  if (entry.kind !== 'event') {
    return entry.description;
  }

  return BOARD_SPACES_BY_INDEX[entry.boardIndex ?? 0]?.kind === 'global-event'
    ? 'Evento global'
    : 'Evento';
}

function renderHistoryEntries(entries: HistoryEntry[], showPlayerName: boolean) {
  if (entries.length === 0) {
    return <Empty description="Nenhuma movimentacao registrada" />;
  }

  return (
    <Space orientation="vertical" size={0} className="history-list">
      {entries.map((entry) => {
        const tone = getTransactionTone(entry.amount);

        return (
          <Flex
            align="center"
            justify="space-between"
            gap={10}
            className="history-compact-row"
            key={`${entry.playerId}-${entry.id}`}
          >
            <span className={`history-amount-pill history-amount-pill--${tone}`}>
              {entry.amount > 0 ? '+ ' : entry.amount < 0 ? '- ' : ''}
              {formatMoney(Math.abs(entry.amount))}
            </span>
            <Space orientation="vertical" size={1} className="history-compact-row__content">
              <Typography.Text strong className="history-compact-row__title">
                {showPlayerName || entry.relatedPlayerId
                  ? getHistoryDirection(entry)
                  : entry.playerName}
              </Typography.Text>
              <Typography.Text className="history-compact-row__description">
                {getHistoryDescription(entry)}
              </Typography.Text>
            </Space>
          </Flex>
        );
      })}
    </Space>
  );
}

export function HistoryMenuPanel({ currentPlayer, game, players }: HistoryMenuPanelProps) {
  const personalEntries = sortByNewest(
    Object.values(game.playerFinances[currentPlayer.id]?.transactions ?? {}).map((transaction) => ({
      ...transaction,
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      relatedPlayerName: transaction.relatedPlayerId
        ? getPlayerName(players, transaction.relatedPlayerId)
        : undefined,
    })),
  );
  const globalEntries = sortByNewest(
    Object.values(game.playerFinances ?? {}).flatMap((finance) =>
      Object.values(finance.transactions ?? {}).map((transaction) => ({
        ...transaction,
        playerId: finance.playerId,
        playerName: getPlayerName(players, finance.playerId),
        relatedPlayerName: transaction.relatedPlayerId
          ? getPlayerName(players, transaction.relatedPlayerId)
          : undefined,
      })),
    ),
  );
  const isBanker = currentPlayer.role === 'banqueiro';

  return (
    <Card className="bank-app-card">
      <Space orientation="vertical" size={10} style={{ width: '100%' }}>
        {isBanker ? (
          <Tabs
            items={[
              {
                key: 'personal',
                label: (
                  <Space size={6}>
                    <APP_ICONS.user />
                    Pessoal
                  </Space>
                ),
                children: renderHistoryEntries(personalEntries, false),
              },
              {
                key: 'global',
                label: (
                  <Space size={6}>
                    <APP_ICONS.bank />
                    Geral
                  </Space>
                ),
                children: renderHistoryEntries(globalEntries, true),
              },
            ]}
          />
        ) : (
          renderHistoryEntries(personalEntries, false)
        )}
      </Space>
    </Card>
  );
}
