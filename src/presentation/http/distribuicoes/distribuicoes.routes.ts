import { Router, type RequestHandler } from "express";
import type { DistribuicoesController } from "./distribuicoes.controller.js";
import type { AtendimentoController } from "../atendimento/atendimento.controller.js";
import type { OperacoesAtendimentoController } from "../atendimento/operacoes-atendimento.controller.js";
import { requirePermission } from "../middlewares/require-permission.middleware.js";
export function createDistribuicoesRouter(
  c: DistribuicoesController,
  a: RequestHandler,
  at: AtendimentoController,
  op: OperacoesAtendimentoController,
) {
  const r = Router();
  r.use(a);
  r.get("/", requirePermission("BENEFICIARIO_VISUALIZAR"), c.listar);
  r.get("/:id", requirePermission("BENEFICIARIO_VISUALIZAR"), c.obter);
  r.post("/:id/abrir", requirePermission("DISTRIBUICAO_ABRIR"), c.abrir);
  r.post(
    "/:id/encerrar",
    requirePermission("DISTRIBUICAO_ENCERRAR"),
    c.encerrar,
  );
  r.post(
    "/:id/check-ins",
    requirePermission("DISTRIBUICAO_TRIAGEM"),
    at.registrar,
  );
  r.get("/:id/check-ins", requirePermission("DISTRIBUICAO_TRIAGEM"), at.listar);
  r.post(
    "/:id/retiradas",
    requirePermission("RETIRADA_REGISTRAR"),
    op.registrarRetirada,
  );
  r.get(
    "/:id/retiradas",
    requirePermission("RETIRADA_REGISTRAR"),
    op.listarRetiradas,
  );
  r.post(
    "/:id/remarcar",
    requirePermission("DISTRIBUICAO_REMARCAR"),
    c.remarcar,
  );
  return r;
}
