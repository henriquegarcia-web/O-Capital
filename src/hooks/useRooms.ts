import { useEffect, useState } from 'react';

import { subscribeToWaitingRooms } from '@/api';
import type { RoomSummary } from '@/types';

export function useRooms() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToWaitingRooms((nextRooms) => {
      setRooms(nextRooms);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return {
    rooms,
    loading,
  };
}
