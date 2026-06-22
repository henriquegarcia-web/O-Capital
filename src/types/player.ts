export type Player = {
  id: string;
  name: string;
  photoKey: string;
  role: PlayerRole;
  colorKey: string;
  joinedAt: number;
};

export type PlayerRole = 'banqueiro' | 'jogador';
