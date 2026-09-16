import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type {
  ObterHistoricoBeneficiarioUseCase,
  ObterHistoricoDistribuicaoUseCase,
} from "../../../application/historicos/use-cases/historicos.use-cases.js";
const schema = z.object({ id: z.string().regex(/^\d+$/) });
export class HistoricosController {
  constructor(
    private readonly beneficiarioUC: ObterHistoricoBeneficiarioUseCase,
    private readonly distribuicaoUC: ObterHistoricoDistribuicaoUseCase,
  ) {}
  beneficiario = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        data: await this.beneficiarioUC.execute(schema.parse(req.params).id),
      });
    } catch (e) {
      next(e);
    }
  };
  distribuicao = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        data: await this.distribuicaoUC.execute(schema.parse(req.params).id),
      });
    } catch (e) {
      next(e);
    }
  };
}
