import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type {
  AprovarPlanejamentoUseCase,
  CriarPlanejamentoUseCase,
  ListarPlanejamentosUseCase,
  ObterPlanejamentoUseCase,
  RevisarPlanejamentoUseCase,
  SimularPlanejamentoUseCase,
} from "../../../application/planejamento/use-cases/planejamento.use-cases.js";
const id = z.string().regex(/^\d+$/),
  params = z.object({ id }),
  base = z.object({
    competenciaId: id,
    modeloCestaVersaoId: id,
    quantidade: z.number().int().positive(),
  });
export class PlanejamentoController {
  constructor(
    private simularUC: SimularPlanejamentoUseCase,
    private criarUC: CriarPlanejamentoUseCase,
    private listarUC: ListarPlanejamentosUseCase,
    private obterUC: ObterPlanejamentoUseCase,
    private aprovarUC: AprovarPlanejamentoUseCase,
    private revisarUC: RevisarPlanejamentoUseCase,
  ) {}
  simular = async (q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({ data: await this.simularUC.execute(base.parse(q.body)) });
    } catch (e) {
      n(e);
    }
  };
  criar = async (q: Request, r: Response, n: NextFunction) => {
    try {
      r.status(201).json({
        data: await this.criarUC.execute(base.parse(q.body)),
      });
    } catch (e) {
      n(e);
    }
  };
  listar = async (_q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({ data: await this.listarUC.execute() });
    } catch (e) {
      n(e);
    }
  };
  obter = async (q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({ data: await this.obterUC.execute(params.parse(q.params).id) });
    } catch (e) {
      n(e);
    }
  };
  aprovar = async (q: Request, r: Response, n: NextFunction) => {
    try {
      await this.aprovarUC.execute({
        id: params.parse(q.params).id,
        usuarioId: r.locals.user.id,
      });
      r.status(204).send();
    } catch (e) {
      n(e);
    }
  };
  revisar = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = z
        .object({
          quantidade: z.number().int().positive(),
          modeloCestaVersaoId: id,
          motivo: z.string().trim().min(1),
        })
        .parse(q.body);
      r.status(201).json({
        data: await this.revisarUC.execute({
          id: params.parse(q.params).id,
          ...b,
        }),
      });
    } catch (e) {
      n(e);
    }
  };
}
