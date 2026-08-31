import { Router } from "express";
import { dependencies } from "./dependencies.js";
import { createBeneficiariosRouter } from "../presentation/http/beneficiarios/beneficiarios.routes.js";
import { createAuthRouter } from "../presentation/http/auth/auth.routes.js";
import { createCapacidadeRouter } from "../presentation/http/capacidade/capacidade.routes.js";
import { createCandidaturasRouter } from "../presentation/http/candidaturas/candidaturas.routes.js";
import { createCompetenciasRouter } from "../presentation/http/competencias/competencias.routes.js";
import { createDistribuicoesRouter } from "../presentation/http/distribuicoes/distribuicoes.routes.js";
import {
  createAusenciasRouter,
  createJustificativasRouter,
  createRetiradasRouter,
} from "../presentation/http/atendimento/operacoes-atendimento.routes.js";
import {
  createDoadoresRouter,
  createEstoqueRouter,
  createLiberacoesRouter,
} from "../presentation/http/estoque/estoque.routes.js";
import { createCestasRouter } from "../presentation/http/cestas/cestas.routes.js";
import { createPlanejamentoRouter } from "../presentation/http/planejamento/planejamento.routes.js";
import { createDashboardRouter } from "../presentation/http/dashboard/dashboard.routes.js";
import { createRelatoriosRouter } from "../presentation/http/relatorios/relatorios.routes.js";
import { createAuditoriaRouter } from "../presentation/http/auditoria/auditoria.routes.js";
import { createAdminRouter } from "../presentation/http/admin/admin.routes.js";
import {
  createHistoricoBeneficiarioRouter,
  createHistoricoDistribuicaoRouter,
} from "../presentation/http/historicos/historicos.routes.js";
export function createRoutes() {
  const r = Router();
  r.use(
    "/api/v1/auth",
    createAuthRouter(dependencies.authController, dependencies.authentication),
  );
  r.use(
    "/api/v1/capacidade",
    createCapacidadeRouter(
      dependencies.capacidadeController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/beneficiarios",
    createBeneficiariosRouter(
      dependencies.beneficiariosController,
      dependencies.authentication,
      dependencies.buscaBeneficiariosController,
    ),
  );
  r.use(
    "/api/v1/candidaturas",
    createCandidaturasRouter(
      dependencies.candidaturasController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/competencias",
    createCompetenciasRouter(
      dependencies.competenciasController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/distribuicoes",
    createDistribuicoesRouter(
      dependencies.distribuicoesController,
      dependencies.authentication,
      dependencies.atendimentoController,
      dependencies.operacoesAtendimentoController,
    ),
  );
  r.use(
    "/api/v1/ausencias",
    createAusenciasRouter(
      dependencies.operacoesAtendimentoController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/justificativas",
    createJustificativasRouter(
      dependencies.operacoesAtendimentoController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/retiradas",
    createRetiradasRouter(
      dependencies.operacoesAtendimentoController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/estoque",
    createEstoqueRouter(
      dependencies.estoqueController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/doadores",
    createDoadoresRouter(
      dependencies.estoqueController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/cestas",
    createCestasRouter(
      dependencies.cestasController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/planejamentos",
    createPlanejamentoRouter(
      dependencies.planejamentoController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/distribuicoes",
    createLiberacoesRouter(
      dependencies.estoqueController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/dashboard",
    createDashboardRouter(
      dependencies.dashboardController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/relatorios",
    createRelatoriosRouter(
      dependencies.relatoriosController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/auditoria",
    createAuditoriaRouter(
      dependencies.auditoriaController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/admin",
    createAdminRouter(
      dependencies.adminController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/beneficiarios",
    createHistoricoBeneficiarioRouter(
      dependencies.historicosController,
      dependencies.authentication,
    ),
  );
  r.use(
    "/api/v1/distribuicoes",
    createHistoricoDistribuicaoRouter(
      dependencies.historicosController,
      dependencies.authentication,
    ),
  );
  return r;
}
