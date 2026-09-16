import type { NextFunction, Request, Response } from "express";
import type { ObterDashboardUseCase } from "../../../application/dashboard/use-cases/obter-dashboard.use-case.js";
export class DashboardController {
  constructor(private readonly obterDashboard: ObterDashboardUseCase) {}
  obter = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.obterDashboard.execute() });
    } catch (error) {
      next(error);
    }
  };
}
