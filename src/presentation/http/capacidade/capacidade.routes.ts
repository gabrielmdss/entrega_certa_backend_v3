import { Router, type RequestHandler } from "express";
import type { CapacidadeController } from "./capacidade.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";
export function createCapacidadeRouter(
  c: CapacidadeController,
  auth: RequestHandler,
) {
  const r = Router();
  r.use(auth);
  r.get("/", requirePermission("BENEFICIARIO_VISUALIZAR"), c.get);
  r.put("/", requirePermission("CAPACIDADE_ALTERAR"), c.put);
  return r;
}
