import { Router, type RequestHandler } from "express";
import type { CestasAdicionaisController } from "./cestas-adicionais.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";

export function createCestasAdicionaisRouter(controller: CestasAdicionaisController, authenticate: RequestHandler) {
  const router = Router();
  router.use(authenticate);
  router.post("/:id/entregar", requirePermission("RETIRADA_REGISTRAR"), controller.entregar);
  return router;
}
