import { useMemo } from 'react';

import type { Player } from '@/types';
import { getCurrentRoomPlayerId } from '@/utils';

export function useCurrentRoomPlayer(roomId: string | undefined, players: Player[]) {
  return useMemo(() => {
    if (!roomId) {
      return null;
    }

    const currentPlayerId = getCurrentRoomPlayerId(roomId);

    return players.find((player) => player.id === currentPlayerId) ?? null;
  }, [players, roomId]);
}
