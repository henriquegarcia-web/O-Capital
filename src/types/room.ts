import type { GameState } from './game';

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export type Room = {
  id: string;
  name: string;
  ownerId: string;
  status: RoomStatus;
  maxPlayers: number;
  game?: GameState;
  createdAt: number;
  updatedAt: number;
};

export type RoomSummary = Room & {
  playerCount: number;
};
