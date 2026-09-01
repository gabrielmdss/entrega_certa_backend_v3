# API inicial

## Seleção sem IDs técnicos

- `GET /api/v1/pessoas?q=...` busca nome parcial com a normalização do banco.
- `GET /api/v1/pessoas?documento=...` busca pelo documento normalizado; a resposta sempre mascara o número.
- `POST /api/v1/pessoas` cadastra pessoa e documentos, sem admitir beneficiário automaticamente.
- `GET /api/v1/pessoas/:id` retorna o detalhe seguro da pessoa.
- `GET /api/v1/grupos-distribuicao` e `GET /api/v1/motivos-desligamento` retornam somente registros ativos.

As leituras usam `BENEFICIARIO_VISUALIZAR`; o cadastro de pessoa usa a permissão existente `BENEFICIARIO_CADASTRAR`. `resultado` de tentativa de contato permanece texto livre: o schema não possui `CHECK` e os dados não confirmam um conjunto estável.

O detalhe de beneficiário agrega pessoa, documentos mascarados, endereço, grupo, retirada, direitos, pendências e histórico sem expor `observacao_restrita`. A consulta foi validada com `EXPLAIN (ANALYZE, BUFFERS)` no banco de desenvolvimento: 0,665 ms no conjunto atual, sem leitura física de blocos.

## Auditoria, administração e históricos

- `GET /api/v1/auditoria` — `AUDITORIA_VISUALIZAR`; filtros por usuário, entidade, entidadeId, operação e intervalo de datas, com paginação máxima de 100.
- `GET /api/v1/auditoria/:id` — detalhe com snapshots recursivamente sanitizados.
- `GET /api/v1/admin/status` — `PERFIL_GERENCIAR`; pool, uptime e memória sem configuração sensível.
- `GET /api/v1/beneficiarios/:id/historico` — histórico assistencial, com `BENEFICIARIO_VISUALIZAR`.
- `GET /api/v1/distribuicoes/:id/historico` — histórico operacional, com `BENEFICIARIO_VISUALIZAR`.

## Dashboard e relatórios

- `GET /api/v1/dashboard` — exige simultaneamente `BENEFICIARIO_VISUALIZAR` e `ESTOQUE_VISUALIZAR`.
- `GET /api/v1/relatorios/distribuicoes` — filtros `dataInicio`, `dataFim`, `competencia`, `grupoId`, `status`.
- `GET /api/v1/relatorios/beneficiarios` — filtros `status`, `grupoId`, `dataAdmissaoInicio`, `dataAdmissaoFim`; não expõe observação restrita.
- `GET /api/v1/relatorios/estoque` — filtros `insumo`, `tipoMovimento`, `dataInicio`, `dataFim`.

Os relatórios aceitam `page` e `limit`, com padrão `1/50` e limite máximo `100`, e retornam `data` e `meta` (`page`, `limit`, `total`, `totalPages`). Distribuições e beneficiários exigem `BENEFICIARIO_VISUALIZAR`; estoque exige `ESTOQUE_VISUALIZAR`.

## Encerramento de distribuição

- `POST /api/v1/distribuicoes/:id/encerrar` exige `DISTRIBUICAO_ENCERRAR`.
- Encerra uma distribuição aberta, classifica os direitos restantes e devolve remanescentes aos lotes.
- O detalhe inclui retiradas, ausentes, não atendidos por estoque/irregularidade e totais de cestas liberadas, consumidas, retornadas e disponíveis.
- Após o encerramento, check-in, retirada, liberação e remarcação são rejeitados; justificativas continuam permitidas.

Base funcional: `/api/v1`.

- `GET /health` — `200 { "status": "ok" }`.
- `GET /ready` — `200` quando PostgreSQL responde; `503` sem detalhes internos quando indisponível.
- `GET /api/v1/beneficiarios/:id` — `200` com IDs em string; `400` para ID inválido; `404` quando ausente.
- `GET /openapi.json` e `GET /docs` — contrato OpenAPI e interface Swagger.

## Auth e RBAC

- `POST /api/v1/auth/login` — público; retorna JWT, usuário, perfis e permissões.
- `GET /api/v1/auth/me` — estado atual carregado do banco.
- `GET /api/v1/capacidade` — autenticado.
- `PUT /api/v1/capacidade` — `CAPACIDADE_ALTERAR`.
- `POST /api/v1/beneficiarios` — `BENEFICIARIO_ADMITIR`; exceção de capacidade também exige `CAPACIDADE_ALTERAR` e justificativa.
- `POST /api/v1/beneficiarios/:id/desligar` — `BENEFICIARIO_DESLIGAR`.
- `POST /api/v1/beneficiarios/:id/reativar` — `BENEFICIARIO_REATIVAR`.
- `POST /api/v1/beneficiarios/:id/alterar-grupo` — `BENEFICIARIO_EDITAR`.

