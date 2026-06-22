import { PlayCircleOutlined } from '@ant-design/icons';
import { App, Button, Card, Descriptions, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';

import { rollPlayerDice } from '@/api';
import type { GameState, Player, Room } from '@/types';
import { formatDiceRoll, hydrateGameState } from '@/utils';

import { DiceRollOverlay, type DiceRollOverlayPhase } from '../DiceRollOverlay';

type MatchControlCardProps = {
  room: Room;
  players: Player[];
  currentPlayer: Player;
};

type DiceResult = {
  diceOne: number;
  diceTwo: number;
};

const GAME_STATUS_LABELS: Record<GameState['status'], string> = {
  waiting: 'Não iniciado',
  playing: 'Em andamento',
  paused: 'Pausado',
  finished: 'Finalizado',
};

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

export function MatchControlCard({ currentPlayer, players, room }: MatchControlCardProps) {
  const { message } = App.useApp();
  const [rolling, setRolling] = useState(false);
  const [overlayPhase, setOverlayPhase] = useState<DiceRollOverlayPhase>('rolling');
  const [diceResult, setDiceResult] = useState<DiceResult | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const game = useMemo<GameState>(() => hydrateGameState(room.game, players), [players, room.game]);
  const turnPlayer = players.find((player) => player.id === game.turnPlayerId);
  const lastRollPlayer = players.find((player) => player.id === game.lastRoll?.playerId);
  const isCurrentTurn = game.status === 'playing' && game.turnPlayerId === currentPlayer.id;
  const currentPlayerLastRoll = game.playerLastRolls?.[currentPlayer.id];

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, []);

  function clearRollTimers() {
    timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    timeoutsRef.current = [];
  }

  function handleRollDice() {
    clearRollTimers();

    const nextDiceResult = {
      diceOne: rollDie(),
      diceTwo: rollDie(),
    };

    setDiceResult(nextDiceResult);
    setOverlayPhase('rolling');
    setRolling(true);

    timeoutsRef.current.push(
      window.setTimeout(() => {
        setOverlayPhase('result');
      }, 2000),
    );

    timeoutsRef.current.push(
      window.setTimeout(() => {
        setOverlayPhase('exiting');
      }, 4000),
    );

    timeoutsRef.current.push(
      window.setTimeout(async () => {
        try {
          await rollPlayerDice(room.id, currentPlayer.id, nextDiceResult);
          message.success('Jogada contabilizada.');
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : 'Nao foi possivel girar os dados.',
          );
        } finally {
          setRolling(false);
          setDiceResult(null);
          clearRollTimers();
        }
      }, 4400),
    );
  }

  return (
    <>
      <Card>
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Controle de Partida
          </Typography.Title>

          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Status">
              <Tag color={game.status === 'playing' ? 'green' : 'default'}>
                {GAME_STATUS_LABELS[game.status]}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Rodada">{game.round}</Descriptions.Item>
            <Descriptions.Item label="Vez atual">
              {turnPlayer?.name ?? 'Aguardando jogadores'}
            </Descriptions.Item>
            <Descriptions.Item label="Ultimo a jogar">
              {game.lastRoll && lastRollPlayer ? (
                `${lastRollPlayer.name} (${game.lastRoll.total})`
              ) : (
                <Tag color="default">Não iniciado</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Sua ultima jogada">
              {currentPlayerLastRoll ? (
                `(${formatDiceRoll(currentPlayerLastRoll)})`
              ) : (
                <Tag color="default">Não iniciado</Tag>
              )}
            </Descriptions.Item>
          </Descriptions>

          <Button
            type="primary"
            size="large"
            block
            icon={<PlayCircleOutlined />}
            disabled={!isCurrentTurn || rolling}
            loading={rolling}
            onClick={handleRollDice}
          >
            Girar dados
          </Button>
        </Space>
      </Card>
      <DiceRollOverlay open={rolling} phase={overlayPhase} result={diceResult} />
    </>
  );
}
