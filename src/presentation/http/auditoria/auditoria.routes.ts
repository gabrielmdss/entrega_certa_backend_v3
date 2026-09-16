import { Router, type RequestHandler } from "express";
import type { AuditoriaController } from "./auditoria.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";
export function createAuditoriaRouter(
  c: AuditoriaController,
  a: RequestHandler,
) {
  const r = Router();
  r.use(a, requirePermission("AUDITORIA_VISUALIZAR"));
  r.get("/", c.listar);
  r.get("/:id", c.obter);
  return r;
}
