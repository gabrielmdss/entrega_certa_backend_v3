import { z } from 'zod';
export const loginSchema=z.object({ login:z.string().trim().min(1).max(100), senha:z.string().min(1).max(200) });
export const alterarSenhaSchema=z.object({ senhaAtual:z.string().min(1).max(200), novaSenha:z.string().min(8).max(200) });
