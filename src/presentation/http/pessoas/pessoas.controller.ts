import type { NextFunction, Request, Response } from "express";
import type {
  BuscarPessoasUseCase,
  CriarPessoaUseCase,
  ObterPessoaUseCase,
} from "../../../application/pessoas/use-cases/pessoas.use-cases.js";
import {
  buscarPessoasSchema,
  criarPessoaSchema,
  pessoaIdSchema,
} from "./pessoas.schemas.js";

export class PessoasController {
  constructor(
    private readonly buscarPessoas: BuscarPessoasUseCase,
    private readonly criarPessoa: CriarPessoaUseCase,
    private readonly obterPessoa: ObterPessoaUseCase,
  ) {}

  buscar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = buscarPessoasSchema.parse(req.query);
      const filters: { q?: string; documento?: string } = {};
      if (parsed.q) filters.q = parsed.q;
      if (parsed.documento) filters.documento = parsed.documento;
      res.json({ data: await this.buscarPessoas.execute(filters) });
    } catch (error) {
      next(error);
    }
  };
  criar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res
        .status(201)
        .json({
          data: await this.criarPessoa.execute({
            ...criarPessoaSchema.parse(req.body),
            usuarioId: res.locals.user.id,
          }),
        });
    } catch (error) {
      next(error);
    }
  };
  obter = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        data: await this.obterPessoa.execute(
          pessoaIdSchema.parse(req.params).id,
        ),
      });
    } catch (error) {
      next(error);
    }
  };
}
