AGENTS.md — API da Pastoral de Distribuição de Cestas

1. Objetivo

Construir a API backend do sistema da pastoral de distribuição de cestas, utilizando o banco PostgreSQL já existente como fonte estrutural de verdade.

A API deve refletir o domínio e as regras de negócio já modeladas no banco, evitando CRUDs genéricos para operações que possuem regras assistenciais, transacionais ou de estoque.

O sistema atende uma única pastoral/unidade, com:

um único estoque;

uma única capacidade global de beneficiários;

dois grupos regulares de distribuição;

duas entregas mensais, normalmente no 2º e 4º sábado;

uma cesta regular por beneficiário por competência mensal;

lista de espera;

múltiplos modelos de cesta;

planejamento, reserva, montagem e liberação de cestas;

controle de retiradas, justificativas, representantes e cestas adicionais;

auditoria;

operação exclusivamente online, em rede local.

2. Regra principal de implementação

Antes de escrever código:

conecte-se ao banco;

inspecione o schema pastoral;

mapeie tabelas, colunas, constraints, índices, views e funções;

confirme as assinaturas das funções existentes;

identifique as regras já garantidas pelo banco;

implemente a API por casos de uso, não por CRUD automático.

Não recrie migrations que destruam ou substituam a estrutura existente.

Não altere o banco sem necessidade objetiva.

Caso seja identificada inconsistência entre este documento e o banco:

o banco deve ser inspecionado primeiro e a divergência deve ser documentada antes de qualquer alteração.

3. Princípio arquitetural

A aplicação deve seguir Clean Architecture de forma pragmática.

As camadas principais devem ficar no topo do projeto:

domain
application
infrastructure
presentation
main

Os módulos/contextos de negócio ficam dentro dessas camadas.

Exemplo:

domain/beneficiarios
application/beneficiarios
infrastructure/database/postgres/beneficiarios
presentation/http/beneficiarios

Evitar a estrutura:

modules/
└── beneficiarios/
    ├── domain/
    ├── application/
    ├── infrastructure/
    └── presentation/

para este projeto.

A arquitetura escolhida deve deixar explícita a direção das dependências.

4. Regra de dependência

A dependência sempre aponta para dentro.

               DOMAIN
                 ▲
                 │
            APPLICATION
             ▲       ▲
             │       │
 INFRASTRUCTURE     PRESENTATION
             ▲       ▲
                 MAIN

Regras:

domain
- não conhece application
- não conhece infrastructure
- não conhece presentation
- não conhece Express
- não conhece PostgreSQL
- não conhece JWT

application
- conhece domain
- não conhece Express
- não conhece implementação PostgreSQL
- trabalha com ports/interfaces

infrastructure
- implementa ports
- conhece PostgreSQL
- conhece filesystem/storage
- conhece JWT/bcrypt quando aplicável

presentation
- conhece application
- trata HTTP
- valida entrada
- chama use cases
- mapeia respostas

main
- composition root
- instancia implementações
- injeta dependências
- sobe servidor

5. Estrutura de pastas esperada

src/
├── domain/
│   ├── pessoas/
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── services/
│   │   └── repositories/
│   │
│   ├── beneficiarios/
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── services/
│   │   └── repositories/
│   │
│   ├── candidaturas/
│   ├── competencias/
│   ├── distribuicoes/
│   ├── atendimento/
│   ├── estoque/
│   ├── cestas/
│   └── planejamento/
│
├── application/
│   ├── pessoas/
│   │   ├── use-cases/
│   │   ├── dto/
│   │   └── ports/
│   │
│   ├── beneficiarios/
│   │   ├── use-cases/
│   │   ├── dto/
│   │   └── ports/
│   │
│   ├── candidaturas/
│   ├── competencias/
│   ├── distribuicoes/
│   ├── atendimento/
│   ├── estoque/
│   ├── cestas/
│   ├── planejamento/
│   ├── dashboard/
│   └── auth/
│
├── infrastructure/
│   ├── database/
│   │   └── postgres/
│   │       ├── connection/
│   │       ├── pessoas/
│   │       ├── beneficiarios/
│   │       ├── candidaturas/
│   │       ├── competencias/
│   │       ├── distribuicoes/
│   │       ├── atendimento/
│   │       ├── estoque/
│   │       ├── cestas/
│   │       └── planejamento/
│   │
│   ├── auth/
│   ├── storage/
│   ├── logging/
│   └── observability/
│
├── presentation/
│   └── http/
│       ├── auth/
│       ├── pessoas/
│       ├── beneficiarios/
│       ├── candidaturas/
│       ├── competencias/
│       ├── distribuicoes/
│       ├── atendimento/
│       ├── estoque/
│       ├── cestas/
│       ├── planejamento/
│       ├── dashboard/
│       ├── middlewares/
│       ├── errors/
│       └── validation/
│
├── main/
│   ├── app.ts
│   ├── server.ts
│   ├── routes.ts
│   ├── dependencies.ts
│   └── config.ts
│
└── shared/
    ├── errors/
    ├── result/
    ├── types/
    └── utils/

