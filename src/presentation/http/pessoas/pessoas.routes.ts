import { Router, type RequestHandler } from "express";
import type { PessoasController } from "./pessoas.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";

export function createPessoasRouter(
  controller: PessoasController,
  authentication: RequestHandler,
  uploadFoto: RequestHandler,
) {
  const router = Router();
  router.use(authentication);
  router.get("/", requirePermission("BENEFICIARIO_VISUALIZAR"), controller.buscar);
  router.post("/", requirePermission("BENEFICIARIO_CADASTRAR"), controller.criar);
  router.get("/:id", requirePermission("BENEFICIARIO_VISUALIZAR"), controller.obter);
  router.post("/:id/foto", requirePermission("BENEFICIARIO_EDITAR"), uploadFoto, controller.enviarFoto);
  router.get("/:id/foto", requirePermission("BENEFICIARIO_VISUALIZAR"), controller.obterFotoArquivo);
  return router;
}
