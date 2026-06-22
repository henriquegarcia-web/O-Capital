import { useEffect, useState } from 'react';

import { subscribeToRoom } from '@/api';
import type { Player, Room } from '@/types';

export function useRoom(roomId?: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(Boolean(roomId));

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setPlayers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = subscribeToRoom(roomId, (nextRoom, nextPlayers) => {
      setRoom(nextRoom);
      setPlayers(nextPlayers);
      setLoading(false);
    });

    return unsubscribe;
  }, [roomId]);

  return {
    room,
    players,
    loading,
  };
}
