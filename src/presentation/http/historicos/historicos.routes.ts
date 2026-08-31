import { Router, type RequestHandler } from "express";
import type { HistoricosController } from "./historicos.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";
export function createHistoricoBeneficiarioRouter(
  c: HistoricosController,
  a: RequestHandler,
) {
  const r = Router();
  r.use(a);
  r.get(
    "/:id/historico",
    requirePermission("BENEFICIARIO_VISUALIZAR"),
    c.beneficiario,
  );
  return r;
}
export function createHistoricoDistribuicaoRouter(
  c: HistoricosController,
  a: RequestHandler,
) {
  const r = Router();
  r.use(a);
  r.get(
    "/:id/historico",
    requirePermission("BENEFICIARIO_VISUALIZAR"),
    c.distribuicao,
  );
  return r;
}
