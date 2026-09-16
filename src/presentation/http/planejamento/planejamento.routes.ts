import { Router, type RequestHandler } from "express";
import type { PlanejamentoController } from "./planejamento.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";
export function createPlanejamentoRouter(
  c: PlanejamentoController,
  a: RequestHandler,
) {
  const r = Router();
  r.use(a);
  r.post("/simular", requirePermission("ESTOQUE_VISUALIZAR"), c.simular);
  r.post("/", requirePermission("CESTA_PLANEJAMENTO_APROVAR"), c.criar);
  r.get("/", requirePermission("ESTOQUE_VISUALIZAR"), c.listar);
  r.get("/:id", requirePermission("ESTOQUE_VISUALIZAR"), c.obter);
  r.post(
    "/:id/aprovar",
    requirePermission("CESTA_PLANEJAMENTO_APROVAR"),
    c.aprovar,
  );
  r.post(
    "/:id/revisoes",
    requirePermission("CESTA_PLANEJAMENTO_APROVAR"),
    c.revisar,
  );
  return r;
}
