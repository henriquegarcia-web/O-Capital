import { Avatar, Flex, Space, Tag, Tooltip, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';

import { BOARD_SPACES, PROFILE_COLORS, PROFILE_PHOTOS } from '@/constants';
import type { BoardSpace, GameState, Player, Room } from '@/types';
import { formatDiceRoll, hydrateGameState } from '@/utils';

type GameBoardProps = {
  room: Room;
  players: Player[];
};

type BoardPlacement = {
  row: number;
  column: number;
};

const BOARD_COLUMNS = 14;
const BOARD_ROWS = 8;
const STEP_DURATION_MS = 320;

function getBoardPlacement(index: number): BoardPlacement {
  if (index === 1) {
    return { row: 8, column: 1 };
  }

  if (index <= 7) {
    return { row: 9 - index, column: 1 };
  }

  if (index <= 21) {
    return { row: 1, column: index - 7 };
  }

  if (index <= 27) {
    return { row: index - 20, column: 14 };
  }

  return { row: 8, column: 42 - index };
}

function getBoardPath(from: number, to: number) {
  const path: number[] = [];
  let current = from;

  while (current !== to) {
    current = current === BOARD_SPACES.length ? 1 : current + 1;
    path.push(current);
  }

  return path;
}

function getPlayerPhoto(player: Player) {
  return PROFILE_PHOTOS.find((photo) => photo.key === player.photoKey);
}

function getPlayerColor(player: Player) {
  return PROFILE_COLORS.find((color) => color.key === player.colorKey)?.value ?? '#1f2933';
}

function getBoardSpaceClassName(space: BoardSpace, game: GameState) {
  const isCurrentTurnSpace = game.turnPlayerId
    ? game.positions[game.turnPlayerId] === space.index
    : false;

  return isCurrentTurnSpace ? 'game-board__space game-board__space--current' : 'game-board__space';
}

export function GameBoard({ players, room }: GameBoardProps) {
  const game = useMemo(() => hydrateGameState(room.game, players), [players, room.game]);
  const activePlayers = useMemo(
    () => players.filter((player) => player.status !== 'eliminated'),
    [players],
  );
  const positionsSignature = useMemo(
    () => activePlayers.map((player) => `${player.id}:${game.positions[player.id] ?? 1}`).join('|'),
    [activePlayers, game.positions],
  );
  const movementTargets = useMemo(
    () =>
      positionsSignature
        .split('|')
        .filter(Boolean)
        .map((item) => {
          const [playerId, position] = item.split(':');

          return {
            playerId,
            targetPosition: Number(position),
          };
        }),
    [positionsSignature],
  );
  const [animatedPositions, setAnimatedPositions] = useState<Record<string, number>>(() =>
    Object.fromEntries(activePlayers.map((player) => [player.id, game.positions[player.id] ?? 1])),
  );
  const [walkingPlayerIds, setWalkingPlayerIds] = useState<string[]>([]);
  const animatedPositionsRef = useRef<Record<string, number>>(animatedPositions);
  const previousPositionsRef = useRef<Record<string, number>>({});
  const timersRef = useRef<number[]>([]);
  const turnPlayer = players.find((player) => player.id === game.turnPlayerId);
  const lastRollPlayer = players.find((player) => player.id === game.lastRoll?.playerId);

  useEffect(() => {
    animatedPositionsRef.current = animatedPositions;
  }, [animatedPositions]);

  useEffect(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];

    movementTargets.forEach(({ playerId, targetPosition }) => {
      const previousPosition =
        animatedPositionsRef.current[playerId] ??
        previousPositionsRef.current[playerId] ??
        targetPosition;

      if (previousPosition === targetPosition) {
        setAnimatedPositions((current) => ({ ...current, [playerId]: targetPosition }));
        previousPositionsRef.current[playerId] = targetPosition;
        return;
      }

      const path = getBoardPath(previousPosition, targetPosition);
      setWalkingPlayerIds((current) => Array.from(new Set([...current, playerId])));

      path.forEach((position, stepIndex) => {
        const timer = window.setTimeout(() => {
          setAnimatedPositions((current) => ({ ...current, [playerId]: position }));

          if (stepIndex === path.length - 1) {
            previousPositionsRef.current[playerId] = targetPosition;
            setWalkingPlayerIds((current) => current.filter((currentPlayerId) => currentPlayerId !== playerId));
          }
        }, STEP_DURATION_MS * (stepIndex + 1));

        timersRef.current.push(timer);
      });
    });

    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };
  }, [movementTargets]);

  const positionCounts: Record<string, number> = {};
  const playerOffsetsByPosition = activePlayers.reduce<Record<string, number>>(
    (accumulator, player) => {
      const position = animatedPositions[player.id] ?? game.positions[player.id] ?? 1;
      const key = String(position);
      const offset = positionCounts[key] ?? 0;

      accumulator[player.id] = offset;
      positionCounts[key] = offset + 1;

      return accumulator;
    },
    {},
  );

  return (
    <section className="game-board-shell" aria-label="Tabuleiro da partida">
      <div className="game-board">
        {BOARD_SPACES.map((space) => {
          const placement = getBoardPlacement(space.index);

          return (
            <Tooltip key={space.index} title={space.name}>
              <div
                className={getBoardSpaceClassName(space, game)}
                style={{
                  gridColumn: placement.column,
                  gridRow: placement.row,
                }}
              >
                <span
                  className="game-board__space-strip"
                  style={{ backgroundColor: space.color }}
                />
                <span className="game-board__space-index">{space.index}</span>
                <Typography.Text strong className="game-board__space-name">
                  {space.name}
                </Typography.Text>
              </div>
            </Tooltip>
          );
        })}

        <div className="game-board__center">
          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            <Flex justify="space-between" align="center" gap={12} wrap>
              <Space orientation="vertical" size={0}>
                <Typography.Text type="secondary">Sala</Typography.Text>
                <Typography.Title level={3} style={{ margin: 0 }}>
                  {room.name}
                </Typography.Title>
              </Space>
              <Tag color={game.status === 'playing' ? 'green' : 'default'}>{game.status}</Tag>
            </Flex>

            <Flex gap={8} wrap>
              <Tag color="orange">Rodada {game.round}</Tag>
              <Tag color="blue">Vez: {turnPlayer?.name ?? 'Aguardando'}</Tag>
            </Flex>

            <Typography.Text type="secondary">
              {game.lastRoll && lastRollPlayer ? (
                `Ultimo: ${lastRollPlayer.name} (${formatDiceRoll(game.lastRoll)})`
              ) : (
                <Tag color="default">Não iniciado</Tag>
              )}
            </Typography.Text>
          </Space>
        </div>

        {activePlayers.map((player) => {
          const position = animatedPositions[player.id] ?? game.positions[player.id] ?? 1;
          const placement = getBoardPlacement(position);
          const color = getPlayerColor(player);
          const photo = getPlayerPhoto(player);
          const offset = playerOffsetsByPosition[player.id] ?? 0;
          const isWalking = walkingPlayerIds.includes(player.id);
          const isIdleBouncing = game.status === 'playing' && !isWalking;

          return (
            <Tooltip key={player.id} title={`${player.name} - casa ${position}`}>
              <div
                className={
                  isWalking
                    ? 'game-board__pawn game-board__pawn--walking'
                    : isIdleBouncing
                      ? 'game-board__pawn game-board__pawn--idle'
                      : 'game-board__pawn'
                }
                style={{
                  left: `${((placement.column - 0.5) / BOARD_COLUMNS) * 100}%`,
                  top: `${((placement.row - 0.5) / BOARD_ROWS) * 100}%`,
                  marginLeft: `${(offset % 3) * 13 - 13}px`,
                  marginTop: `${Math.floor(offset / 3) * 13 - 13}px`,
                  borderColor: color,
                }}
              >
                <Avatar src={photo?.path} size={30} style={{ backgroundColor: color }}>
                  {player.name.charAt(0)}
                </Avatar>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
}
