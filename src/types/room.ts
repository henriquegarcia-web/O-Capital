export type RoomStatus = 'waiting' | 'playing' | 'finished';

export type Room = {
  id: string;
  name: string;
  ownerId: string;
  status: RoomStatus;
  maxPlayers: number;
  createdAt: number;
  updatedAt: number;
};
