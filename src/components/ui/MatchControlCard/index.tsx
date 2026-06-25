import { CheckCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { App, Button, Card, Descriptions, Flex, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';

import { finishPlayerTurn, rollPlayerDice } from '@/api';
import { GAME_BALANCE } from '@/constants';
import type { GameState, Player, Room } from '@/types';
import { hydrateGameState } from '@/utils';

import { DiceRollOverlay } from '../DiceRollOverlay';

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
  waiting: 'Nao iniciado',
  playing: 'Em andamento',
  paused: 'Pausado',
  finished: 'Finalizado',
};

function rollDie() {
  return Math.floor(Math.random() * GAME_BALANCE.board.dice.sides) + GAME_BALANCE.board.dice.min;
}

const DICE_OVERLAY_CLOSE_DELAY_MS = 3800;

export function MatchControlCard({ currentPlayer, players, room }: MatchControlCardProps) {
  const { message } = App.useApp();
  const [rolling, setRolling] = useState(false);
  const [diceResult, setDiceResult] = useState<DiceResult | null>(null);
  const [finishingTurn, setFinishingTurn] = useState(false);
  const timeoutsRef = useRef<number[]>([]);
  const game = useMemo<GameState>(() => hydrateGameState(room.game, players), [players, room.game]);
  const isCurrentTurn = game.status === 'playing' && game.turnPlayerId === currentPlayer.id;
  const lastRoll = game.playerLastRolls[currentPlayer.id];
  const hasRolledThisTurn = Boolean(
    lastRoll && game.turnStartedAt && lastRoll.createdAt >= game.turnStartedAt,
  );

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, []);

  function clearRollTimers() {
    timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    timeoutsRef.current = [];
  }

  async function handleFinishTurn() {
    setFinishingTurn(true);

    try {
      await finishPlayerTurn(room.id, currentPlayer.id);
      message.success('Jogada concluida.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Nao foi possivel concluir a jogada.');
    } finally {
      setFinishingTurn(false);
    }
  }

  function handleRollDice() {
    clearRollTimers();

    const nextDiceResult = {
      diceOne: rollDie(),
      diceTwo: rollDie(),
    };

    setDiceResult(nextDiceResult);
    setRolling(true);

    timeoutsRef.current.push(
      window.setTimeout(() => {
        setRolling(false);
        setDiceResult(null);

        void rollPlayerDice(room.id, currentPlayer.id, nextDiceResult)
          .then(() => {
            message.success('Jogada contabilizada.');
          })
          .catch((error) => {
            message.error(
              error instanceof Error ? error.message : 'Nao foi possivel girar os dados.',
            );
          })
          .finally(() => {
            clearRollTimers();
          });
      }, DICE_OVERLAY_CLOSE_DELAY_MS),
    );
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
              Controle de Partida
            </Typography.Title>
          </Flex>

          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Status">
              <Tag color={game.status === 'playing' ? 'green' : 'default'}>
                {GAME_STATUS_LABELS[game.status]}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Rodada">{game.round}</Descriptions.Item>
            <Descriptions.Item label="Dia">{game.day}</Descriptions.Item>
          </Descriptions>

          <Flex gap={10} wrap>
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              disabled={!isCurrentTurn || rolling || hasRolledThisTurn || finishingTurn}
              loading={rolling}
              onClick={handleRollDice}
              style={{ flex: '1 1 160px' }}
            >
              Girar dados
            </Button>
            <Button
              size="large"
              icon={<CheckCircleOutlined />}
              disabled={!isCurrentTurn || rolling || !hasRolledThisTurn}
              loading={finishingTurn}
              onClick={() => void handleFinishTurn()}
              style={{ flex: '1 1 160px' }}
            >
              Concluir jogada
            </Button>
          </Flex>
        </Space>
      </Card>
      <DiceRollOverlay open={rolling} result={diceResult} />
    </>
  );
}
