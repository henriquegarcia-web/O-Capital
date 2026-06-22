import { BOARD_SIZE, START_SPACE_INDEX } from '@/constants';
import type { DiceRoll, GameState, Player } from '@/types';

export function getActivePlayers(players: Player[]) {
  return players.filter((player) => player.status !== 'eliminated');
}

export function normalizePlayerOrder(players: Player[], playerOrder: string[] = []) {
  const activePlayerIds = new Set(getActivePlayers(players).map((player) => player.id));
  const orderedPlayers = playerOrder.filter((playerId) => activePlayerIds.has(playerId));
  const missingPlayers = getActivePlayers(players)
    .filter((player) => !orderedPlayers.includes(player.id))
    .sort((current, next) => current.joinedAt - next.joinedAt)
    .map((player) => player.id);

  return [...orderedPlayers, ...missingPlayers];
}

export function getInitialGameState(players: Player[], now = Date.now()): GameState {
  const playerOrder = normalizePlayerOrder(players);

  return {
    status: 'waiting',
    round: 1,
    turnPlayerId: playerOrder[0] ?? null,
    turnStartedAt: null,
    playerOrder,
    positions: Object.fromEntries(playerOrder.map((playerId) => [playerId, START_SPACE_INDEX])),
    completedTurns: {},
    lastRoll: null,
    playerLastRolls: {},
    titles: {},
    updatedAt: now,
  };
}

export function hydrateGameState(game: GameState | undefined, players: Player[]) {
  const now = Date.now();
  const baseGame = game ?? getInitialGameState(players, now);
  const playerOrder = normalizePlayerOrder(players, baseGame.playerOrder);
  const basePositions = baseGame.positions ?? {};
  const baseCompletedTurns = baseGame.completedTurns ?? {};
  const positions = Object.fromEntries(
    playerOrder.map((playerId) => [playerId, basePositions[playerId] ?? START_SPACE_INDEX]),
  );
  const completedTurns = Object.fromEntries(
    playerOrder.map((playerId) => [playerId, Boolean(baseCompletedTurns[playerId])]),
  );
  const turnPlayerId =
    baseGame.turnPlayerId && playerOrder.includes(baseGame.turnPlayerId)
      ? baseGame.turnPlayerId
      : playerOrder[0] ?? null;

  return {
    ...baseGame,
    playerOrder,
    positions,
    completedTurns,
    playerLastRolls: baseGame.playerLastRolls ?? {},
    titles: baseGame.titles ?? {},
    turnPlayerId,
  };
}

export function moveBoardPosition(currentPosition: number, spacesToMove: number) {
  return (((currentPosition - 1 + spacesToMove) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE + 1;
}

export function advanceTurn(game: GameState, roll: DiceRoll) {
  const nextCompletedTurns = {
    ...game.completedTurns,
    [roll.playerId]: true,
  };
  const completedRound = game.playerOrder.every((playerId) => nextCompletedTurns[playerId]);
  const currentPlayerIndex = Math.max(0, game.playerOrder.indexOf(roll.playerId));
  const nextPlayerId =
    game.playerOrder.length > 0
      ? game.playerOrder[(currentPlayerIndex + 1) % game.playerOrder.length]
      : null;

  return {
    nextCompletedTurns: completedRound ? {} : nextCompletedTurns,
    nextRound: completedRound ? game.round + 1 : game.round,
    nextPlayerId,
  };
}

export function formatDiceRoll(roll?: DiceRoll | null) {
  if (!roll) {
    return 'Nenhuma jogada registrada';
  }

  return `${roll.diceOne} + ${roll.diceTwo} = ${roll.total}`;
}
