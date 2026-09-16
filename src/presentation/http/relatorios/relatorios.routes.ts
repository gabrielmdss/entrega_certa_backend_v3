import { Router, type RequestHandler } from "express";
import type { RelatoriosController } from "./relatorios.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";
export function createRelatoriosRouter(
  c: RelatoriosController,
  a: RequestHandler,
) {
  const r = Router();
  r.use(a);
  r.get(
    "/distribuicoes",
    requirePermission("BENEFICIARIO_VISUALIZAR"),
    c.distribuicoes,
  );
  r.get(
    "/beneficiarios",
    requirePermission("BENEFICIARIO_VISUALIZAR"),
    c.beneficiarios,
  );
  r.get("/estoque", requirePermission("ESTOQUE_VISUALIZAR"), c.estoque);
  return r;
}
