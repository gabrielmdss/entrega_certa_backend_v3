import type { NextFunction, Request, Response } from "express";
import type { ObterStatusAdministrativoUseCase } from "../../../application/admin/use-cases/obter-status-administrativo.use-case.js";
import type { ListarPerfisUseCase } from "../../../application/admin/use-cases/listar-perfis.use-case.js";
import type { CriarUsuarioUseCase } from "../../../application/admin/use-cases/criar-usuario.use-case.js";
import { criarUsuarioSchema } from "./admin.schemas.js";
export class AdminController {
  constructor(
    private readonly statusUC: ObterStatusAdministrativoUseCase,
    private readonly listarPerfisUC: ListarPerfisUseCase,
    private readonly criarUsuarioUC: CriarUsuarioUseCase,
  ) {}
  status = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.statusUC.execute() });
    } catch (e) {
      next(e);
    }
  };
  listarPerfis = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.listarPerfisUC.execute() });
    } catch (e) {
      next(e);
    }
  };
  criarUsuario = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const b = criarUsuarioSchema.parse(req.body);
      res.status(201).json({ data: await this.criarUsuarioUC.execute(b) });
    } catch (e) {
      next(e);
    }
  };
}
