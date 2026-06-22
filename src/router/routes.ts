export const ROUTES = {
  home: '/',
  room: '/rooms/:roomId',
  gamePlayers: '/rooms/:roomId/app/:menuKey',
  gameBoard: '/rooms/:roomId/game/board',
} as const;