Reduzir capacidade não desliga beneficiários; a resposta informa `excedente`. Mudança de grupo só remapeia direito disponível da competência aberta quando `vigenciaCompetenciaAtual=true`; direito já retirado permanece histórico.

## Candidaturas, competências e distribuições

- `GET|POST /api/v1/candidaturas`
- `POST /api/v1/candidaturas/:id/priorizar`
- `POST /api/v1/candidaturas/:id/tentativas-contato`
- `POST /api/v1/candidaturas/:id/nao-localizado`
- `POST /api/v1/candidaturas/:id/admitir`
- `GET /api/v1/competencias` e `GET /api/v1/competencias/:id`
- `POST /api/v1/competencias/gerar`
- `GET /api/v1/distribuicoes` e `GET /api/v1/distribuicoes/:id`
- `POST /api/v1/distribuicoes/:id/remarcar`

A fila ordena prioridade excepcional, entrada e ID. A geração usa `pastoral.gerar_competencia`, é idempotente e cria distribuições/direitos protegidos pelas constraints reais.

## Triagem

- `GET /api/v1/beneficiarios?nome=&documento=&status=&grupoId=` — busca operacional com documentos mascarados.
- `POST /api/v1/distribuicoes/:id/abrir` — exige `DISTRIBUICAO_ABRIR`; segunda abertura retorna conflito.
- `POST /api/v1/distribuicoes/:id/check-ins` — exige `DISTRIBUICAO_TRIAGEM` e calcula a classificação.
- `GET /api/v1/distribuicoes/:id/check-ins?classificacao=REGULAR|PENDENTE` — filas ordenadas por chegada e ID.

## Justificativas e retiradas

- `POST /api/v1/ausencias/:id/justificativas` — registra justificativa pendente; requer `JUSTIFICATIVA_REGISTRAR`.
- `POST /api/v1/justificativas/:id/avaliar` — aceita ou rejeita; requer `JUSTIFICATIVA_AVALIAR`.
- `POST /api/v1/distribuicoes/:id/retiradas` — resolve o direito no backend; requer `RETIRADA_REGISTRAR`.
- `GET /api/v1/distribuicoes/:id/retiradas` — filtros `beneficiarioId`, `tipo` e `status`.
- `GET /api/v1/retiradas/:id` — retorna beneficiário, operador, horário, status e representante mascarado.
- `POST /api/v1/retiradas/:id/estornar` — exige motivo e decide dinamicamente a permissão necessária.

Tipos reais: `TITULAR`, `REPRESENTANTE`, `PRIMEIRA_ENTREGA`, `ANTECIPADA` e `CONTINGENCIA`. A antecipação exige justificativa e, enquanto não existe permissão específica, usa `RETIRADA_ESTORNAR_QUALQUER` como indicador temporário de autoridade superior.

## Estoque, cestas e planejamento

- Insumos: `GET /api/v1/estoque/categorias-prioridade`, `GET/POST /api/v1/estoque/insumos` e `GET /api/v1/estoque/insumos/:id`.
- Doadores: `GET/POST /api/v1/doadores` e `PUT /api/v1/doadores/:id`.
- Movimentos: `POST /api/v1/estoque/entradas` e `POST /api/v1/estoque/perdas`.
- Inventário: `POST /api/v1/estoque/inventarios`, consulta, atualização de item e conclusão.
- Modelos imutáveis: `GET/POST /api/v1/cestas/modelos`, detalhe e `POST /:id/versoes`.
- Planejamento: simulação, criação, listagem, detalhe, aprovação e revisões em `/api/v1/planejamentos`.
- Montagem: `GET/POST /api/v1/estoque/lotes-montagem`, detalhe, desmontagem e ajustes.
- Liberação: `GET/POST /api/v1/distribuicoes/:id/liberacoes-cestas`.

A retirada agora exige cesta liberada e registra entrega física. O atendente continua sem escolher lote: o banco consome por `liberado_em`, `id`.

Erros seguem `{ "error": { "code": "...", "message": "..." } }`. Falhas internas não expõem SQL, credenciais ou stack trace.
