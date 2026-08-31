# Arquitetura

Auditoria, administração e históricos são read models em application com ports próprios. PostgreSQL e métricas de processo permanecem em infrastructure; controllers apenas validam e adaptam HTTP. Histórico assistencial combina tabelas de negócio e não usa auditoria técnica como fonte única.

Dashboard e relatórios seguem CQRS de leitura pragmático em `application/dashboard`, `application/relatorios`, adapters em `infrastructure/database/postgres` e adaptação HTTP em `presentation/http`. Não existem entidades artificiais de dashboard no domínio. Os casos de uso dependem apenas de query ports; composição e PostgreSQL permanecem fora de application.

A API aplica Clean Architecture de forma pragmática. As camadas ficam no topo e os contextos de negócio dentro delas:

```text
domain <- application <- presentation
   ^           ^
   |           |
infrastructure

main -> composition root de todas as camadas
```

- `domain`: entidades e interfaces de persistência sem Express, PostgreSQL ou JWT.
- `application`: casos de uso, DTOs e ports; conhece apenas o domínio e abstrações internas.
- `infrastructure`: implementa PostgreSQL, JWT, bcrypt, storage e logging.
- `presentation`: adapta HTTP, valida com Zod e traduz respostas/erros.
- `main`: valida configuração, cria dependências, registra rotas e controla o processo.
- Os contextos `estoque`, `cestas` e `planejamento` seguem o mesmo eixo por camada: ports/use cases em application, SQL em infrastructure, adaptação HTTP em presentation e wiring em main.

O slice atual segue `route -> controller -> ObterBeneficiarioUseCase -> BeneficiarioRepository -> PostgresBeneficiarioRepository -> pastoral.beneficiarios`.

O pool é único e criado no composition root. SQL externo é parametrizado e qualificado com `pastoral`. IDs `bigint` permanecem strings. `date` civil não é convertido em instante; `timestamptz` é tratado como instante.

JWT e hashing têm ports na application e implementações na infrastructure. O middleware RBAC reutilizável recebe permissões atuais no contexto da requisição; endpoints autenticados serão conectados conforme os casos de uso forem implementados.
O JWT carrega somente `userId`. A autenticação consulta `usuarios`, `usuarios_perfis`, `perfis_permissoes` e `permissoes` em toda requisição, evitando permissões obsoletas no token.

Como o banco não possui funções próprias para os comandos desta etapa, `PostgresBeneficiarioCommand` e `PostgresCapacidade` controlam `BEGIN/COMMIT/ROLLBACK`, locks de capacidade/agregado, histórico e auditoria. As constraints permanecem como proteção final.
