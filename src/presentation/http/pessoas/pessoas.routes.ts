import { Router, type RequestHandler } from "express";
import type { PessoasController } from "./pessoas.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";

export function createPessoasRouter(controller: PessoasController, authentication: RequestHandler) {
  const router = Router();
  router.use(authentication);
  router.get("/", requirePermission("BENEFICIARIO_VISUALIZAR"), controller.buscar);
  router.post("/", requirePermission("BENEFICIARIO_CADASTRAR"), controller.criar);
  router.get("/:id", requirePermission("BENEFICIARIO_VISUALIZAR"), controller.obter);
  return router;
}
