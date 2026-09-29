import { z } from "zod";

export const criarUsuarioSchema = z.object({
  login: z.string().trim().min(3).max(100),
  senha: z.string().min(8).max(200),
  perfilIds: z.array(z.string().regex(/^\d+$/)).min(1),
});
