import { PlayCircleOutlined } from '@ant-design/icons';
import { App, Button, Card, Descriptions, Flex, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';

import { rollPlayerDice } from '@/api';
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
  return Math.floor(Math.random() * 6) + 1;
}

const DICE_OVERLAY_CLOSE_DELAY_MS = 3800;

export function MatchControlCard({ currentPlayer, players, room }: MatchControlCardProps) {
  const { message } = App.useApp();
  const [rolling, setRolling] = useState(false);
  const [diceResult, setDiceResult] = useState<DiceResult | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const game = useMemo<GameState>(() => hydrateGameState(room.game, players), [players, room.game]);
  const isCurrentTurn = game.status === 'playing' && game.turnPlayerId === currentPlayer.id;

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
      <DiceRollOverlay open={rolling} result={diceResult} />
    </>
  );
}
