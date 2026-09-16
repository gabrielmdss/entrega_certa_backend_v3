import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type {
  ListarRelatorioBeneficiariosUseCase,
  ListarRelatorioDistribuicoesUseCase,
  ListarRelatorioEstoqueUseCase,
} from "../../../application/relatorios/use-cases/relatorios.use-cases.js";
const base = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const date = z.string().date().optional(),
  numeric = z.string().regex(/^\d+$/).optional();
const distributions = base.extend({
  dataInicio: date,
  dataFim: date,
  competencia: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  grupoId: numeric,
  status: z.enum(["PLANEJADA", "PREPARADA", "ABERTA", "ENCERRADA"]).optional(),
});
const beneficiaries = base.extend({
  status: z.enum(["ATIVO", "DESLIGADO"]).optional(),
  grupoId: numeric,
  dataAdmissaoInicio: date,
  dataAdmissaoFim: date,
});
const stock = base.extend({
  insumo: z.string().trim().min(1).max(100).optional(),
  tipoMovimento: z
    .enum([
      "ENTRADA",
      "CONSUMO_MONTAGEM",
      "RETORNO_DESMONTAGEM",
      "PERDA",
      "AJUSTE_INVENTARIO",
    ])
    .optional(),
  dataInicio: date,
  dataFim: date,
});
function clean<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}
export class RelatoriosController {
  constructor(
    private readonly distribuicoesUC: ListarRelatorioDistribuicoesUseCase,
    private readonly beneficiariosUC: ListarRelatorioBeneficiariosUseCase,
    private readonly estoqueUC: ListarRelatorioEstoqueUseCase,
  ) {}
  distribuicoes = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await this.distribuicoesUC.execute(
          clean(distributions.parse(req.query)),
        ),
      );
    } catch (e) {
      next(e);
    }
  };
  beneficiarios = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await this.beneficiariosUC.execute(
          clean(beneficiaries.parse(req.query)),
        ),
      );
    } catch (e) {
      next(e);
    }
  };
  estoque = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.estoqueUC.execute(clean(stock.parse(req.query))));
    } catch (e) {
      next(e);
    }
  };
}
