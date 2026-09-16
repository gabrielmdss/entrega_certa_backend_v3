import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type {
  CriarModeloCestaUseCase,
  CriarVersaoModeloCestaUseCase,
  ListarModelosCestaUseCase,
  ObterModeloCestaUseCase,
} from "../../../application/cestas/use-cases/cestas.use-cases.js";
const id = z.string().regex(/^\d+$/),
  params = z.object({ id });
export class CestasController {
  constructor(
    private listarUC: ListarModelosCestaUseCase,
    private obterUC: ObterModeloCestaUseCase,
    private criarUC: CriarModeloCestaUseCase,
    private versaoUC: CriarVersaoModeloCestaUseCase,
  ) {}
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
  criar = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = z
        .object({
          nome: z.string().trim().min(1),
          tipo: z.enum(["REGULAR", "EMERGENCIAL", "ESPECIAL", "OUTRO"]),
        })
        .parse(q.body);
      r.status(201).json({ data: await this.criarUC.execute(b) });
    } catch (e) {
      n(e);
    }
  };
  versao = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = z
        .object({
          metaItens: z.number().int().positive(),
          itens: z
            .array(
              z.object({
                apresentacaoInsumoId: id,
                quantidade: z.number().int().positive(),
              }),
            )
            .min(1),
        })
        .parse(q.body);
      r.status(201).json({
        data: await this.versaoUC.execute({
          modeloId: params.parse(q.params).id,
          ...b,
          usuarioId: r.locals.user.id,
        }),
      });
    } catch (e) {
      n(e);
    }
  };
}
