export const GAME_LIMITS = {
  minPlayers: 2,
  maxPlayers: 6,
} as const;

export const ROOM_STATUS_LABELS = {
  waiting: 'Aguardando jogadores',
  playing: 'Partida em andamento',
  finished: 'Partida encerrada',
} as const;

export const PLAYER_ROLE_LABELS = {
  banqueiro: 'Banqueiro',
  jogador: 'Jogador',
} as const;
