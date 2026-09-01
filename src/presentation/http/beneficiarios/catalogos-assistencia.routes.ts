import { Router, type RequestHandler } from "express";
import type { CatalogosAssistenciaController } from "./catalogos-assistencia.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";
export function createCatalogosAssistenciaRouter(controller: CatalogosAssistenciaController, authentication: RequestHandler) {
  const router = Router();
  router.get("/grupos-distribuicao", authentication, requirePermission("BENEFICIARIO_VISUALIZAR"), controller.listarGrupos);
  router.get("/motivos-desligamento", authentication, requirePermission("BENEFICIARIO_VISUALIZAR"), controller.listarMotivos);
  return router;
}
