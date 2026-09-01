# Matriz de acesso às rotas

Auditoria realizada em 1º de setembro de 2026 sobre os routers efetivamente montados em `src/main/routes.ts` e `src/main/app.ts`. `JWT` significa Bearer token válido. Todas as permissões abaixo existem em `pastoral.permissoes`.

Na coluna “com token”, `permitido → handler` significa que autenticação e RBAC deixam a chamada chegar ao controller; o status final pode ser `2xx` ou um `4xx` funcional conforme parâmetros, corpo e estado do recurso. Isso evita executar mutações de negócio apenas para testar exposição. Sem a permissão indicada, o resultado validado pelo middleware é `403`; sem token, toda rota protegida retorna `401`.

| Método | Path | Controller/handler | Auth | Permissão | Pública | OpenAPI | Sem token | Com token |
|---|---|---|---|---|---|---|---|---|
| GET | `/health` | inline `createApp` | não | — | sim | sim | `200` | `200` |
| GET | `/ready` | inline `createApp` | não | — | sim | sim | `200` | `200` |
| GET | `/openapi.json` | inline `createApp` | não | — | sim | sim | `200` | `200` |
| GET | `/docs` | Swagger UI | não | — | sim | não (interface do contrato) | `301/200` | `301/200` |
| POST | `/api/v1/auth/login` | `AuthController.login` | não | — | sim | sim | handler (`200` com credencial válida) | idem |
| GET | `/api/v1/auth/me` | `AuthController.me` | JWT | — | não | sim | `401` | permitido → handler |
| GET | `/api/v1/pessoas` | `PessoasController.buscar` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/pessoas` | `PessoasController.criar` | JWT | `BENEFICIARIO_CADASTRAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/pessoas/:id` | `PessoasController.obter` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/grupos-distribuicao` | `CatalogosAssistenciaController.listarGrupos` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/motivos-desligamento` | `CatalogosAssistenciaController.listarMotivos` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/capacidade` | `CapacidadeController.get` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| PUT | `/api/v1/capacidade` | `CapacidadeController.put` | JWT | `CAPACIDADE_ALTERAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/beneficiarios` | `BuscaBeneficiariosController.buscar` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/beneficiarios` | `BeneficiariosController.admitir` | JWT | `BENEFICIARIO_ADMITIR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/beneficiarios/:id` | `BeneficiariosController.obterPorId` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/beneficiarios/:id/desligar` | `BeneficiariosController.desligar` | JWT | `BENEFICIARIO_DESLIGAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/beneficiarios/:id/reativar` | `BeneficiariosController.reativar` | JWT | `BENEFICIARIO_REATIVAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/beneficiarios/:id/alterar-grupo` | `BeneficiariosController.alterarGrupo` | JWT | `BENEFICIARIO_EDITAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/beneficiarios/:id/historico` | `HistoricosController.beneficiario` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/candidaturas` | `CandidaturasController.listar` | JWT | `CANDIDATURA_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/candidaturas` | `CandidaturasController.criar` | JWT | `CANDIDATURA_CADASTRAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/candidaturas/:id/priorizar` | `CandidaturasController.priorizar` | JWT | `CANDIDATURA_PRIORIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/candidaturas/:id/tentativas-contato` | `CandidaturasController.tentativa` | JWT | `CANDIDATURA_CADASTRAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/candidaturas/:id/nao-localizado` | `CandidaturasController.naoLocalizado` | JWT | `CANDIDATURA_CADASTRAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/candidaturas/:id/admitir` | `CandidaturasController.admitir` | JWT | `CANDIDATURA_ADMITIR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/competencias` | `CompetenciasController.listar` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/competencias/:id` | `CompetenciasController.obter` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/competencias/gerar` | `CompetenciasController.gerar` | JWT | `DISTRIBUICAO_ABRIR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/distribuicoes` | `DistribuicoesController.listar` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/distribuicoes/:id` | `DistribuicoesController.obter` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/distribuicoes/:id/abrir` | `DistribuicoesController.abrir` | JWT | `DISTRIBUICAO_ABRIR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/distribuicoes/:id/encerrar` | `DistribuicoesController.encerrar` | JWT | `DISTRIBUICAO_ENCERRAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/distribuicoes/:id/remarcar` | `DistribuicoesController.remarcar` | JWT | `DISTRIBUICAO_REMARCAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/distribuicoes/:id/check-ins` | `AtendimentoController.registrar` | JWT | `DISTRIBUICAO_TRIAGEM` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/distribuicoes/:id/check-ins` | `AtendimentoController.listar` | JWT | `DISTRIBUICAO_TRIAGEM` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/distribuicoes/:id/retiradas` | `OperacoesAtendimentoController.registrarRetirada` | JWT | `RETIRADA_REGISTRAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/distribuicoes/:id/retiradas` | `OperacoesAtendimentoController.listarRetiradas` | JWT | `RETIRADA_REGISTRAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/distribuicoes/:id/liberacoes-cestas` | `EstoqueController.liberar` | JWT | `CESTA_LIBERAR_DISTRIBUICAO` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/distribuicoes/:id/liberacoes-cestas` | `EstoqueController.listarLiberacoes` | JWT | `ESTOQUE_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/distribuicoes/:id/historico` | `HistoricosController.distribuicao` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/ausencias/:id/justificativas` | `OperacoesAtendimentoController.registrarJustificativa` | JWT | `JUSTIFICATIVA_REGISTRAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/justificativas/:id/avaliar` | `OperacoesAtendimentoController.avaliarJustificativa` | JWT | `JUSTIFICATIVA_AVALIAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/retiradas/:id` | `OperacoesAtendimentoController.obterRetirada` | JWT | `RETIRADA_REGISTRAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/retiradas/:id/estornar` | `OperacoesAtendimentoController.estornarRetirada` | JWT | dinâmica: `RETIRADA_ESTORNAR_PROPRIA` ou `RETIRADA_ESTORNAR_QUALQUER` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/estoque/categorias-prioridade` | `EstoqueController.categorias` | JWT | `ESTOQUE_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/estoque/insumos` | `EstoqueController.listar` | JWT | `ESTOQUE_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/estoque/insumos` | `EstoqueController.cadastrar` | JWT | `ESTOQUE_INSUMO_CADASTRAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/estoque/insumos/:id` | `EstoqueController.obter` | JWT | `ESTOQUE_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/estoque/entradas` | `EstoqueController.entrada` | JWT | `ESTOQUE_ENTRADA` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/estoque/perdas` | `EstoqueController.perda` | JWT | `ESTOQUE_PERDA` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/estoque/inventarios` | `EstoqueController.criarInventario` | JWT | `ESTOQUE_INVENTARIO` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/estoque/inventarios/:id` | `EstoqueController.obterInventario` | JWT | `ESTOQUE_INVENTARIO` | não | sim | `401` | permitido → handler / `403` |
| PUT | `/api/v1/estoque/inventarios/:id/itens/:apresentacaoId` | `EstoqueController.itemInventario` | JWT | `ESTOQUE_INVENTARIO` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/estoque/inventarios/:id/concluir` | `EstoqueController.concluirInventario` | JWT | `ESTOQUE_INVENTARIO` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/estoque/lotes-montagem` | `EstoqueController.montar` | JWT | `CESTA_MONTAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/estoque/lotes-montagem` | `EstoqueController.listarLotes` | JWT | `ESTOQUE_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/estoque/lotes-montagem/:id` | `EstoqueController.obterLote` | JWT | `ESTOQUE_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/estoque/lotes-montagem/:id/desmontar` | `EstoqueController.desmontar` | JWT | `CESTA_DESMONTAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/estoque/lotes-montagem/:id/ajustes` | `EstoqueController.ajustar` | JWT | `CESTA_AJUSTAR_LOTE` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/doadores` | `EstoqueController.listarDoadores` | JWT | `ESTOQUE_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/doadores` | `EstoqueController.criarDoador` | JWT | `ESTOQUE_ENTRADA` | não | sim | `401` | permitido → handler / `403` |
| PUT | `/api/v1/doadores/:id` | `EstoqueController.atualizarDoador` | JWT | `ESTOQUE_ENTRADA` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/cestas/modelos` | `CestasController.listar` | JWT | `CESTA_MODELO_GERENCIAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/cestas/modelos` | `CestasController.criar` | JWT | `CESTA_MODELO_GERENCIAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/cestas/modelos/:id` | `CestasController.obter` | JWT | `CESTA_MODELO_GERENCIAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/cestas/modelos/:id/versoes` | `CestasController.versao` | JWT | `CESTA_MODELO_GERENCIAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/planejamentos/simular` | `PlanejamentoController.simular` | JWT | `ESTOQUE_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/planejamentos` | `PlanejamentoController.criar` | JWT | `CESTA_PLANEJAMENTO_APROVAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/planejamentos` | `PlanejamentoController.listar` | JWT | `ESTOQUE_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/planejamentos/:id` | `PlanejamentoController.obter` | JWT | `ESTOQUE_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/planejamentos/:id/aprovar` | `PlanejamentoController.aprovar` | JWT | `CESTA_PLANEJAMENTO_APROVAR` | não | sim | `401` | permitido → handler / `403` |
| POST | `/api/v1/planejamentos/:id/revisoes` | `PlanejamentoController.revisar` | JWT | `CESTA_PLANEJAMENTO_APROVAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/dashboard` | `DashboardController.obter` | JWT | `BENEFICIARIO_VISUALIZAR` **e** `ESTOQUE_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/relatorios/distribuicoes` | `RelatoriosController.distribuicoes` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/relatorios/beneficiarios` | `RelatoriosController.beneficiarios` | JWT | `BENEFICIARIO_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/relatorios/estoque` | `RelatoriosController.estoque` | JWT | `ESTOQUE_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/auditoria` | `AuditoriaController.listar` | JWT | `AUDITORIA_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/auditoria/:id` | `AuditoriaController.obter` | JWT | `AUDITORIA_VISUALIZAR` | não | sim | `401` | permitido → handler / `403` |
| GET | `/api/v1/admin/status` | `AdminController.status` | JWT | `PERFIL_GERENCIAR` | não | sim | `401` | permitido → handler / `403` |

## Perfis de desenvolvimento observados

| Usuário | Ativo | Perfil | Acesso representativo permitido | Acesso representativo negado |
|---|---:|---|---|---|
| `admin` | sim | Administrador | todos os endpoints acima | nenhum endpoint funcional por RBAC |
| `atendimento` | sim | Atendimento | `/api/v1/beneficiarios`, check-in e retiradas | `/api/v1/estoque/insumos` |
| `estoque` | sim | Estoque | `/api/v1/estoque/insumos` e cestas | `/api/v1/beneficiarios` |
| `responsavel` | sim | Responsável | beneficiários, candidaturas e atendimento | `/api/v1/estoque/insumos` |

As senhas desses usuários não estão versionadas nem expostas pelo ambiente. Por isso, o login válido de cada conta requer as credenciais de desenvolvimento mantidas fora do repositório; nenhum hash foi alterado durante esta auditoria.