6. Não organizar apenas por tipo técnico

Evitar:

domain/
├── entities/
│   ├── Beneficiario.ts
│   ├── Distribuicao.ts
│   ├── Insumo.ts
│   └── Cesta.ts
│
├── services/
└── repositories/

Preferir:

domain/
├── beneficiarios/
├── distribuicoes/
├── estoque/
└── cestas/

O primeiro eixo de organização continua sendo o negócio.

7. Exemplo completo — módulo Beneficiários

A seguir, usar beneficiarios como referência para todos os demais módulos.

7.1 Domain

src/domain/beneficiarios/
├── entities/
│   └── beneficiario.entity.ts
├── value-objects/
│   └── beneficiario-status.vo.ts
├── services/
│   └── beneficiario-domain.service.ts
└── repositories/
    └── beneficiario.repository.ts

beneficiario.entity.ts

Responsável apenas por regras inerentes ao conceito de beneficiário.

Exemplo conceitual:

export class Beneficiario {
  constructor(
    readonly id: bigint,
    readonly pessoaId: bigint,
    private status: 'ATIVO' | 'DESLIGADO',
    private grupoDistribuicaoId: bigint | null,
  ) {}

  isAtivo(): boolean {
    return this.status === 'ATIVO';
  }

  desligar(): void {
    if (!this.isAtivo()) {
      throw new Error('Beneficiário já está desligado');
    }

    this.status = 'DESLIGADO';
  }
}

Não colocar nesta entidade:

SQL
Express Request
JWT
repository concreto
query PostgreSQL
HTTP status

7.2 Repository do domínio

src/domain/beneficiarios/repositories/beneficiario.repository.ts

Exemplo:

export interface BeneficiarioRepository {
  findById(id: bigint): Promise<Beneficiario | null>;
  findByPessoaId(pessoaId: bigint): Promise<Beneficiario | null>;
  save(beneficiario: Beneficiario): Promise<void>;
}

Usar repository para persistência de agregados quando fizer sentido.

Não transformar toda operação do sistema em:

save
update
delete

Operações como retirada, encerramento e montagem são comandos de domínio e devem possuir ports específicos.

8. Application — Beneficiários

Estrutura:

src/application/beneficiarios/
├── use-cases/
│   ├── admitir-beneficiario.use-case.ts
│   ├── desligar-beneficiario.use-case.ts
│   ├── reativar-beneficiario.use-case.ts
│   └── alterar-grupo-beneficiario.use-case.ts
│
├── dto/
│   ├── admitir-beneficiario.input.ts
│   ├── desligar-beneficiario.input.ts
│   └── beneficiario.output.ts
│
└── ports/
    ├── capacidade-query.port.ts
    ├── beneficiario-command.port.ts
    └── beneficiario-query.port.ts

9. Exemplo de Use Case

src/application/beneficiarios/use-cases/desligar-beneficiario.use-case.ts

Responsabilidade:

receber intenção
validar pré-condições
orquestrar dependências
executar operação
retornar resultado

Exemplo conceitual:

export class DesligarBeneficiarioUseCase {
  constructor(
    private readonly command: BeneficiarioCommandPort,
  ) {}

  async execute(input: DesligarBeneficiarioInput) {
    return this.command.desligar({
      beneficiarioId: input.beneficiarioId,
      motivoId: input.motivoId,
      observacao: input.observacao,
      usuarioId: input.usuarioId,
    });
  }
}

Se o banco já possui uma função transacional confiável para a operação:

o use case pode delegar a transação para um command port PostgreSQL.

Não duplicar uma regra complexa já validada no banco apenas para parecer “mais orientado a objetos”.

10. Commands e Queries

Separar leitura e operações transacionais quando útil.

Exemplo:

BeneficiarioQueryPort

para:

listar
buscar por id
buscar por nome
consultar situação
consultar histórico

E:

BeneficiarioCommandPort

para:

admitir
desligar
reativar
alterar grupo

Isso evita criar repositories artificiais com dezenas de métodos sem coerência.

11. Infrastructure — Beneficiários

Estrutura:

src/infrastructure/database/postgres/beneficiarios/
├── postgres-beneficiario.repository.ts
├── postgres-beneficiario-query.ts
├── postgres-beneficiario-command.ts
├── beneficiario.mapper.ts
└── beneficiario.sql.ts

postgres-beneficiario.repository.ts

Implementa interfaces do domínio quando a operação for persistência de agregado.

postgres-beneficiario-query.ts

Queries otimizadas para leitura.

Exemplo:

export class PostgresBeneficiarioQuery
  implements BeneficiarioQueryPort
{
  constructor(private readonly db: Database) {}

  async findById(id: bigint) {
    // query parametrizada
  }
}

postgres-beneficiario-command.ts

Operações transacionais/casos de negócio.

Exemplo:

export class PostgresBeneficiarioCommand
  implements BeneficiarioCommandPort
{
  constructor(private readonly db: Database) {}

  async desligar(input: DesligarBeneficiarioCommand) {
    // usar transação
    // chamar função existente do banco quando aplicável
    // não espalhar SQL de negócio em controllers
  }
}

