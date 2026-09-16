import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { NextFunction, Request, Response } from "express";
import type {
  BuscarPessoasUseCase,
  CriarPessoaUseCase,
  ObterFotoPessoaUseCase,
  ObterPessoaUseCase,
  UploadFotoPessoaUseCase,
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
    private readonly uploadFoto: UploadFotoPessoaUseCase,
    private readonly obterFoto: ObterFotoPessoaUseCase,
    private readonly storagePath: string,
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
  enviarFoto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = pessoaIdSchema.parse(req.params);
      const file = req.file as Express.Multer.File;
      await this.uploadFoto.execute({
        pessoaId: id,
        storageKey: `pessoas/${file.filename}`,
        nomeOriginal: file.originalname || null,
        mimeType: file.mimetype,
        tamanhoBytes: file.size,
        usuarioId: res.locals.user.id,
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
  obterFotoArquivo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = pessoaIdSchema.parse(req.params);
      const foto = await this.obterFoto.execute(id);
      res.setHeader("Content-Type", foto.mimeType);
      createReadStream(join(this.storagePath, foto.storageKey)).pipe(res);
    } catch (error) {
      next(error);
    }
  };
}
