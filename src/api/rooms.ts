import { equalTo, get, orderByChild, push, query, ref, set, update } from 'firebase/database';

import { database } from '@/firebase';
import type { CreateRoomInput } from '@/schemas';
import type { Room } from '@/types';

const roomsRef = ref(database, 'rooms');

export async function createRoom(input: CreateRoomInput) {
  const roomRef = push(roomsRef);
  const now = Date.now();

  const room: Room = {
    id: roomRef.key ?? crypto.randomUUID(),
    name: input.name,
    ownerId: input.ownerId,
    status: 'waiting',
    maxPlayers: input.maxPlayers,
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

  return snapshot.val() as Room;
}

export async function listWaitingRooms() {
  const snapshot = await get(query(roomsRef, orderByChild('status'), equalTo('waiting')));

  if (!snapshot.exists()) {
    return [];
  }

  return Object.values(snapshot.val() as Record<string, Room>);
}

export async function updateRoom(roomId: string, room: Partial<Room>) {
  return update(ref(database, `rooms/${roomId}`), {
    ...room,
    updatedAt: Date.now(),
  });
}
