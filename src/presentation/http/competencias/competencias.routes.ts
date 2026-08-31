import { Router, type RequestHandler } from "express";
import type { CompetenciasController } from "./competencias.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";
export function createCompetenciasRouter(
  c: CompetenciasController,
  a: RequestHandler,
) {
  const r = Router();
  r.use(a);
  r.get("/", requirePermission("BENEFICIARIO_VISUALIZAR"), c.listar);
  r.get("/:id", requirePermission("BENEFICIARIO_VISUALIZAR"), c.obter);
  r.post("/gerar", requirePermission("DISTRIBUICAO_ABRIR"), c.gerar);
  return r;
}
