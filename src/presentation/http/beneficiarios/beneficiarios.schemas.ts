import { z } from 'zod';
const id=z.string().regex(/^\d+$/,'ID inválido');
export const admitirBeneficiarioSchema=z.object({pessoaId:id,grupoId:id,autorizarAcimaCapacidade:z.boolean().default(false),justificativaExcecao:z.string().trim().min(10).max(1000).nullable().default(null)});
export const desligarBeneficiarioSchema=z.object({motivoId:id,observacao:z.string().trim().max(1000).nullable().default(null)});
export const alterarGrupoSchema=z.object({grupoDestinoId:id,vigenciaCompetenciaAtual:z.boolean().default(false),motivo:z.string().trim().min(3).max(1000)});
export const beneficiarioIdParamsSchema = z.object({ id: z.string().regex(/^\d+$/, 'ID inválido') });
