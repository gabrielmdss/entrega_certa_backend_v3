import type { NextFunction, Request, Response } from "express";
import type { ListarGruposDistribuicaoUseCase, ListarMotivosDesligamentoUseCase } from "../../../application/beneficiarios/use-cases/listar-catalogos-assistencia.use-cases.js";
export class CatalogosAssistenciaController {
  constructor(private readonly grupos: ListarGruposDistribuicaoUseCase, private readonly motivos: ListarMotivosDesligamentoUseCase) {}
  listarGrupos = async (_req: Request, res: Response, next: NextFunction) => { try { res.json({ data: await this.grupos.execute() }); } catch (error) { next(error); } };
  listarMotivos = async (_req: Request, res: Response, next: NextFunction) => { try { res.json({ data: await this.motivos.execute() }); } catch (error) { next(error); } };
}
