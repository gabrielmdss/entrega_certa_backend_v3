import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type * as U from "../../../application/estoque/use-cases/estoque.use-cases.js";
const id = z.string().regex(/^\d+$/),
  params = z.object({ id }),
  itemParams = z.object({ id, apresentacaoId: id });
const positive = z.number().int().positive();
const nullableText = z.string().trim().min(1).nullable().optional();
export class EstoqueController {
  constructor(
    private u: {
      categorias: U.ListarCategoriasPrioridadeUseCase;
      listar: U.ListarInsumosUseCase;
      obter: U.ObterInsumoUseCase;
      cadastrar: U.CadastrarInsumoUseCase;
      listarDoadores: U.ListarDoadoresUseCase;
      criarDoador: U.CriarDoadorUseCase;
      atualizarDoador: U.AtualizarDoadorUseCase;
      entrada: U.RegistrarEntradaEstoqueUseCase;
      perda: U.RegistrarPerdaEstoqueUseCase;
      criarInventario: U.CriarInventarioUseCase;
      obterInventario: U.ObterInventarioUseCase;
      itemInventario: U.InformarItemInventarioUseCase;
      concluirInventario: U.ConcluirInventarioUseCase;
      montar: U.MontarCestasUseCase;
      listarLotes: U.ListarLotesMontagemUseCase;
      obterLote: U.ObterLoteMontagemUseCase;
      desmontar: U.DesmontarCestasUseCase;
      ajustar: U.AjustarLoteMontagemUseCase;
      liberar: U.LiberarCestasDistribuicaoUseCase;
      listarLiberacoes: U.ListarLiberacoesCestasUseCase;
    },
  ) {}
  categorias = async (_q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({ data: await this.u.categorias.execute() });
    } catch (e) {
      n(e);
    }
  };
  listar = async (_q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({ data: await this.u.listar.execute() });
    } catch (e) {
      n(e);
    }
  };
  obter = async (q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({ data: await this.u.obter.execute(params.parse(q.params).id) });
    } catch (e) {
      n(e);
    }
  };
  cadastrar = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = z
        .object({
          nome: z.string().trim().min(1),
          categoriaPrioridadeId: id.nullable().optional(),
          apresentacao: z.object({
            descricao: z.string().trim().min(1),
            quantidadeReferencia: z.number().positive().nullable().optional(),
            unidadeMedida: z.string().trim().min(1).nullable().optional(),
          }),
        })
        .parse(q.body);
      r.status(201).json({
        data: await this.u.cadastrar.execute({
          nome: b.nome,
          categoriaPrioridadeId: b.categoriaPrioridadeId ?? null,
          apresentacao: {
            descricao: b.apresentacao.descricao,
            quantidadeReferencia: b.apresentacao.quantidadeReferencia ?? null,
            unidadeMedida: b.apresentacao.unidadeMedida ?? null,
          },
        }),
      });
    } catch (e) {
      n(e);
    }
  };
  listarDoadores = async (_q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({ data: await this.u.listarDoadores.execute() });
    } catch (e) {
      n(e);
    }
  };
  criarDoador = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = doador.parse(q.body);
      r.status(201).json({
        data: await this.u.criarDoador.execute({
          ...b,
          telefone: b.telefone ?? null,
          observacao: b.observacao ?? null,
        }),
      });
    } catch (e) {
      n(e);
    }
  };
  atualizarDoador = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = doador.extend({ ativo: z.boolean() }).parse(q.body);
      await this.u.atualizarDoador.execute({
        id: params.parse(q.params).id,
        ...b,
        telefone: b.telefone ?? null,
        observacao: b.observacao ?? null,
      });
      r.status(204).send();
    } catch (e) {
      n(e);
    }
  };
  entrada = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = z
        .object({
          tipo: z.enum([
            "DOACAO",
            "COMPRA",
            "SALDO_INICIAL",
            "AJUSTE_POSITIVO",
          ]),
          doadorId: id.nullable().optional(),
          dataEntrada: z.string().date().nullable().optional(),
          observacao: nullableText,
          itens: z
            .array(
              z.object({
                apresentacaoInsumoId: id,
                quantidade: positive,
                validade: z.string().date().nullable().optional(),
              }),
            )
            .min(1),
        })
        .parse(q.body);
      r.status(201).json({
        data: await this.u.entrada.execute({
          ...b,
          doadorId: b.doadorId ?? null,
          dataEntrada: b.dataEntrada ?? null,
          observacao: b.observacao ?? null,
          itens: b.itens.map((x) => ({ ...x, validade: x.validade ?? null })),
          usuarioId: r.locals.user.id,
        }),
      });
    } catch (e) {
      n(e);
    }
  };
  perda = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = z
        .object({
          apresentacaoInsumoId: id,
          quantidade: positive,
          motivoId: id,
          observacao: nullableText,
        })
        .parse(q.body);
      r.status(201).json({
        data: await this.u.perda.execute({
          ...b,
          observacao: b.observacao ?? null,
          usuarioId: r.locals.user.id,
        }),
      });
    } catch (e) {
      n(e);
    }
  };
  criarInventario = async (_q: Request, r: Response, n: NextFunction) => {
    try {
      r.status(201).json({
        data: await this.u.criarInventario.execute(r.locals.user.id),
      });
    } catch (e) {
      n(e);
    }
  };
  obterInventario = async (q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({
        data: await this.u.obterInventario.execute(params.parse(q.params).id),
      });
    } catch (e) {
      n(e);
    }
  };
  itemInventario = async (q: Request, r: Response, n: NextFunction) => {
    try {
      await this.u.itemInventario.execute({
        ...itemParams.parse(q.params),
        inventarioId: itemParams.parse(q.params).id,
        apresentacaoId: itemParams.parse(q.params).apresentacaoId,
        saldoFisico: z
          .object({ saldoFisico: z.number().int().nonnegative() })
          .parse(q.body).saldoFisico,
      });
      r.status(204).send();
    } catch (e) {
      n(e);
    }
  };
  concluirInventario = async (q: Request, r: Response, n: NextFunction) => {
    try {
      await this.u.concluirInventario.execute({
        inventarioId: params.parse(q.params).id,
        usuarioId: r.locals.user.id,
      });
      r.status(204).send();
    } catch (e) {
      n(e);
    }
  };
  montar = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = z
        .object({ planejamentoVersaoId: id, quantidade: positive })
        .parse(q.body);
      r.status(201).json({
        data: await this.u.montar.execute({
          ...b,
          usuarioId: r.locals.user.id,
        }),
      });
    } catch (e) {
      n(e);
    }
  };
  listarLotes = async (_q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({ data: await this.u.listarLotes.execute() });
    } catch (e) {
      n(e);
    }
  };
  obterLote = async (q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({
        data: await this.u.obterLote.execute(params.parse(q.params).id),
      });
    } catch (e) {
      n(e);
    }
  };
  desmontar = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = z
        .object({ quantidade: positive, motivo: z.string().trim().min(1) })
        .parse(q.body);
      await this.u.desmontar.execute({
        loteId: params.parse(q.params).id,
        ...b,
        usuarioId: r.locals.user.id,
      });
      r.status(204).send();
    } catch (e) {
      n(e);
    }
  };
  ajustar = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = z
        .object({
          quantidadeCestasAfetadas: positive,
          motivo: z.string().trim().min(1),
          itens: z
            .array(
              z.object({
                apresentacaoInsumoId: id,
                operacao: z.enum(["ADICIONAR", "REMOVER"]),
                quantidadePorCesta: positive,
              }),
            )
            .min(1),
        })
        .parse(q.body);
      r.status(201).json({
        data: await this.u.ajustar.execute({
          loteId: params.parse(q.params).id,
          ...b,
          usuarioId: r.locals.user.id,
        }),
      });
    } catch (e) {
      n(e);
    }
  };
  liberar = async (q: Request, r: Response, n: NextFunction) => {
    try {
      const b = z
        .object({ loteMontagemId: id, quantidade: positive })
        .parse(q.body);
      r.status(201).json({
        data: await this.u.liberar.execute({
          distribuicaoId: params.parse(q.params).id,
          ...b,
          usuarioId: r.locals.user.id,
        }),
      });
    } catch (e) {
      n(e);
    }
  };
  listarLiberacoes = async (q: Request, r: Response, n: NextFunction) => {
    try {
      r.json({
        data: await this.u.listarLiberacoes.execute(params.parse(q.params).id),
      });
    } catch (e) {
      n(e);
    }
  };
}
const doador = z.object({
  tipo: z.enum(["PESSOA", "INSTITUICAO"]),
  nome: z.string().trim().min(1),
  telefone: nullableText,
  observacao: nullableText,
});
