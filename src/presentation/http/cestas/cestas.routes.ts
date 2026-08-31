import { Router, type RequestHandler } from "express";
import type { CestasController } from "./cestas.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";
export function createCestasRouter(c: CestasController, a: RequestHandler) {
  const r = Router();
  r.use(a);
  r.get("/modelos", requirePermission("CESTA_MODELO_GERENCIAR"), c.listar);
  r.get("/modelos/:id", requirePermission("CESTA_MODELO_GERENCIAR"), c.obter);
  r.post("/modelos", requirePermission("CESTA_MODELO_GERENCIAR"), c.criar);
  r.post(
    "/modelos/:id/versoes",
    requirePermission("CESTA_MODELO_GERENCIAR"),
    c.versao,
  );
  return r;
}