12. Presentation — Beneficiários

Estrutura:

src/presentation/http/beneficiarios/
├── beneficiarios.controller.ts
├── beneficiarios.routes.ts
├── beneficiarios.schemas.ts
└── beneficiarios.presenter.ts

Controller

Deve ser fino.

Exemplo:

export class BeneficiariosController {
  constructor(
    private readonly desligarBeneficiario:
      DesligarBeneficiarioUseCase,
  ) {}

  desligar = async (req: Request, res: Response) => {
    const input = desligarBeneficiarioSchema.parse({
      ...req.params,
      ...req.body,
    });

    await this.desligarBeneficiario.execute({
      beneficiarioId: BigInt(input.id),
      motivoId: BigInt(input.motivoId),
      observacao: input.observacao,
      usuarioId: req.user.id,
    });

    return res.status(204).send();
  };
}

Controller não deve:

abrir transação diretamente
consultar banco diretamente
decidir regra de capacidade
alterar status manualmente
validar permissão com if espalhado

13. Routes

src/presentation/http/beneficiarios/beneficiarios.routes.ts

Exemplo:

router.post(
  '/:id/desligar',
  authMiddleware,
  requirePermission('BENEFICIARIO_DESLIGAR'),
  controller.desligar,
);

Permissão deve ser tratada por middleware/guard reutilizável.

14. Main / Composition Root

Estrutura:

src/main/
├── dependencies.ts
├── routes.ts
├── app.ts
└── server.ts

main pode conhecer todas as camadas.

Exemplo:

const beneficiarioCommand =
  new PostgresBeneficiarioCommand(database);

const desligarBeneficiario =
  new DesligarBeneficiarioUseCase(
    beneficiarioCommand,
  );

const beneficiariosController =
  new BeneficiariosController(
    desligarBeneficiario,
  );

Nunca fazer isso dentro do próprio use case:

new PostgresBeneficiarioCommand(...)

Dependências devem ser injetadas.

15. Exemplo visual completo do fluxo

HTTP
 │
 ▼
beneficiarios.routes.ts
 │
 ▼
BeneficiariosController
 │
 ▼
DesligarBeneficiarioUseCase
 │
 ▼
BeneficiarioCommandPort
 │
 ▼
PostgresBeneficiarioCommand
 │
 ▼
PostgreSQL / schema pastoral

As dependências de código continuam apontando para dentro:

presentation → application
infrastructure → application/domain
application → domain
main → todos

16. Exemplo com operação mais complexa — Retirada

Não tratar retirada como repository CRUD.

Estrutura:

application/atendimento/
├── use-cases/
│   ├── registrar-retirada.use-case.ts
│   ├── registrar-checkin.use-case.ts
│   ├── estornar-retirada.use-case.ts
│   └── encerrar-distribuicao.use-case.ts
└── ports/
    ├── atendimento-query.port.ts
    └── retirada-command.port.ts

Infra:

infrastructure/database/postgres/atendimento/
├── postgres-atendimento-query.ts
├── postgres-retirada-command.ts
└── atendimento.mapper.ts

Fluxo:

RegistrarRetiradaUseCase
        │
        ▼
RetiradaCommandPort
        │
        ▼
PostgresRetiradaCommand
        │
        ▼
função/transação PostgreSQL

Não criar:

RetiradaRepository.delete()
RetiradaRepository.updateStatus()
RetiradaRepository.save()

como abstração principal de uma operação transacional de negócio.

17. Banco como detalhe, mas integridade como realidade

Clean Architecture não significa fingir que o banco não existe.

O schema PostgreSQL já possui regras validadas por testes.

A aplicação deve:

preservar
reutilizar
orquestrar

essas garantias.

Não duplicar indiscriminadamente lógica crítica.

Exemplo:

UNIQUE direito por competência
UNIQUE retirada válida por direito
functions de encerramento
functions de montagem
controle transacional de estoque

Essas invariantes devem continuar protegidas no banco.

18. Banco

Schema:

pastoral

Antes de implementar:

mapear tabelas
mapear FKs
mapear índices
mapear views
mapear funções
mapear triggers
mapear constraints

Gerar obrigatoriamente:

docs/database-mapping.md

19. Módulos de domínio esperados

pessoas
beneficiarios
candidaturas
competencias
distribuicoes
atendimento
estoque
cestas
planejamento

dashboard, auth e auditoria podem existir na application/presentation sem necessariamente possuir entidades ricas no domain.

Não force criação de entidades onde não há comportamento de domínio.

20. Auth

Estrutura sugerida:

application/auth/
├── use-cases/
│   ├── login.use-case.ts
│   └── get-current-user.use-case.ts
└── ports/
    ├── password-hasher.port.ts
    └── token-service.port.ts

infrastructure/auth/
├── bcrypt-password-hasher.ts
└── jwt-token-service.ts

