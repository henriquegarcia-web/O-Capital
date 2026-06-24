import { GAME_BALANCE } from './balance';

export const GAME_LIMITS = {
  minPlayers: GAME_BALANCE.players.minPlayers,
  maxPlayers: GAME_BALANCE.players.maxPlayers,
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
