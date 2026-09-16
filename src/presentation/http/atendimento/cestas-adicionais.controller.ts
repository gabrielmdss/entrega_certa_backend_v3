import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { AutorizarCestaAdicionalUseCase, EntregarCestaAdicionalUseCase, ListarCestasAdicionaisUseCase } from "../../../application/atendimento/use-cases/cesta-adicional.use-cases.js";

const id = z.string().regex(/^\d+$/);
const params = z.object({ id });
const authorization = z.object({
  beneficiarioId: id,
  modeloCestaId: id,
  quantidade: z.number().int().positive(),
  justificativa: z.string().trim().min(1),
});

export class CestasAdicionaisController {
  constructor(
    private readonly authorize: AutorizarCestaAdicionalUseCase,
    private readonly deliver: EntregarCestaAdicionalUseCase,
    private readonly list: ListarCestasAdicionaisUseCase,
  ) {}

  autorizar = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.status(201).json({ data: await this.authorize.execute({ distribuicaoId: params.parse(request.params).id, ...authorization.parse(request.body), usuarioId: response.locals.user.id }) });
    } catch (error) { next(error); }
  };

  entregar = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ data: await this.deliver.execute({ cestaAdicionalId: params.parse(request.params).id, usuarioId: response.locals.user.id }) });
    } catch (error) { next(error); }
  };

  listar = async (request: Request, response: Response, next: NextFunction) => {
    try { response.json({ data: await this.list.execute(params.parse(request.params).id) }); }
    catch (error) { next(error); }
  };
}
