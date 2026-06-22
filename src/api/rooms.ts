import {
  equalTo,
  get,
  off,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  set,
  update,
} from 'firebase/database';

import { GAME_LIMITS } from '@/constants';
import { database } from '@/firebase';
import type { CreatePlayerInput, CreateRoomInput } from '@/schemas';
import type { Player, Room, RoomSummary } from '@/types';
import { normalizeComparableText } from '@/utils';

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

  return player;
}

export async function updateRoom(roomId: string, room: Partial<Room>) {
  return update(ref(database, `rooms/${roomId}`), {
    ...room,
    updatedAt: Date.now(),
  });
}
