import { Router, type RequestHandler } from "express";
import type { EstoqueController } from "./estoque.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";
export function createEstoqueRouter(c: EstoqueController, a: RequestHandler) {
  const r = Router();
  r.use(a);
  r.get(
    "/categorias-prioridade",
    requirePermission("ESTOQUE_VISUALIZAR"),
    c.categorias,
  );
  r.get("/insumos", requirePermission("ESTOQUE_VISUALIZAR"), c.listar);
  r.get("/insumos/:id", requirePermission("ESTOQUE_VISUALIZAR"), c.obter);
  r.post(
    "/insumos",
    requirePermission("ESTOQUE_INSUMO_CADASTRAR"),
    c.cadastrar,
  );
  r.post("/entradas", requirePermission("ESTOQUE_ENTRADA"), c.entrada);
  r.post("/perdas", requirePermission("ESTOQUE_PERDA"), c.perda);
  r.post(
    "/inventarios",
    requirePermission("ESTOQUE_INVENTARIO"),
    c.criarInventario,
  );
  r.get(
    "/inventarios/:id",
    requirePermission("ESTOQUE_INVENTARIO"),
    c.obterInventario,
  );
  r.put(
    "/inventarios/:id/itens/:apresentacaoId",
    requirePermission("ESTOQUE_INVENTARIO"),
    c.itemInventario,
  );
  r.post(
    "/inventarios/:id/concluir",
    requirePermission("ESTOQUE_INVENTARIO"),
    c.concluirInventario,
  );
  r.post("/lotes-montagem", requirePermission("CESTA_MONTAR"), c.montar);
  r.get(
    "/lotes-montagem",
    requirePermission("ESTOQUE_VISUALIZAR"),
    c.listarLotes,
  );
  r.get(
    "/lotes-montagem/:id",
    requirePermission("ESTOQUE_VISUALIZAR"),
    c.obterLote,
  );
  r.post(
    "/lotes-montagem/:id/desmontar",
    requirePermission("CESTA_DESMONTAR"),
    c.desmontar,
  );
  r.post(
    "/lotes-montagem/:id/ajustes",
    requirePermission("CESTA_AJUSTAR_LOTE"),
    c.ajustar,
  );
  return r;
}
export function createDoadoresRouter(c: EstoqueController, a: RequestHandler) {
  const r = Router();
  r.use(a);
  r.get("/", requirePermission("ESTOQUE_VISUALIZAR"), c.listarDoadores);
  r.post("/", requirePermission("ESTOQUE_ENTRADA"), c.criarDoador);
  r.put("/:id", requirePermission("ESTOQUE_ENTRADA"), c.atualizarDoador);
  return r;
}
export function createLiberacoesRouter(
  c: EstoqueController,
  a: RequestHandler,
) {
  const r = Router();
  r.use(a);
  r.post(
    "/:id/liberacoes-cestas",
    requirePermission("CESTA_LIBERAR_DISTRIBUICAO"),
    c.liberar,
  );
  r.get(
    "/:id/liberacoes-cestas",
    requirePermission("ESTOQUE_VISUALIZAR"),
    c.listarLiberacoes,
  );
  return r;
}
