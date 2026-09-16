import { z } from "zod";

export const pessoaIdSchema = z.object({ id: z.string().regex(/^\d+$/) });
export const buscarPessoasSchema = z.object({
  q: z.string().trim().min(2).max(120).optional(),
  documento: z.string().trim().min(2).max(30).optional(),
});
export const criarPessoaSchema = z.object({
  nomeCompleto: z.string().trim().min(3).max(200),
  dataNascimento: z.string().date().nullable().default(null),
  telefone: z.string().trim().min(6).max(30).nullable().default(null),
  documentos: z.array(z.object({
    tipo: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()),
    numero: z.string().trim().min(3).max(50),
    principal: z.boolean().default(false),
  })).min(1).max(10),
});
