import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type {
  ListarAuditoriaUseCase,
  ObterAuditoriaUseCase,
} from "../../../application/auditoria/use-cases/auditoria.use-cases.js";
const id = z.object({ id: z.string().regex(/^\d+$/) });
const filters = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  usuarioId: z.string().regex(/^\d+$/).optional(),
  entidade: z.string().trim().min(1).max(100).optional(),
  entidadeId: z.string().regex(/^\d+$/).optional(),
  operacao: z.string().trim().min(1).max(100).optional(),
  dataInicio: z.string().date().optional(),
  dataFim: z.string().date().optional(),
});
export class AuditoriaController {
  constructor(
    private readonly listarUC: ListarAuditoriaUseCase,
    private readonly obterUC: ObterAuditoriaUseCase,
  ) {}
  listar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.listarUC.execute(filters.parse(req.query)));
    } catch (e) {
      next(e);
    }
  };
  obter = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.obterUC.execute(id.parse(req.params).id) });
    } catch (e) {
      next(e);
    }
  };
}