presentation/http/auth/
├── auth.controller.ts
├── auth.routes.ts
└── auth.schemas.ts

21. Shared

shared deve ser pequeno.

Permitido:

DomainError
Result
Pagination
Clock
types genéricos

Evitar transformar shared em depósito de qualquer coisa que não se sabe onde colocar.

22. Padrão de nomes

Arquivos:

beneficiario.entity.ts
beneficiario.repository.ts
admitir-beneficiario.use-case.ts
beneficiario-query.port.ts
postgres-beneficiario-query.ts
beneficiarios.controller.ts
beneficiarios.routes.ts

Classes:

Beneficiario
AdmitirBeneficiarioUseCase
BeneficiarioRepository
BeneficiarioQueryPort
PostgresBeneficiarioQuery
BeneficiariosController

23. Endpoints principais

Base:

/api/v1

Auth

POST /auth/login
GET  /auth/me

Beneficiários

GET  /beneficiarios
GET  /beneficiarios/:id
POST /beneficiarios
POST /beneficiarios/:id/desligar
POST /beneficiarios/:id/reativar
POST /beneficiarios/:id/alterar-grupo

Candidaturas

GET  /candidaturas
POST /candidaturas
POST /candidaturas/:id/priorizar
POST /candidaturas/:id/admitir

Distribuições

GET  /distribuicoes
GET  /distribuicoes/:id
POST /distribuicoes/:id/abrir
POST /distribuicoes/:id/check-ins
POST /distribuicoes/:id/retiradas
POST /distribuicoes/:id/liberacoes-cestas
POST /distribuicoes/:id/cestas-adicionais
POST /distribuicoes/:id/encerrar

Estoque

GET  /estoque/insumos
POST /estoque/insumos
POST /estoque/entradas
POST /estoque/perdas
POST /estoque/inventarios
POST /estoque/lotes-montagem

Planejamento

POST /planejamentos/simular
POST /planejamentos
POST /planejamentos/:id/aprovar
POST /planejamentos/:id/revisoes

24. Regra para Controllers

Controller deve ser adaptação HTTP.

Nunca colocar no controller:

regra de vaga
regra de competência
regra de fila
regra de pendência
cálculo de estoque
cálculo de reserva
transação
SQL

25. Regra para Application

Use case representa uma intenção do negócio.

Exemplos:

AdmitirBeneficiario
DesligarBeneficiario
RegistrarCheckIn
RegistrarRetirada
AvaliarJustificativa
EstornarRetirada
AprovarPlanejamento
MontarCestas
EncerrarDistribuicao

Evitar:

UpdateBeneficiarioUseCase
UpdateRetiradaUseCase
UpdateDistribuicaoUseCase

quando existe uma intenção de negócio mais específica.

26. Regra para Infrastructure

Infrastructure contém detalhes substituíveis.

Exemplos:

PostgreSQL
JWT
bcrypt
filesystem
logger

Não expor tipos de pg para application/domain.

27. Regras essenciais do negócio

Preservar integralmente:

1 cesta regular por competência
direito não acumula
beneficiário ativo ocupa vaga
capacidade global
responsável pode autorizar exceções
pendente não passa à frente dos regulares
justificativa protege vaga, não recupera cesta
cesta adicional é separada
estoque nunca negativo
liberação não é saída física
montagem transforma insumo em cesta
remanescentes retornam ao estoque de cestas
histórico não é apagado

28. Testes

Estrutura sugerida:

tests/
├── unit/
│   ├── domain/
│   └── application/
│
├── integration/
│   ├── database/
│   └── api/
│
└── helpers/

Testar principalmente use cases.

Integração obrigatória para fluxos transacionais.

29. Concorrência

Teste obrigatório:

duas requisições simultâneas
tentam retirar o mesmo direito

Resultado:

1 sucesso
1 conflito

Nunca duas retiradas válidas.

30. Documentação esperada

Gerar:

docs/
├── architecture.md
├── api.md
├── database-mapping.md
├── business-rules.md
└── testing.md

architecture.md deve documentar a regra:

camadas no topo
módulos dentro das camadas
dependências apontando para domain/application
main como composition root

31. Ordem de implementação

Etapa 1

database
config
error handling
auth
RBAC
healthcheck

Etapa 2

pessoas
beneficiarios
capacidade
candidaturas

Etapa 3

competencias
distribuicoes
direitos

Etapa 4

check-in
justificativas
retiradas
representantes
estornos
cestas adicionais
encerramento

Etapa 5

insumos
doadores
entradas
perdas
inventarios

Etapa 6

modelos
planejamento
reservas
montagem
liberacao

Etapa 7

dashboard
saude
auditoria
documentacao

32. Resultado esperado

O código final deve deixar evidente que:

domain representa negócio
application representa casos de uso
infrastructure implementa detalhes
presentation adapta HTTP
main compõe dependências

A organização por módulo existe dentro de cada camada.

Exemplo definitivo:

domain/beneficiarios
application/beneficiarios
infrastructure/database/postgres/beneficiarios
presentation/http/beneficiarios

