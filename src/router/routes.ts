export const ROUTES = {
  home: '/',
  room: '/rooms/:roomId',
  gamePlayers: '/rooms/:roomId/game/players',
  gameBoard: '/rooms/:roomId/game/board',
} as const;
