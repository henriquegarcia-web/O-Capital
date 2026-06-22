import { z } from 'zod';

import { PROFILE_COLORS, PROFILE_PHOTOS } from '@/constants';

export const createRoomSchema = z.object({
  name: z.string().min(3, 'O nome da sala deve ter pelo menos 3 caracteres.'),
});

export const createPlayerSchema = z.object({
  name: z.string().min(2, 'O nome do jogador deve ter pelo menos 2 caracteres.'),
  photoKey: z.enum(PROFILE_PHOTOS.map((photo) => photo.key) as [string, ...string[]], {
    required_error: 'Selecione uma foto de perfil.',
  }),
  colorKey: z.enum(PROFILE_COLORS.map((color) => color.key) as [string, ...string[]], {
    required_error: 'Selecione uma cor de perfil.',
  }),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