Essa estrutura deve ser usada como padrão para os demais contextos.

# Configuração e bootstrap técnico do projeto

## 1. Objetivo

Além da arquitetura de domínio definida neste documento, o projeto deve possuir uma fundação técnica padronizada e previsível.

O Codex não deve escolher arbitrariamente bibliotecas, estrutura de configuração ou estratégia de conexão ao banco quando estas diretrizes já definirem a solução.

Antes de implementar módulos de negócio, configurar:

```text
Node.js
TypeScript
HTTP server
variáveis de ambiente
PostgreSQL
logger
tratamento global de erros
JWT
RBAC
CORS
Swagger/OpenAPI
storage
testes
graceful shutdown
health/readiness
```

---

# 2. Runtime e stack base

Utilizar:

```text
Node.js LTS
TypeScript
Express
PostgreSQL
pg
Zod
JWT
bcrypt ou argon2
Vitest
ESLint
tsx para desenvolvimento
```

Não adicionar ORM por padrão.

O banco já possui:

- schema definido;
- constraints;
- views;
- funções;
- regras transacionais;
- SQL validado.

Portanto, utilizar `pg` diretamente, encapsulado pela camada `infrastructure`.

Se durante a implementação houver justificativa concreta para query builder ou outra biblioteca, documentar a decisão antes de introduzi-la.

---

# 3. Package scripts

O projeto deve possuir pelo menos:

```json
{
  "scripts": {
    "dev": "tsx watch src/main/server.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/main/server.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run tests/integration"
  }
}
```

Os comandos abaixo devem funcionar antes da entrega:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

# 4. TypeScript

Utilizar TypeScript em modo estrito.

Configuração mínima esperada:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,

    "esModuleInterop": true,
    "skipLibCheck": true,

    "outDir": "dist",
    "rootDir": "."
  }
}
```

Pode haver ajustes necessários conforme a versão efetivamente utilizada das dependências.

Não desabilitar `strict` para resolver erros de tipagem.

Não utilizar `any` como solução genérica.

Quando um dado externo ainda não for conhecido, preferir:

```ts
unknown
```

e realizar narrowing/validação.

---

# 5. Variáveis de ambiente

Nenhuma configuração de ambiente deve ficar hardcoded.

Criar:

```text
.env
.env.example
```

`.env` nunca deve ser versionado.

`.env.example` deve ser versionado e não deve conter credenciais reais.

Exemplo inicial:

```env
NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=pastoral
DB_USER=pastoral_app
DB_PASSWORD=change_me
DB_SCHEMA=pastoral

DB_POOL_MAX=10
DB_CONNECTION_TIMEOUT_MS=5000
DB_IDLE_TIMEOUT_MS=30000

JWT_SECRET=change_me
JWT_EXPIRES_IN=8h

FILES_STORAGE_PATH=./storage

LOG_LEVEL=info

CORS_ORIGINS=http://localhost:4200
```

Não assumir que esses valores são os valores reais do ambiente.

O Codex deve utilizar as credenciais/conexão fornecidas no ambiente de desenvolvimento para inspecionar o banco existente.

---

# 6. Validação do ambiente

As variáveis devem ser validadas durante o bootstrap.

Criar algo equivalente a:

```text
src/main/config.ts
```

ou:

```text
src/infrastructure/config/
```

Exemplo conceitual:

```ts
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(3000),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_SCHEMA: z.string().default('pastoral'),

  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('8h'),

  FILES_STORAGE_PATH: z.string().default('./storage'),

  LOG_LEVEL: z.string().default('info'),

  CORS_ORIGINS: z.string().default('http://localhost:4200'),
});
```

A aplicação deve falhar imediatamente no startup quando uma configuração obrigatória estiver ausente ou inválida.

Não permitir que erros de configuração apareçam somente na primeira requisição.

---

# 7. Configuração PostgreSQL

Utilizar pool de conexões.

Estrutura sugerida:

```text
src/infrastructure/database/postgres/
├── connection/
│   ├── postgres.connection.ts
│   ├── postgres.transaction.ts
│   └── postgres.types.ts
│
├── beneficiarios/
├── atendimento/
├── estoque/
└── ...
```

Exemplo conceitual:

```ts
import { Pool } from 'pg';

