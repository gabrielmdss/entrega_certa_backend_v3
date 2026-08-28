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