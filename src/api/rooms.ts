import {
  equalTo,
  get,
  off,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  runTransaction,
  set,
  update,
} from 'firebase/database';

import { GAME_LIMITS } from '@/constants';
import { database } from '@/firebase';
import type { CreatePlayerInput, CreateRoomInput } from '@/schemas';
import type { DiceRoll, GameState, Player, Room, RoomSummary } from '@/types';
import {
  advanceTurn,
  getActivePlayers,
  getInitialGameState,
  hydrateGameState,
  moveBoardPosition,
  normalizeComparableText,
  normalizePlayerOrder,
} from '@/utils';

const roomsRef = ref(database, 'rooms');

type RoomRecord = Room & {
  players?: Record<string, Player>;
};

function toRoomSummary(room: RoomRecord): RoomSummary {
  return {
    ...room,
    playerCount: Object.keys(room.players ?? {}).length,
  };
}

function toPlayersArray(players?: Record<string, Player>) {
  return Object.values(players ?? {}).sort((current, next) => current.joinedAt - next.joinedAt);
}

function hasSameName(name: string, items: Array<{ name: string }>) {
  const comparableName = normalizeComparableText(name);

  return items.some((item) => normalizeComparableText(item.name) === comparableName);
}

function toFirebaseValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function createRoom(input: CreateRoomInput) {
  const waitingRooms = await listWaitingRooms();

  if (hasSameName(input.name, waitingRooms)) {
    throw new Error('Ja existe uma sala ativa com esse nome.');
  }

  const roomRef = push(roomsRef);
  const now = Date.now();

  const room: Room = {
    id: roomRef.key ?? crypto.randomUUID(),
    name: input.name.trim(),
    ownerId: '',
    status: 'waiting',
    maxPlayers: GAME_LIMITS.maxPlayers,
    createdAt: now,
    updatedAt: now,
  };

  await set(roomRef, room);

  return room;
}

export async function getRoom(roomId: string) {
  const snapshot = await get(ref(database, `rooms/${roomId}`));

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.val() as RoomRecord;
}

export async function listWaitingRooms() {
  const snapshot = await get(query(roomsRef, orderByChild('status'), equalTo('waiting')));

  if (!snapshot.exists()) {
    return [];
  }

  return Object.values(snapshot.val() as Record<string, RoomRecord>).map(toRoomSummary);
}

export function subscribeToWaitingRooms(onChange: (rooms: RoomSummary[]) => void) {
  const waitingRoomsQuery = query(roomsRef, orderByChild('status'), equalTo('waiting'));

  onValue(waitingRoomsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      onChange([]);
      return;
    }

    const rooms = Object.values(snapshot.val() as Record<string, RoomRecord>)
      .map(toRoomSummary)
      .sort((current, next) => next.createdAt - current.createdAt);

    onChange(rooms);
  });

  return () => off(waitingRoomsQuery);
}

export function subscribeToRoom(
  roomId: string,
  onChange: (room: Room | null, players: Player[]) => void,
) {
  const roomRef = ref(database, `rooms/${roomId}`);

  onValue(roomRef, (snapshot) => {
    if (!snapshot.exists()) {
      onChange(null, []);
      return;
    }

    const { players, ...room } = snapshot.val() as RoomRecord;

    onChange(room, toPlayersArray(players));
  });

  return () => off(roomRef);
}

export async function addPlayerToRoom(roomId: string, input: CreatePlayerInput) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);

  if (players.length >= GAME_LIMITS.maxPlayers) {
    throw new Error('A sala atingiu o limite de jogadores.');
  }

  if (hasSameName(input.name, players)) {
    throw new Error('Ja existe um jogador com esse nome nesta sala.');
  }

  if (players.some((player) => player.colorKey === input.colorKey)) {
    throw new Error('Essa cor ja foi escolhida por outro jogador.');
  }

  const playerRef = push(ref(database, `rooms/${roomId}/players`));
  const player: Player = {
    id: playerRef.key ?? crypto.randomUUID(),
    name: input.name.trim(),
    photoKey: input.photoKey,
    role: players.length === 0 ? 'banqueiro' : 'jogador',
    colorKey: input.colorKey,
    joinedAt: Date.now(),
  };

  await set(playerRef, player);

  if (!room.ownerId) {
    await updateRoom(roomId, { ownerId: player.id });
  }

  if (room.game) {
    const nextGame = hydrateGameState(room.game, [...players, player]);

    await update(ref(database, `rooms/${roomId}/game`), {
      ...toFirebaseValue(nextGame),
      updatedAt: Date.now(),
    });
  }

  return player;
}

export async function updateRoom(roomId: string, room: Partial<Room>) {
  return update(ref(database, `rooms/${roomId}`), {
    ...room,
    updatedAt: Date.now(),
  });
}

export async function renameRoom(roomId: string, name: string) {
  const trimmedName = name.trim();

  if (trimmedName.length < 3) {
    throw new Error('O nome da sala deve ter pelo menos 3 caracteres.');
  }

  return updateRoom(roomId, { name: trimmedName });
}

export async function deleteRoom(roomId: string) {
  return remove(ref(database, `rooms/${roomId}`));
}