export function createPostgresPool(config: DatabaseConfig): Pool {
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.poolMax,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: config.idleTimeoutMs,
    application_name: 'pastoral-api',
  });
}
```

Não espalhar `new Pool()` pelo projeto.

Deve existir apenas uma infraestrutura central responsável pela criação e ciclo de vida do pool.

---

# 8. Schema PostgreSQL

O schema funcional da aplicação é:

```text
pastoral
```

Não depender implicitamente de:

```text
search_path
```

quando isso puder causar ambiguidade.

Preferir queries explicitamente qualificadas:

```sql
SELECT *
FROM pastoral.beneficiarios
WHERE id = $1;
```

Funções também devem ser chamadas com schema explícito:

```sql
SELECT *
FROM pastoral.nome_da_funcao(...);
```

Isso evita comportamento diferente entre:

```text
desenvolvimento
testes
produção
```

---

# 9. Queries parametrizadas

Toda entrada externa deve utilizar parâmetros.

Correto:

```ts
await client.query(
  `
    SELECT id, pessoa_id, status
    FROM pastoral.beneficiarios
    WHERE id = $1
  `,
  [beneficiarioId],
);
```

Proibido:

```ts
await client.query(
  `SELECT * FROM pastoral.beneficiarios WHERE id = ${beneficiarioId}`,
);
```

Nunca concatenar dados fornecidos pelo usuário em SQL.

---

# 10. Abstração da conexão

Application e Domain não podem importar:

```ts
Pool
PoolClient
QueryResult
```

de `pg`.

Tipos específicos do PostgreSQL pertencem à infraestrutura.

Exemplo:

```text
application
    ↓
BeneficiarioQueryPort
    ↑
infrastructure
    ↓
PostgresBeneficiarioQuery
    ↓
pg
```

Nunca:

```text
UseCase
   ↓
Pool.query()
```

---

# 11. Transações

Criar uma abstração central para operações que realmente precisam controlar transações na aplicação.

Exemplo conceitual:

```ts
export interface TransactionContext {
  query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T>;
}
```

Na implementação PostgreSQL:

```text
pool.connect()
    ↓
BEGIN
    ↓
operação
    ↓
COMMIT
```

Em erro:

```text
ROLLBACK
```

Sempre liberar o client:

```text
finally
    ↓
client.release()
```

Entretanto:

> quando uma função PostgreSQL existente já encapsula atomicamente a operação de domínio, não abrir transações redundantes sem necessidade.

Antes de implementar cada operação crítica, verificar como a função existente no schema se comporta.

---

# 12. Timeouts

Não permitir queries indefinidamente bloqueadas.

Avaliar configuração de:

```text
statement_timeout
lock_timeout
```

especialmente para operações críticas como:

```text
retirada
estorno
montagem
encerramento
inventário
```

Os valores efetivos devem ser definidos conforme o ambiente e documentados.

Não utilizar timeout extremamente baixo que possa interromper uma operação legítima.

---

# 13. BigInt PostgreSQL

O banco utiliza diversas PKs:

```text
bigint
```

JavaScript possui particularidades com `bigint`.

Definir uma estratégia única para toda a aplicação.

Na fronteira HTTP, IDs devem ser serializados preferencialmente como:

```json
{
  "id": "123"
}
```

ou convertidos de forma segura quando houver garantia de que permanecem dentro de `Number.MAX_SAFE_INTEGER`.

Não permitir que `JSON.stringify()` receba `bigint` nativo sem tratamento.

A estratégia escolhida deve ser centralizada em:

```text
mapper
presenter
database adapter
```

e documentada.

---

# 14. Datas e timezone

Banco e backend devem tratar datas de forma previsível.

Para timestamps:

```text
timestamptz
```

é o padrão preferido.

Persistir instantes de forma consistente e converter para apresentação somente na borda.

Datas civis como:

```text
data da distribuição
data de nascimento
competência
```

não devem sofrer conversão indevida de timezone.

Não transformar automaticamente:

```text
2026-09-12
```

em timestamp quando o domínio exige apenas uma data.

---

# 15. Bootstrap da aplicação

Fluxo esperado:

```text
server.ts
   ↓
carregar env
   ↓
validar configuração
   ↓
criar logger
   ↓
criar pool PostgreSQL
   ↓
verificar conexão
   ↓
montar dependencies
   ↓
criar Express app
   ↓
registrar middlewares
   ↓
registrar routes
   ↓
registrar error handler
   ↓
listen()
```

Exemplo de responsabilidade:

```text
main/config.ts
    configuração

main/dependencies.ts
    dependency injection / composition root

main/app.ts
    Express

main/routes.ts
    composição das rotas

main/server.ts
    processo e ciclo de vida
```

---

# 16. Composition Root

`main/dependencies.ts` é responsável pelo wiring.

Exemplo:

```ts
const pool = createPostgresPool(config.database);

const beneficiarioQuery =
  new PostgresBeneficiarioQuery(pool);

const beneficiarioCommand =
  new PostgresBeneficiarioCommand(pool);

const admitirBeneficiario =
  new AdmitirBeneficiarioUseCase(
    beneficiarioQuery,
    beneficiarioCommand,
  );

const beneficiariosController =
  new BeneficiariosController({
    admitirBeneficiario,
  });
```

Não utilizar service locator global.

Não instanciar infraestrutura dentro dos use cases.

---

# 17. Healthcheck e readiness

Criar:

```text
GET /health
GET /ready
```

`/health` verifica se o processo está funcionando.

Exemplo:

```json
{
  "status": "ok"
}
```

`/ready` verifica dependências essenciais, principalmente PostgreSQL.

Exemplo:

```json
{
  "status": "ready",
  "database": "ok"
}
```

Se o banco estiver indisponível, readiness deve responder adequadamente.

Não expor:

```text
senha
host interno
stack trace
connection string
```

---

# 18. Graceful shutdown

Tratar pelo menos:

```text
SIGTERM
SIGINT
```

Fluxo:

```text
receber signal
    ↓
