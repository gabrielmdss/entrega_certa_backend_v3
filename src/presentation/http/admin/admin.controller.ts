import type { NextFunction, Request, Response } from "express";
import type { ObterStatusAdministrativoUseCase } from "../../../application/admin/use-cases/obter-status-administrativo.use-case.js";
export class AdminController {
  constructor(private readonly statusUC: ObterStatusAdministrativoUseCase) {}
  status = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.statusUC.execute() });
    } catch (e) {
      next(e);
    }
  };
}