export async function startGame(roomId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const activePlayers = getActivePlayers(players);

  if (activePlayers.length === 0) {
    throw new Error('Adicione jogadores ativos antes de iniciar a partida.');
  }

  const now = Date.now();
  const currentGame = hydrateGameState(room.game, players);
  const playerOrder = normalizePlayerOrder(players, currentGame.playerOrder);
  const game: GameState = {
    ...currentGame,
    status: 'playing',
    playerOrder,
    turnPlayerId: currentGame.turnPlayerId && playerOrder.includes(currentGame.turnPlayerId)
      ? currentGame.turnPlayerId
      : playerOrder[0] ?? null,
    turnStartedAt: now,
    startedAt: currentGame.startedAt ?? now,
    pausedAt: undefined,
    finishedAt: undefined,
    updatedAt: now,
  };

  return update(ref(database, `rooms/${roomId}`), {
    status: 'playing',
    game: toFirebaseValue(game),
    updatedAt: now,
  });
}

export async function pauseGame(roomId: string) {
  const now = Date.now();

  return update(ref(database, `rooms/${roomId}`), {
    'game/status': 'paused',
    'game/pausedAt': now,
    'game/updatedAt': now,
    updatedAt: now,
  });
}

export async function finishGame(roomId: string) {
  const now = Date.now();

  return update(ref(database, `rooms/${roomId}`), {
    status: 'finished',
    'game/status': 'finished',
    'game/finishedAt': now,
    'game/updatedAt': now,
    updatedAt: now,
  });
}

export async function resetGame(roomId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const now = Date.now();
  const game = {
    ...getInitialGameState(toPlayersArray(room.players), now),
    updatedAt: now,
  };

  return update(ref(database, `rooms/${roomId}`), {
    status: 'waiting',
    game: toFirebaseValue(game),
    updatedAt: now,
  });
}

export async function reorderPlayers(roomId: string, playerOrder: string[]) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const currentGame = hydrateGameState(room.game, players);
  const nextPlayerOrder = normalizePlayerOrder(players, playerOrder);
  const nextTurnPlayerId =
    currentGame.turnPlayerId && nextPlayerOrder.includes(currentGame.turnPlayerId)
      ? currentGame.turnPlayerId
      : nextPlayerOrder[0] ?? null;

  return update(ref(database, `rooms/${roomId}/game`), {
    ...toFirebaseValue(currentGame),
    playerOrder: nextPlayerOrder,
    turnPlayerId: nextTurnPlayerId,
    updatedAt: Date.now(),
  });
}

export async function eliminatePlayer(roomId: string, playerId: string) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const currentGame = hydrateGameState(room.game, players);
  const nextPlayers = players.map((player) =>
    player.id === playerId ? { ...player, status: 'eliminated' as const } : player,
  );
  const playerOrder = normalizePlayerOrder(nextPlayers, currentGame.playerOrder);
  const titles = Object.fromEntries(
    Object.entries(currentGame.titles ?? {}).map(([key, title]) => [
      key,
      title.ownerId === playerId ? { ...title, ownerId: null, properties: [] } : title,
    ]),
  );
  const nextTurnPlayerId =
    currentGame.turnPlayerId === playerId
      ? playerOrder[0] ?? null
      : currentGame.turnPlayerId && playerOrder.includes(currentGame.turnPlayerId)
        ? currentGame.turnPlayerId
        : playerOrder[0] ?? null;
  const now = Date.now();

  return update(ref(database, `rooms/${roomId}`), {
    [`players/${playerId}/status`]: 'eliminated',
    'game/playerOrder': playerOrder,
    'game/turnPlayerId': nextTurnPlayerId,
    'game/titles': titles,
    'game/updatedAt': now,
    updatedAt: now,
  });
}

export async function rollPlayerDice(
  roomId: string,
  playerId: string,
  diceResult?: { diceOne: number; diceTwo: number },
) {
  const room = await getRoom(roomId);

  if (!room) {
    throw new Error('Sala nao encontrada.');
  }

  const players = toPlayersArray(room.players);
  const diceOne = diceResult?.diceOne ?? Math.floor(Math.random() * 6) + 1;
  const diceTwo = diceResult?.diceTwo ?? Math.floor(Math.random() * 6) + 1;
  const now = Date.now();
  const roll: DiceRoll = {
    playerId,
    diceOne,
    diceTwo,
    total: diceOne + diceTwo,
    createdAt: now,
  };

  await runTransaction(ref(database, `rooms/${roomId}/game`), (currentGame?: GameState) => {
    const game = hydrateGameState(currentGame, players);

    if (game.status !== 'playing') {
      throw new Error('A partida precisa estar em andamento para jogar.');
    }

    if (game.turnPlayerId !== playerId) {
      throw new Error('Aguarde a sua vez de jogar.');
    }

    const position = game.positions[playerId] ?? 1;
    const nextPosition = moveBoardPosition(position, roll.total);
    const { nextCompletedTurns, nextPlayerId, nextRound } = advanceTurn(game, roll);

    return {
      ...game,
      round: nextRound,
      turnPlayerId: nextPlayerId,
      turnStartedAt: now,
      positions: {
        ...game.positions,
        [playerId]: nextPosition,
      },
      completedTurns: nextCompletedTurns,
      lastRoll: roll,
      playerLastRolls: {
        ...game.playerLastRolls,
        [playerId]: roll,
      },
      updatedAt: now,
    };
  });

  await update(ref(database, `rooms/${roomId}`), {
    updatedAt: now,
  });

  return roll;
}