parar de aceitar novas conexões HTTP
    ↓
aguardar requisições em andamento
    ↓
fechar pool PostgreSQL
    ↓
encerrar processo
```

Exemplo conceitual:

```ts
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');

  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
```

Evitar `process.exit()` abrupto antes de liberar recursos.

---

# 19. HTTP server

Configurar middlewares globais em ordem previsível.

Exemplo:

```text
request id
logger HTTP
security headers
CORS
body parser
authentication
routes
404
error handler
```

Não colocar regras de domínio em middleware global.

---

# 20. CORS

Origens permitidas devem vir do ambiente.

Exemplo:

```env
CORS_ORIGINS=http://localhost:4200
```

Quando houver mais de uma:

```env
CORS_ORIGINS=http://localhost:4200,https://pastoral.exemplo.com.br
```

Não utilizar indiscriminadamente:

```text
Access-Control-Allow-Origin: *
```

em ambiente autenticado.

---

# 21. Autenticação

JWT deve ser abstraído por port.

Application:

```text
TokenServicePort
PasswordHasherPort
```

Infrastructure:

```text
JwtTokenService
BcryptPasswordHasher
```

O domínio não conhece JWT.

Payload mínimo do token deve evitar dados mutáveis desnecessários.

A autorização efetiva deve considerar as permissões atuais do usuário.

---

# 22. Password hashing

Nunca armazenar senha em texto puro.

Usar:

```text
argon2
```

ou:

```text
bcrypt
```

com configuração segura.

A biblioteca escolhida deve ficar encapsulada em:

```text
infrastructure/auth
```

---

# 23. Logging

Utilizar logger estruturado.

Exemplo de campos:

```text
requestId
method
path
statusCode
durationMs
userId
errorCode
```

Nunca registrar:

```text
senha
JWT completo
documento completo sem necessidade
conteúdo privado de arquivos
connection string com senha
```

Evitar `console.log()` espalhado pelo código.

---

# 24. Request ID

Cada requisição deve possuir identificador.

Aceitar um identificador válido recebido do proxy quando aplicável ou gerar novo.

Propagar para:

```text
logs
erros
auditoria técnica
```

Resposta pode incluir:

```text
X-Request-Id
```

---

# 25. Tratamento global de erros

Criar uma hierarquia clara.

Exemplo:

```text
DomainError
ApplicationError
ValidationError
AuthenticationError
AuthorizationError
InfrastructureError
```

O error handler HTTP é responsável pelo mapeamento.

Exemplo:

```text
BENEFICIARIO_PENDENTE
→ 409

PERMISSAO_NEGADA
→ 403

PESSOA_NAO_ENCONTRADA
→ 404
```

Erro PostgreSQL não deve chegar diretamente ao cliente.

Nunca responder em produção:

```json
{
  "stack": "...",
  "sql": "...",
  "database": "..."
}
```

---

# 26. Validação HTTP

Utilizar schemas explícitos.

Exemplo:

```ts
const desligarBeneficiarioSchema = z.object({
  motivoId: z.coerce.bigint(),
  observacao: z.string().trim().max(1000).optional(),
});
```

Validar separadamente quando necessário:

```text
params
query
body
headers
```

Não usar DTO sem validação apenas porque TypeScript compila.

Tipos TypeScript não validam entrada em runtime.

---

# 27. Swagger / OpenAPI

A API deve publicar documentação OpenAPI.

Sugestão:

```text
GET /docs
GET /openapi.json
```

Documentar:

```text
endpoint
método
permissão
request
response
status HTTP
erros de domínio relevantes
```

O contrato documentado deve corresponder ao comportamento real.

Não manter documentação manual completamente separada dos schemas quando isso gerar duplicação evitável.

---

# 28. Upload e storage

Inicialmente pode ser utilizado filesystem local.

Configuração:

```env
FILES_STORAGE_PATH=./storage
```

A infraestrutura deve ser abstraída:

```ts
export interface FileStorage {
  save(input: SaveFileInput): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  getPrivateFile(key: string): Promise<StoredFileContent>;
}
```

Estrutura:

```text
application/
└── files/
    └── ports/
        └── file-storage.port.ts

infrastructure/
└── storage/
    └── local-file.storage.ts
