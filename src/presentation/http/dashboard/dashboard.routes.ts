import { Router, type RequestHandler } from "express";
import type { DashboardController } from "./dashboard.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";
export function createDashboardRouter(
  c: DashboardController,
  a: RequestHandler,
) {
  const r = Router();
  r.use(a);
  r.get(
    "/",
    requirePermission("BENEFICIARIO_VISUALIZAR"),
    requirePermission("ESTOQUE_VISUALIZAR"),
    c.obter,
  );
  return r;
}
