export type Player = {
  id: string;
  name: string;
  photoKey: string;
  role: PlayerRole;
  colorKey: string;
  status?: PlayerStatus;
  joinedAt: number;
};

export type PlayerRole = 'banqueiro' | 'jogador';
export type PlayerStatus = 'active' | 'eliminated';
