import { z } from 'zod';export const alterarCapacidadeSchema=z.object({capacidade:z.number().int().positive(),justificativa:z.string().trim().min(10).max(1000)});
