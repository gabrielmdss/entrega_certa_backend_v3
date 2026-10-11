# Pastoral API

## Operação

Além de `/health` e `/ready`, administradores autorizados podem consultar `/api/v1/admin/status`. Auditoria e históricos estão disponíveis em `/api/v1/auditoria`, `/api/v1/beneficiarios/:id/historico` e `/api/v1/distribuicoes/:id/historico`. Consulte `docs/observability.md` para correlação, níveis de log, timeouts e proteção de dados.

API Node.js/TypeScript para a pastoral de distribuição de cestas. A aplicação usa Express e `pg` diretamente sobre o schema PostgreSQL existente `pastoral`, seguindo Clean Architecture por camadas no topo.

## Configuração

Requisitos: Node.js LTS e acesso ao PostgreSQL existente.

1. Instale com `npm install`.
2. Copie `.env.example` para `.env` e informe as credenciais reais. Nunca versione `.env`.
3. Valide com `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`.

O startup falha imediatamente quando uma variável obrigatória é inválida. Nenhuma migration ou seed é executada automaticamente.

## Execução

- Desenvolvimento: `npm run dev`
- Build: `npm run build`
- Build compilado: `npm start`
- Testes: `npm test`
- Testes de integração: `npm run test:integration`
- Atualizar mapeamento somente leitura: `npm run database:inspect`

Após iniciar, consulte:

- `GET /health`: saúde do processo.
- `GET /ready`: conectividade real com PostgreSQL.
- `GET /api/v1/beneficiarios/:id`: consulta real de beneficiário.
- `GET /docs` e `GET /openapi.json`: documentação HTTP.

## Autenticação e RBAC

Use `POST /api/v1/auth/login` e envie o token como `Authorization: Bearer <token>`. O JWT contém somente o ID; `/auth/me` e cada rota protegida recarregam perfis e permissões atuais do banco. Também estão disponíveis `GET|PUT /api/v1/capacidade` e os comandos de admissão, desligamento, reativação e alteração de grupo descritos no OpenAPI.

Os módulos seguintes incluem fila de candidaturas, geração idempotente de competências/direitos e consultas/remarcação de distribuições. Consulte `/docs` para o contrato atualizado.

IDs `bigint` são expostos como strings para evitar perda de precisão. Veja `docs/` para arquitetura, banco e testes.
