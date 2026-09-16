import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type {
  ListarDistribuicoesUseCase,
  ObterDistribuicaoUseCase,
  RemarcarDistribuicaoUseCase,
} from "../../../application/distribuicoes/use-cases/distribuicoes.use-cases.js";
import type { AbrirDistribuicaoUseCase } from "../../../application/distribuicoes/use-cases/abrir-distribuicao.use-case.js";
import type { EncerrarDistribuicaoUseCase } from "../../../application/distribuicoes/use-cases/encerrar-distribuicao.use-case.js";
const id = z.object({ id: z.string().regex(/^\d+$/) });
const filters = z.object({
  competenciaId: z.string().regex(/^\d+$/).optional(),
  grupoId: z.string().regex(/^\d+$/).optional(),
  status: z.string().optional(),
  data: z.string().date().optional(),
});
const remarcar = z.object({
  novaData: z.string().date(),
  motivo: z.string().trim().min(3).max(1000),
});
export class DistribuicoesController {
  constructor(
    private readonly listarUC: ListarDistribuicoesUseCase,
    private readonly obterUC: ObterDistribuicaoUseCase,
    private readonly remarcarUC: RemarcarDistribuicaoUseCase,
    private readonly abrirUC: AbrirDistribuicaoUseCase,
    private readonly encerrarUC: EncerrarDistribuicaoUseCase,
  ) {}
  listar = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const p = filters.parse(q.query);
      const f: {
        competenciaId?: string;
        grupoId?: string;
        status?: string;
        data?: string;
      } = {};
      if (p.competenciaId) f.competenciaId = p.competenciaId;
      if (p.grupoId) f.grupoId = p.grupoId;
      if (p.status) f.status = p.status;
      if (p.data) f.data = p.data;
      r.json({ data: await this.listarUC.execute(f) });
    } catch (e) {
      n(e);
    }
  };
  obter = async (q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({ data: await this.obterUC.execute(id.parse(q.params).id) });
    } catch (e) {
      n(e);
    }
  };
  abrir = async (q: Request, r: Response, n: NextFunction) => {
    try {
      await this.abrirUC.execute({
        id: id.parse(q.params).id,
        usuarioId: r.locals.user.id,
      });
      r.status(204).send();
    } catch (e) {
      n(e);
    }
  };
  encerrar = async (q: Request, r: Response, n: NextFunction) => {
    try {
      await this.encerrarUC.execute({
        id: id.parse(q.params).id,
        usuarioId: r.locals.user.id,
      });
      r.status(204).send();
    } catch (e) {
      n(e);
    }
  };
  remarcar = async (q: Request, r: Response, n: NextFunction) => {
    try {
      await this.remarcarUC.execute({
        ...id.parse(q.params),
        ...remarcar.parse(q.body),
        usuarioId: r.locals.user.id,
      });
      r.status(204).send();
    } catch (e) {
      n(e);
    }
  };
}
