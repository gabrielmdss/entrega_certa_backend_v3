import { databaseConfig, env } from "./config.js";
import { logger } from "../infrastructure/logging/logger.js";
import {
  createPostgresPool,
  observePostgresQueries,
} from "../infrastructure/database/postgres/connection/postgres.connection.js";
import { JwtTokenService } from "../infrastructure/auth/jwt-token-service.js";
import { BcryptPasswordHasher } from "../infrastructure/auth/bcrypt-password-hasher.js";
import { PostgresAuthQuery } from "../infrastructure/database/postgres/auth/postgres-auth-query.js";
import { LoginUseCase } from "../application/auth/use-cases/login.use-case.js";
import { GetCurrentUserUseCase } from "../application/auth/use-cases/get-current-user.use-case.js";
import { AlterarSenhaUseCase } from "../application/auth/use-cases/alterar-senha.use-case.js";
import { AuthController } from "../presentation/http/auth/auth.controller.js";
import { authenticate } from "../presentation/http/middlewares/authentication.middleware.js";
import { PostgresBeneficiarioQuery } from "../infrastructure/database/postgres/beneficiarios/postgres-beneficiario-query.js";
import { PostgresPessoa } from "../infrastructure/database/postgres/pessoas/postgres-pessoa.js";
import { BuscarPessoasUseCase, CriarPessoaUseCase, ObterFotoPessoaUseCase, ObterPessoaUseCase, UploadFotoPessoaUseCase } from "../application/pessoas/use-cases/pessoas.use-cases.js";
import { PessoasController } from "../presentation/http/pessoas/pessoas.controller.js";
import { createUploadFotoMiddleware } from "../presentation/http/middlewares/upload-foto.middleware.js";
import { PostgresCatalogosAssistencia } from "../infrastructure/database/postgres/beneficiarios/postgres-catalogos-assistencia.js";
import { ListarGruposDistribuicaoUseCase, ListarMotivosDesligamentoUseCase } from "../application/beneficiarios/use-cases/listar-catalogos-assistencia.use-cases.js";
import { CatalogosAssistenciaController } from "../presentation/http/beneficiarios/catalogos-assistencia.controller.js";
import { PostgresBeneficiarioCommand } from "../infrastructure/database/postgres/beneficiarios/postgres-beneficiario-command.js";
import { ObterBeneficiarioUseCase } from "../application/beneficiarios/use-cases/obter-beneficiario.use-case.js";
import { AdmitirBeneficiarioUseCase } from "../application/beneficiarios/use-cases/admitir-beneficiario.use-case.js";
import { DesligarBeneficiarioUseCase } from "../application/beneficiarios/use-cases/desligar-beneficiario.use-case.js";
import { ReativarBeneficiarioUseCase } from "../application/beneficiarios/use-cases/reativar-beneficiario.use-case.js";
import { AlterarGrupoBeneficiarioUseCase } from "../application/beneficiarios/use-cases/alterar-grupo-beneficiario.use-case.js";
import { BeneficiariosController } from "../presentation/http/beneficiarios/beneficiarios.controller.js";
import { PostgresCapacidade } from "../infrastructure/database/postgres/capacidade/postgres-capacidade.js";
import { ObterCapacidadeUseCase } from "../application/capacidade/use-cases/obter-capacidade.use-case.js";
import { AlterarCapacidadeUseCase } from "../application/capacidade/use-cases/alterar-capacidade.use-case.js";
import { CapacidadeController } from "../presentation/http/capacidade/capacidade.controller.js";
import { PostgresCandidatura } from "../infrastructure/database/postgres/candidaturas/postgres-candidatura.js";
import {
  AdmitirCandidatoUseCase,
  CriarCandidaturaUseCase,
  ListarCandidaturasUseCase,
  MarcarCandidatoNaoLocalizadoUseCase,
  PriorizarCandidaturaUseCase,
  RegistrarTentativaContatoUseCase,
} from "../application/candidaturas/use-cases/candidaturas.use-cases.js";
import { CandidaturasController } from "../presentation/http/candidaturas/candidaturas.controller.js";
import { PostgresCompetencia } from "../infrastructure/database/postgres/competencias/postgres-competencia.js";
import {
  GerarCompetenciaUseCase,
  ListarCompetenciasUseCase,
  ObterCompetenciaUseCase,
} from "../application/competencias/use-cases/competencias.use-cases.js";
import { CompetenciasController } from "../presentation/http/competencias/competencias.controller.js";
import { PostgresDistribuicao } from "../infrastructure/database/postgres/distribuicoes/postgres-distribuicao.js";
import {
  ListarDistribuicoesUseCase,
  ObterDistribuicaoUseCase,
  RemarcarDistribuicaoUseCase,
} from "../application/distribuicoes/use-cases/distribuicoes.use-cases.js";
import { DistribuicoesController } from "../presentation/http/distribuicoes/distribuicoes.controller.js";
import { PostgresDistribuicaoCommand } from "../infrastructure/database/postgres/distribuicoes/postgres-distribuicao-command.js";
import { AbrirDistribuicaoUseCase } from "../application/distribuicoes/use-cases/abrir-distribuicao.use-case.js";
import { EncerrarDistribuicaoUseCase } from "../application/distribuicoes/use-cases/encerrar-distribuicao.use-case.js";
import { PostgresAtendimento } from "../infrastructure/database/postgres/atendimento/postgres-atendimento.js";
import {
  BuscarBeneficiariosParaAtendimentoUseCase,
  ListarCheckInsUseCase,
  RegistrarCheckInUseCase,
} from "../application/atendimento/use-cases/atendimento.use-cases.js";
import { AtendimentoController } from "../presentation/http/atendimento/atendimento.controller.js";
import { BuscaBeneficiariosController } from "../presentation/http/atendimento/busca-beneficiarios.controller.js";
import { PostgresJustificativaCommand } from "../infrastructure/database/postgres/atendimento/postgres-justificativa-command.js";
import { PostgresRetirada } from "../infrastructure/database/postgres/atendimento/postgres-retirada.js";
import {
  AvaliarJustificativaUseCase,
  RegistrarJustificativaUseCase,
} from "../application/atendimento/use-cases/justificativa.use-cases.js";
import {
  EstornarRetiradaUseCase,
  ListarRetiradasUseCase,
  ObterRetiradaUseCase,
  RegistrarRetiradaUseCase,
} from "../application/atendimento/use-cases/retirada.use-cases.js";
import { OperacoesAtendimentoController } from "../presentation/http/atendimento/operacoes-atendimento.controller.js";
import { PostgresCestaAdicional } from "../infrastructure/database/postgres/atendimento/postgres-cesta-adicional.js";
import { AutorizarCestaAdicionalUseCase, EntregarCestaAdicionalUseCase, ListarCestasAdicionaisUseCase } from "../application/atendimento/use-cases/cesta-adicional.use-cases.js";
import { CestasAdicionaisController } from "../presentation/http/atendimento/cestas-adicionais.controller.js";
import { PostgresEstoque } from "../infrastructure/database/postgres/estoque/postgres-estoque.js";
import * as EU from "../application/estoque/use-cases/estoque.use-cases.js";
import { EstoqueController } from "../presentation/http/estoque/estoque.controller.js";
import { PostgresCestas } from "../infrastructure/database/postgres/cestas/postgres-cestas.js";
import * as CU from "../application/cestas/use-cases/cestas.use-cases.js";
import { CestasController } from "../presentation/http/cestas/cestas.controller.js";
import { PostgresPlanejamento } from "../infrastructure/database/postgres/planejamento/postgres-planejamento.js";
import * as PU from "../application/planejamento/use-cases/planejamento.use-cases.js";
import { PlanejamentoController } from "../presentation/http/planejamento/planejamento.controller.js";
import { PostgresDashboardQuery } from "../infrastructure/database/postgres/dashboard/postgres-dashboard-query.js";
import { ObterDashboardUseCase } from "../application/dashboard/use-cases/obter-dashboard.use-case.js";
import { DashboardController } from "../presentation/http/dashboard/dashboard.controller.js";
import { PostgresRelatoriosQuery } from "../infrastructure/database/postgres/relatorios/postgres-relatorios-query.js";
import * as RU from "../application/relatorios/use-cases/relatorios.use-cases.js";
import { RelatoriosController } from "../presentation/http/relatorios/relatorios.controller.js";
import { PostgresAuditoriaQuery } from "../infrastructure/database/postgres/auditoria/postgres-auditoria-query.js";
import * as AU from "../application/auditoria/use-cases/auditoria.use-cases.js";
import { AuditoriaController } from "../presentation/http/auditoria/auditoria.controller.js";
import { PostgresAdminStatus } from "../infrastructure/observability/postgres-admin-status.js";
import { ObterStatusAdministrativoUseCase } from "../application/admin/use-cases/obter-status-administrativo.use-case.js";
import { AdminController } from "../presentation/http/admin/admin.controller.js";
import { PostgresUsuarios } from "../infrastructure/database/postgres/admin/postgres-usuarios.js";
import { ListarPerfisUseCase } from "../application/admin/use-cases/listar-perfis.use-case.js";
import { CriarUsuarioUseCase } from "../application/admin/use-cases/criar-usuario.use-case.js";
import { PostgresHistoricosQuery } from "../infrastructure/database/postgres/historicos/postgres-historicos-query.js";
import * as HU from "../application/historicos/use-cases/historicos.use-cases.js";
import { HistoricosController } from "../presentation/http/historicos/historicos.controller.js";
const postgresPool = createPostgresPool(databaseConfig);
observePostgresQueries(postgresPool, logger, env.DB_SLOW_QUERY_MS);
postgresPool.on("error", (e) =>
  logger.error({ error: e }, "Erro inesperado no pool PostgreSQL"),
);
const tokenService = new JwtTokenService(
  env.JWT_SECRET,
  env.JWT_EXPIRES_IN as never,
);
const passwordHasher = new BcryptPasswordHasher();
const authQuery = new PostgresAuthQuery(postgresPool);
const authController = new AuthController(
  new LoginUseCase(authQuery, passwordHasher, tokenService),
  new GetCurrentUserUseCase(authQuery),
  new AlterarSenhaUseCase(authQuery, passwordHasher),
);
const authentication = authenticate(tokenService, authQuery);
const beneficiaryQuery = new PostgresBeneficiarioQuery(postgresPool);
const beneficiaryCommand = new PostgresBeneficiarioCommand(postgresPool);
const beneficiariosController = new BeneficiariosController(
  new ObterBeneficiarioUseCase(beneficiaryQuery),
  new AdmitirBeneficiarioUseCase(beneficiaryCommand),
  new DesligarBeneficiarioUseCase(beneficiaryCommand),
  new ReativarBeneficiarioUseCase(beneficiaryCommand),
  new AlterarGrupoBeneficiarioUseCase(beneficiaryCommand),
);
const pessoaPort = new PostgresPessoa(postgresPool);
const pessoasController = new PessoasController(
  new BuscarPessoasUseCase(pessoaPort),
  new CriarPessoaUseCase(pessoaPort),
  new ObterPessoaUseCase(pessoaPort),
  new UploadFotoPessoaUseCase(pessoaPort),
  new ObterFotoPessoaUseCase(pessoaPort),
  env.FILES_STORAGE_PATH,
);
const uploadFotoMiddleware = createUploadFotoMiddleware(env.FILES_STORAGE_PATH);
const catalogosPort = new PostgresCatalogosAssistencia(postgresPool);
const catalogosAssistenciaController = new CatalogosAssistenciaController(new ListarGruposDistribuicaoUseCase(catalogosPort), new ListarMotivosDesligamentoUseCase(catalogosPort));
const capacityPort = new PostgresCapacidade(postgresPool);
const capacidadeController = new CapacidadeController(
  new ObterCapacidadeUseCase(capacityPort),
  new AlterarCapacidadeUseCase(capacityPort),
);
const candidaturaPort = new PostgresCandidatura(postgresPool);
const candidaturasController = new CandidaturasController(
  new ListarCandidaturasUseCase(candidaturaPort),
  new CriarCandidaturaUseCase(candidaturaPort),
  new PriorizarCandidaturaUseCase(candidaturaPort),
  new RegistrarTentativaContatoUseCase(candidaturaPort),
  new MarcarCandidatoNaoLocalizadoUseCase(candidaturaPort),
  new AdmitirCandidatoUseCase(candidaturaPort),
);
const competenciaPort = new PostgresCompetencia(postgresPool);
const competenciasController = new CompetenciasController(
  new ListarCompetenciasUseCase(competenciaPort),
  new ObterCompetenciaUseCase(competenciaPort),
  new GerarCompetenciaUseCase(competenciaPort),
);
const distribuicaoPort = new PostgresDistribuicao(postgresPool);
const distribuicaoCommand = new PostgresDistribuicaoCommand(postgresPool);
const atendimentoPort = new PostgresAtendimento(postgresPool);
const atendimentoController = new AtendimentoController(
  new RegistrarCheckInUseCase(atendimentoPort),
  new ListarCheckInsUseCase(atendimentoPort),
);
const buscaBeneficiariosController = new BuscaBeneficiariosController(
  new BuscarBeneficiariosParaAtendimentoUseCase(atendimentoPort),
);
const distribuicoesController = new DistribuicoesController(
  new ListarDistribuicoesUseCase(distribuicaoPort),
  new ObterDistribuicaoUseCase(distribuicaoPort),
  new RemarcarDistribuicaoUseCase(distribuicaoPort),
  new AbrirDistribuicaoUseCase(distribuicaoCommand),
  new EncerrarDistribuicaoUseCase(distribuicaoCommand),
);
const justificativaCommand = new PostgresJustificativaCommand(postgresPool);
const retiradaPort = new PostgresRetirada(postgresPool);
const operacoesAtendimentoController = new OperacoesAtendimentoController(
  new RegistrarJustificativaUseCase(justificativaCommand),
  new AvaliarJustificativaUseCase(justificativaCommand),
  new RegistrarRetiradaUseCase(retiradaPort),
  new ListarRetiradasUseCase(retiradaPort),
  new ObterRetiradaUseCase(retiradaPort),
  new EstornarRetiradaUseCase(retiradaPort),
);
const cestaAdicionalPort = new PostgresCestaAdicional(postgresPool);
const cestasAdicionaisController = new CestasAdicionaisController(
  new AutorizarCestaAdicionalUseCase(cestaAdicionalPort),
  new EntregarCestaAdicionalUseCase(cestaAdicionalPort),
  new ListarCestasAdicionaisUseCase(cestaAdicionalPort),
);
const estoquePort = new PostgresEstoque(postgresPool);
const estoqueController = new EstoqueController({
  categorias: new EU.ListarCategoriasPrioridadeUseCase(estoquePort),
  listar: new EU.ListarInsumosUseCase(estoquePort),
  obter: new EU.ObterInsumoUseCase(estoquePort),
  cadastrar: new EU.CadastrarInsumoUseCase(estoquePort),
  listarDoadores: new EU.ListarDoadoresUseCase(estoquePort),
  criarDoador: new EU.CriarDoadorUseCase(estoquePort),
  atualizarDoador: new EU.AtualizarDoadorUseCase(estoquePort),
  entrada: new EU.RegistrarEntradaEstoqueUseCase(estoquePort),
  perda: new EU.RegistrarPerdaEstoqueUseCase(estoquePort),
  criarInventario: new EU.CriarInventarioUseCase(estoquePort),
  obterInventario: new EU.ObterInventarioUseCase(estoquePort),
  itemInventario: new EU.InformarItemInventarioUseCase(estoquePort),
  concluirInventario: new EU.ConcluirInventarioUseCase(estoquePort),
  montar: new EU.MontarCestasUseCase(estoquePort),
  listarLotes: new EU.ListarLotesMontagemUseCase(estoquePort),
  obterLote: new EU.ObterLoteMontagemUseCase(estoquePort),
  desmontar: new EU.DesmontarCestasUseCase(estoquePort),
  ajustar: new EU.AjustarLoteMontagemUseCase(estoquePort),
  liberar: new EU.LiberarCestasDistribuicaoUseCase(estoquePort),
  listarLiberacoes: new EU.ListarLiberacoesCestasUseCase(estoquePort),
});
const cestasPort = new PostgresCestas(postgresPool);
const cestasController = new CestasController(
  new CU.ListarModelosCestaUseCase(cestasPort),
  new CU.ObterModeloCestaUseCase(cestasPort),
  new CU.CriarModeloCestaUseCase(cestasPort),
  new CU.CriarVersaoModeloCestaUseCase(cestasPort),
);
const planejamentoPort = new PostgresPlanejamento(postgresPool);
const planejamentoController = new PlanejamentoController(
  new PU.SimularPlanejamentoUseCase(planejamentoPort),
  new PU.CriarPlanejamentoUseCase(planejamentoPort),
  new PU.ListarPlanejamentosUseCase(planejamentoPort),
  new PU.ObterPlanejamentoUseCase(planejamentoPort),
  new PU.AprovarPlanejamentoUseCase(planejamentoPort),
  new PU.RevisarPlanejamentoUseCase(planejamentoPort),
);
const dashboardQuery = new PostgresDashboardQuery(postgresPool);
const dashboardController = new DashboardController(
  new ObterDashboardUseCase(dashboardQuery),
);
const relatoriosQuery = new PostgresRelatoriosQuery(postgresPool);
const relatoriosController = new RelatoriosController(
  new RU.ListarRelatorioDistribuicoesUseCase(relatoriosQuery),
  new RU.ListarRelatorioBeneficiariosUseCase(relatoriosQuery),
  new RU.ListarRelatorioEstoqueUseCase(relatoriosQuery),
);
const auditoriaQuery = new PostgresAuditoriaQuery(postgresPool);
const auditoriaController = new AuditoriaController(
  new AU.ListarAuditoriaUseCase(auditoriaQuery),
  new AU.ObterAuditoriaUseCase(auditoriaQuery),
);
const usuariosPort = new PostgresUsuarios(postgresPool);
const adminController = new AdminController(
  new ObterStatusAdministrativoUseCase(new PostgresAdminStatus(postgresPool)),
  new ListarPerfisUseCase(usuariosPort),
  new CriarUsuarioUseCase(usuariosPort, passwordHasher),
);
const historicosQuery = new PostgresHistoricosQuery(postgresPool);
const historicosController = new HistoricosController(
  new HU.ObterHistoricoBeneficiarioUseCase(historicosQuery),
  new HU.ObterHistoricoDistribuicaoUseCase(historicosQuery),
);
export const dependencies = {
  postgresPool,
  logger,
  tokenService,
  passwordHasher,
  authQuery,
  authController,
  authentication,
  beneficiariosController,
  pessoasController,
  uploadFotoMiddleware,
  catalogosAssistenciaController,
  capacidadeController,
  candidaturasController,
  competenciasController,
  distribuicoesController,
  atendimentoController,
  buscaBeneficiariosController,
  operacoesAtendimentoController,
  cestasAdicionaisController,
  estoqueController,
  cestasController,
  planejamentoController,
  dashboardController,
  relatoriosController,
  auditoriaController,
  adminController,
  historicosController,
};
