import { Router, type RequestHandler } from "express";
import type { AdminController } from "./admin.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";
export function createAdminRouter(c: AdminController, a: RequestHandler) {
  const r = Router();
  r.use(a);
  r.get("/status", requirePermission("PERFIL_GERENCIAR"), c.status);
  return r;
}
