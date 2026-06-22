import { z } from 'zod';

import { isCompoundName } from '@/utils';

export const signInSchema = z.object({
  email: z.string().email('Informe um e-mail valido.'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
});

export const signUpSchema = signInSchema.extend({
  name: z.string().refine(isCompoundName, 'Informe nome e sobrenome.'),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
