import type { Request, Response, NextFunction } from 'express';
import type { ObterBeneficiarioUseCase } from '../../../application/beneficiarios/use-cases/obter-beneficiario.use-case.js';
import { beneficiarioIdParamsSchema } from './beneficiarios.schemas.js';

export class BeneficiariosController {
  constructor(private readonly obterBeneficiario: ObterBeneficiarioUseCase) {}
  obterPorId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = beneficiarioIdParamsSchema.parse(req.params);
      res.status(200).json({ data: await this.obterBeneficiario.execute(id) });
    } catch (error) { next(error); }
  };
}
