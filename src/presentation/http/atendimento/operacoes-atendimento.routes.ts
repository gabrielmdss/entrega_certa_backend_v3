import { Router, type RequestHandler } from "express";
import type { OperacoesAtendimentoController } from "./operacoes-atendimento.controller.js";
import {
  requireAnyPermission,
  requirePermission,
} from "../middlewares/require-permission.middleware.js";
export function createAusenciasRouter(
  c: OperacoesAtendimentoController,
  a: RequestHandler,
) {
  const r = Router();
  r.use(a);
  r.post(
    "/:id/justificativas",
    requirePermission("JUSTIFICATIVA_REGISTRAR"),
    c.registrarJustificativa,
  );
  return r;
}
export function createJustificativasRouter(
  c: OperacoesAtendimentoController,
  a: RequestHandler,
) {
  const r = Router();
  r.use(a);
  r.post(
    "/:id/avaliar",
    requirePermission("JUSTIFICATIVA_AVALIAR"),
    c.avaliarJustificativa,
  );
  return r;
}
export function createRetiradasRouter(
  c: OperacoesAtendimentoController,
  a: RequestHandler,
) {
  const r = Router();
  r.use(a);
  r.get("/:id", requirePermission("RETIRADA_REGISTRAR"), c.obterRetirada);
  r.post(
    "/:id/estornar",
    requireAnyPermission(
      "RETIRADA_ESTORNAR_PROPRIA",
      "RETIRADA_ESTORNAR_QUALQUER",
    ),
    c.estornarRetirada,
  );
  return r;
}
