import { z } from 'zod';

export const createRoomSchema = z.object({
  name: z.string().min(3, 'O nome da sala deve ter pelo menos 3 caracteres.'),
  ownerId: z.string().min(1, 'O dono da sala e obrigatorio.'),
  maxPlayers: z.number().int().min(2).max(8),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
