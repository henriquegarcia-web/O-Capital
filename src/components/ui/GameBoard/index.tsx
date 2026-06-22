import { Avatar, Tooltip, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';

import { BOARD_SPACES, PROFILE_COLORS, PROFILE_PHOTOS } from '@/constants';
import type { Player, Room } from '@/types';
import { hydrateGameState } from '@/utils';

type GameBoardProps = {
  room: Room;
  players: Player[];
};

type BoardPlacement = {
  row: number;
  column: number;
};

const BOARD_COLUMNS = 11;
const BOARD_ROWS = 6;
const STEP_DURATION_MS = 320;

const BOARD_PLACEMENTS: Record<number, BoardPlacement> = {
  1: { row: 6, column: 1 },
  2: { row: 5, column: 1 },
  3: { row: 4, column: 1 },
  4: { row: 3, column: 1 },
  5: { row: 2, column: 1 },
  6: { row: 1, column: 1 },
  7: { row: 1, column: 2 },
  8: { row: 1, column: 3 },
  9: { row: 2, column: 3 },
  10: { row: 3, column: 3 },
  11: { row: 3, column: 4 },
  12: { row: 3, column: 5 },
  13: { row: 2, column: 5 },
  14: { row: 1, column: 5 },
  15: { row: 1, column: 6 },
  16: { row: 1, column: 7 },
  17: { row: 2, column: 7 },
  18: { row: 3, column: 7 },
  19: { row: 4, column: 7 },
  20: { row: 4, column: 8 },
  21: { row: 4, column: 9 },
  22: { row: 3, column: 9 },
  23: { row: 2, column: 9 },
  24: { row: 1, column: 9 },
  25: { row: 1, column: 10 },
  26: { row: 1, column: 11 },
  27: { row: 2, column: 11 },
  28: { row: 3, column: 11 },
  29: { row: 4, column: 11 },
  30: { row: 5, column: 11 },
  31: { row: 6, column: 11 },
  32: { row: 6, column: 10 },
  33: { row: 6, column: 9 },
  34: { row: 6, column: 8 },
  35: { row: 6, column: 7 },
  36: { row: 6, column: 6 },
  37: { row: 6, column: 5 },
  38: { row: 6, column: 4 },
  39: { row: 6, column: 3 },
  40: { row: 6, column: 2 },
};

function getBoardPlacement(index: number): BoardPlacement {
  return BOARD_PLACEMENTS[index] ?? BOARD_PLACEMENTS[1];
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

function getBoardSpaceLabel(space: (typeof BOARD_SPACES)[number]) {
  return space.streetName ?? space.name;
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
            setWalkingPlayerIds((current) =>
              current.filter((currentPlayerId) => currentPlayerId !== playerId),
            );
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
                className="game-board__space"
                style={{
                  gridColumn: placement.column,
                  gridRow: placement.row,
                }}
              >
                <span
                  className="game-board__space-strip"
                  style={{ backgroundColor: space.color }}
                />
                <span className="game-board__space-stage" aria-hidden="true" />
                <Typography.Text strong className="game-board__space-name">
                  {getBoardSpaceLabel(space)}
                </Typography.Text>
              </div>
            </Tooltip>
          );
        })}

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
                <Avatar src={photo?.path} size={36} style={{ backgroundColor: color }}>
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