```

Isso permite migrar futuramente para outro storage sem alterar casos de uso.

---

# 29. Arquivos privados

Fotos e documentos de beneficiários não devem ser publicados diretamente como arquivos estáticos.

Evitar:

```text
app.use('/uploads', express.static(...))
```

para documentos privados.

Acesso deve passar por endpoint autenticado/autorizado.

---

# 30. Testes

Configurar ambiente separado:

```env
NODE_ENV=test
```

Nunca executar testes de integração destrutivos contra banco de produção.

Separar:

```text
tests/unit
tests/integration/database
tests/integration/api
```

Testes unitários não devem exigir PostgreSQL quando a unidade testada depende apenas de ports.

Testes de integração devem usar banco dedicado.

---

# 31. Banco de testes

Utilizar banco/schema isolado para testes.

Os testes devem poder:

```text
preparar estado
executar caso
verificar resultado
limpar/reverter estado
```

Quando possível, utilizar transação com rollback por teste.

Testes de concorrência podem exigir conexões independentes e não devem depender do mesmo transaction client.

---

# 32. Migrations futuras

O banco atual já existe e é a baseline.

Não gerar uma migration inicial destrutiva tentando recriar o schema existente.

Criar uma estratégia para evoluções futuras:

```text
database/
└── migrations/
```

Toda alteração futura deve:

```text
ser incremental
ser versionada
preservar dados
possuir justificativa
ser testável
```

O estado atual deve ser documentado como baseline.

---

# 33. Inicialização do banco

No startup da API:

não executar automaticamente:

```text
CREATE TABLE
ALTER TABLE
DROP TABLE
seed
migration destrutiva
```

A API deve verificar conectividade e compatibilidade mínima, mas não modificar silenciosamente a estrutura do banco.

---

# 34. Configuração de produção

Em produção:

```text
NODE_ENV=production
```

Obrigatório:

```text
JWT_SECRET forte
CORS explícito
logs estruturados
sem stack trace HTTP
sem credenciais padrão
sem senha de desenvolvimento
```

Configurações sensíveis devem vir do ambiente/secret manager da infraestrutura.

---

# 35. Estrutura final incluindo bootstrap

A estrutura esperada passa a ser:

```text
src/
├── domain/
│   ├── pessoas/
│   ├── beneficiarios/
│   ├── candidaturas/
│   ├── competencias/
│   ├── distribuicoes/
│   ├── atendimento/
│   ├── estoque/
│   ├── cestas/
│   └── planejamento/
│
├── application/
│   ├── auth/
│   ├── pessoas/
│   ├── beneficiarios/
│   ├── candidaturas/
│   ├── competencias/
│   ├── distribuicoes/
│   ├── atendimento/
│   ├── estoque/
│   ├── cestas/
│   ├── planejamento/
│   └── dashboard/
│
├── infrastructure/
│   ├── database/
│   │   └── postgres/
│   │       ├── connection/
│   │       ├── pessoas/
│   │       ├── beneficiarios/
│   │       ├── candidaturas/
│   │       ├── distribuicoes/
│   │       ├── atendimento/
│   │       ├── estoque/
│   │       └── planejamento/
│   ├── auth/
│   ├── storage/
│   ├── logging/
│   └── observability/
│
├── presentation/
│   └── http/
│       ├── auth/
│       ├── pessoas/
│       ├── beneficiarios/
│       ├── candidaturas/
│       ├── distribuicoes/
│       ├── atendimento/
│       ├── estoque/
│       ├── cestas/
│       ├── planejamento/
│       ├── dashboard/
│       └── middlewares/
│
├── main/
│   ├── config.ts
│   ├── dependencies.ts
│   ├── routes.ts
│   ├── app.ts
│   └── server.ts
│
└── shared/
    ├── errors/
    ├── result/
    ├── types/
    └── utils/

tests/
├── unit/
├── integration/
│   ├── database/
│   └── api/
└── helpers/

docs/
├── architecture.md
├── api.md
├── database-mapping.md
├── business-rules.md
└── testing.md

database/
└── migrations/

storage/

.env.example
package.json
tsconfig.json
tsconfig.build.json
eslint.config.js
vitest.config.ts
AGENTS.md
README.md
```

---

# 36. Gate técnico antes dos módulos de negócio

Antes de começar a implementação funcional de `beneficiarios`, `atendimento`, `estoque` etc., garantir que:

```text
[ ] projeto Node inicializado
[ ] TypeScript strict funcionando
[ ] .env validado
[ ] .env.example criado
[ ] conexão PostgreSQL funcionando
[ ] pool centralizado
[ ] schema pastoral acessível
[ ] healthcheck funcionando
[ ] readiness verificando PostgreSQL
[ ] logger funcionando
[ ] request ID funcionando
[ ] error handler funcionando
[ ] JWT configurado
[ ] RBAC base configurado
[ ] CORS configurado
[ ] Swagger/OpenAPI configurado
[ ] testes configurados
[ ] graceful shutdown implementado
[ ] npm run typecheck passa
[ ] npm run lint passa
[ ] npm run build passa
```

Somente depois desse gate iniciar a implementação dos casos de uso de negócio.

---

# 37. Diretriz de implementação

Não confundir Clean Architecture com excesso de abstrações.

Criar abstração quando existir uma fronteira real:

```text
PostgreSQL
JWT
password hashing
storage
HTTP
clock
```

Não criar interfaces vazias ou wrappers sem propósito apenas para aumentar o número de camadas.

O objetivo é:

```text
baixo acoplamento
dependências explícitas
testabilidade
integridade
clareza
```

e não maximizar a quantidade de arquivos.