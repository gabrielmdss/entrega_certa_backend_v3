import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type {
  AvaliarJustificativaUseCase,
  RegistrarJustificativaUseCase,
} from "../../../application/atendimento/use-cases/justificativa.use-cases.js";
import type {
  EstornarRetiradaUseCase,
  ListarRetiradasUseCase,
  ObterRetiradaUseCase,
  RegistrarRetiradaUseCase,
} from "../../../application/atendimento/use-cases/retirada.use-cases.js";
const id = z.string().regex(/^\d+$/),
  params = z.object({ id });
const registrarJ = z.object({
  descricao: z.string().trim().min(1),
  momento: z.enum(["ANTES_DISTRIBUICAO", "DEPOIS_DISTRIBUICAO"]),
});
const avaliarJ = z.object({
  decisao: z.enum(["ACEITA", "REJEITADA"]),
  observacao: z.string().trim().min(1).nullable().optional(),
});
const rep = z.object({
  nome: z.string().trim().min(1),
  documento: z.string().trim().min(1).nullable().optional(),
  relacao: z.string().trim().min(1).nullable().optional(),
  autorizacaoDeclaratoria: z.boolean(),
});
const registrarR = z.object({
  beneficiarioId: id,
  tipo: z.enum([
    "TITULAR",
    "REPRESENTANTE",
    "PRIMEIRA_ENTREGA",
    "ANTECIPADA",
    "CONTINGENCIA",
  ]),
  formaIdentificacao: z
    .enum(["DOCUMENTO", "FOTO_HISTORICO", "REPRESENTANTE", "CONTINGENCIA"])
    .nullable()
    .optional(),
  representante: rep.nullable().optional(),
  justificativaExcecao: z.string().trim().min(1).nullable().optional(),
});
const listarR = z.object({
    beneficiarioId: id.optional(),
    tipo: z
      .enum([
        "TITULAR",
        "REPRESENTANTE",
        "PRIMEIRA_ENTREGA",
        "ANTECIPADA",
        "CONTINGENCIA",
      ])
      .optional(),
    status: z.enum(["VALIDA", "ESTORNADA"]).optional(),
  }),
  estornar = z.object({ motivo: z.string().trim().min(1) });
export class OperacoesAtendimentoController {
  constructor(
    private readonly registrarJustificativaUC: RegistrarJustificativaUseCase,
    private readonly avaliarJustificativaUC: AvaliarJustificativaUseCase,
    private readonly registrarRetiradaUC: RegistrarRetiradaUseCase,
    private readonly listarRetiradasUC: ListarRetiradasUseCase,
    private readonly obterRetiradaUC: ObterRetiradaUseCase,
    private readonly estornarRetiradaUC: EstornarRetiradaUseCase,
  ) {}
  registrarJustificativa = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = registrarJ.parse(q.body);
      r.status(201).json({
        data: await this.registrarJustificativaUC.execute({
          ausenciaId: params.parse(q.params).id,
          ...b,
          usuarioId: r.locals.user.id,
        }),
      });
    } catch (e) {
      n(e);
    }
  };
  avaliarJustificativa = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = avaliarJ.parse(q.body);
      await this.avaliarJustificativaUC.execute({
        justificativaId: params.parse(q.params).id,
        decisao: b.decisao,
        observacao: b.observacao ?? null,
        usuarioId: r.locals.user.id,
      });
      r.status(204).send();
    } catch (e) {
      n(e);
    }
  };
  registrarRetirada = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = registrarR.parse(q.body);
      r.status(201).json({
        data: await this.registrarRetiradaUC.execute({
          distribuicaoId: params.parse(q.params).id,
          ...b,
          formaIdentificacao: b.formaIdentificacao ?? null,
          representante: b.representante
            ? {
                ...b.representante,
                documento: b.representante.documento ?? null,
                relacao: b.representante.relacao ?? null,
              }
            : null,
          justificativaExcecao: b.justificativaExcecao ?? null,
          usuarioId: r.locals.user.id,
          permissoes: r.locals.permissions,
        }),
      });
    } catch (e) {
      n(e);
    }
  };
  listarRetiradas = async (q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({
        data: await this.listarRetiradasUC.execute({
          distribuicaoId: params.parse(q.params).id,
          ...listarR.parse(q.query),
        }),
      });
    } catch (e) {
      n(e);
    }
  };
  obterRetirada = async (q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({
        data: await this.obterRetiradaUC.execute(params.parse(q.params).id),
      });
    } catch (e) {
      n(e);
    }
  };
  estornarRetirada = async (q: Request, r: Response, n: NextFunction) => {
    try {
      await this.estornarRetiradaUC.execute({
        retiradaId: params.parse(q.params).id,
        ...estornar.parse(q.body),
        usuarioId: r.locals.user.id,
        permissoes: r.locals.permissions,
      });
      r.status(204).send();
    } catch (e) {
      n(e);
    }
  };
}
