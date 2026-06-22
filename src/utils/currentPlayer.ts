const currentPlayerKey = (roomId: string) => `o-capital:rooms:${roomId}:current-player`;

export function getCurrentRoomPlayerId(roomId: string) {
  return localStorage.getItem(currentPlayerKey(roomId));
}

export function setCurrentRoomPlayerId(roomId: string, playerId: string) {
  localStorage.setItem(currentPlayerKey(roomId), playerId);
}

export function clearCurrentRoomPlayerId(roomId: string) {
  localStorage.removeItem(currentPlayerKey(roomId));
}
