import { useEffect, useMemo, useRef } from 'react';
import { App, Typography } from 'antd';

import type { GameState, Player, PlayerTransaction } from '@/types';
import { formatMoney, playAppAudio } from '@/utils';

type UsePositiveCashNotificationsParams = {
  game?: GameState;
  currentPlayer?: Player | null;
  players: Player[];
};

function getPlayerName(players: Player[], playerId?: string) {
  if (!playerId) return null;

  return players.find((player) => player.id === playerId)?.name ?? 'Jogador';
}

function getTransactionSourceLabel(transaction: PlayerTransaction, players: Player[]) {
  const relatedPlayerName = getPlayerName(players, transaction.relatedPlayerId);

  if (relatedPlayerName) return relatedPlayerName;

  if (transaction.kind === 'stock-sell') return 'Mercado de Acoes';
  if (transaction.kind === 'mission-reward') return 'Missoes';
  if (transaction.kind === 'tax-refund') return 'Receita Federal';
  if (transaction.kind === 'round-statement' || transaction.kind === 'round-income') {
    return 'Rodada';
  }
  if (transaction.kind === 'event') return 'Evento';

  return 'Banco';
}

function getPixDescription(transaction: PlayerTransaction, players: Player[]) {
  const origin = getTransactionSourceLabel(transaction, players);

  return (
    <>
      <Typography.Text>{transaction.description}</Typography.Text>
      <br />
      <Typography.Text type="secondary">Origem: {origin}</Typography.Text>
      <br />
      <Typography.Text strong className="bank-money--success">
        {formatMoney(transaction.amount)}
      </Typography.Text>
    </>
  );
}

export function usePositiveCashNotifications({
  currentPlayer,
  game,
  players,
}: UsePositiveCashNotificationsParams) {
  const { notification } = App.useApp();
  const currentPlayerId = currentPlayer?.id;
  const transactions = useMemo(
    () =>
      Object.values(
        currentPlayerId ? (game?.playerFinances[currentPlayerId]?.transactions ?? {}) : {},
      ).sort((current, next) => current.createdAt - next.createdAt),
    [currentPlayerId, game],
  );
  const seenTransactionIdsRef = useRef<Set<string>>(new Set());
  const trackedPlayerIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentPlayerId) {
      seenTransactionIdsRef.current = new Set();
      trackedPlayerIdRef.current = null;
      return;
    }

    if (trackedPlayerIdRef.current !== currentPlayerId) {
      seenTransactionIdsRef.current = new Set(transactions.map((transaction) => transaction.id));
      trackedPlayerIdRef.current = currentPlayerId;
      return;
    }

    const nextPositiveTransactions = transactions.filter(
      (transaction) => transaction.amount > 0 && !seenTransactionIdsRef.current.has(transaction.id),
    );

    transactions.forEach((transaction) => {
      seenTransactionIdsRef.current.add(transaction.id);
    });

    nextPositiveTransactions.forEach((transaction) => {
      notification.success({
        message: 'Pix recebido',
        description: getPixDescription(transaction, players),
        placement: 'topRight',
        duration: 4,
      });
      playAppAudio('pix');
    });
  }, [currentPlayerId, notification, players, transactions]);
}
