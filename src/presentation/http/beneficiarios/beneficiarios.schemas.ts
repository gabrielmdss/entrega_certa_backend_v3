import { z } from 'zod';
export const beneficiarioIdParamsSchema = z.object({ id: z.string().regex(/^\d+$/, 'ID inválido') });
