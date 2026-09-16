# Testes

## Suíte reproduzível de consistência (2026-09-05)

`npm run test:integration` executa `tests/integration/consistency.spec.ts`:
requisições HTTP reais à aplicação, adapters reais e PostgreSQL real. Não usa
mocks de ports. `npm test` executa também essa suíte junto dos testes unitários.

Pré-requisitos: PostgreSQL 17+, extensões `pgcrypto` e `pg_trgm`, e um usuário
com permissão para criar bancos. Configure `TEST_DB_ADMIN_HOST`,
`TEST_DB_ADMIN_PORT`, `TEST_DB_ADMIN_USER`, `TEST_DB_ADMIN_PASSWORD` ou use
as credenciais `DB_*` do `.env`. O setup conecta ao banco administrativo
`postgres`, cria `pastoral_test_<uuid>` a partir de `template0`, restaura o
snapshot **somente estrutural** versionado e aplica as migrations de 20260905
em diante. Não copia dados do desenvolvimento. Falha se não conseguir criar
o banco; não pula silenciosamente os testes nem usa o banco da aplicação.

Cada cenário insere dados sintéticos após limpar exclusivamente o banco
temporário. O helper confere `current_database()` antes de `TRUNCATE`; o teardown
remove apenas o nome aleatório criado naquela execução. Duas execuções simultâneas
usam bancos diferentes. Dentro da suíte, os cenários compartilham fixtures e
devem permanecer sequenciais. Se o processo for encerrado à força, um banco
temporário pode permanecer; nunca reutilizá-lo como banco de desenvolvimento.

A concorrência usa conexões independentes e um bloqueador transacional; os
testes verificam em `pg_stat_activity` que as operações aguardam o lock antes
de liberá-lo. São verificados status HTTP, saldo físico, reservas, consumo,
retorno, histórico e rollback, incluindo exatamente `201 + 409` na retirada
duplicada. Cobertura: lotes, aprovação/reserva, montagem, liberação, retirada,
estorno aberto/fechado, encerramento, adicional por modelo, perdas e inventário.

As migrations corretivas são testadas apenas no banco temporário. Para usar
as correções SQL em outro ambiente, aplicar os dois arquivos de 20260905 antes
de iniciar o backend. As decisões assistenciais ainda pendentes estão em
`consistency-fixes.md`.

As seções abaixo registram validações anteriores; seus números e procedimentos
de cleanup são históricos e não descrevem a nova suíte isolada.

## Auditoria e observabilidade

Há testes de sanitização recursiva, paginação/delegação, ausências, status administrativo e mapeamento seguro dos códigos PostgreSQL `23505`, `23503`, `23514`, `40001`, `40P01` e `55P03`.

O E2E confirmou auditoria filtrada, paginação, detalhe sem `senha_hash`, password, segredos ou tokens, `403` sem permissão, status do pool, histórico do beneficiário e distribuição. Os logs observados continham request ID, usuário autenticado e código do erro de autorização.

Após o cleanup: zero fixtures, capacidade `300`, `30` beneficiários ativos e saldo agregado de insumos `561`, igual ao valor anterior.

`EXPLAIN (ANALYZE, BUFFERS)` na fixture: filtro por data `0,072 ms`, entidade `0,031 ms` e usuário `0,036 ms`. Pelo volume mínimo, o otimizador preferiu varreduras pequenas mesmo onde existem índices de data e entidade. Não houve evidência para índice adicional de usuário.

## Dashboard e relatórios

Os testes unitários cobrem cobertura integral/parcial, estoque zero, ausência de planejamento, reserva de outro plano, reserva própria, cesta montada, um ou vários limitantes e separação entre garantia e projeção. Casos de uso confirmam delegação aos query ports.

O E2E autenticado validou dashboard, horizonte de três meses, separação da projeção, filtros e paginação dos três relatórios. O cleanup removeu o usuário da fixture e confirmou capacidade `300`, `30` beneficiários ativos e saldo agregado de insumos inalterado em `561`.

`EXPLAIN (ANALYZE, BUFFERS)` no conjunto atual: próxima distribuição `0,095 ms`, composição/cobertura `0,334 ms` e relatório de distribuições `0,086 ms`. Todos usaram buffers em cache, sem evidência para criar novos índices.

## Encerramento

O E2E confirmou `RETIRADO`, `AUSENTE`, `NAO_ATENDIDO_ESTOQUE` e `NAO_ATENDIDO_IRREGULARIDADE`, incluindo pendência regularizada e retirada estornada. De 10 cestas liberadas, 7 foram consumidas e 3 retornaram ao lote de origem. Duas chamadas simultâneas de encerramento produziram `204 + 409`; a corrida entre retirada e encerramento foi serializada sem retirada válida posterior ao fechamento. Operações de atendimento ficaram bloqueadas e justificativa posterior permaneceu disponível.

## Comandos

- `npm test`: testes unitários, HTTP e integração em banco temporário.
- `npm run test:watch`: modo interativo.
- `npm run test:integration`: suíte transacional real em banco temporário.
- `npm run typecheck`, `npm run lint` e `npm run build`: gate técnico.

Os testes unitários de application usam ports falsos e não dependem do PostgreSQL. Testes HTTP verificam healthcheck, request ID e OpenAPI.
Há cobertura para login válido/inválido/inativo, ausência e invalidade de token, autorização permitida/negada, casos de uso de admissão normal/excepcional, desligamento, reativação, mudança de grupo e capacidade.
Também são cobertos casos de uso de candidatura, prioridade obrigatoriamente justificada, contato, não localizado, admissão pela fila, competências, distribuições e remarcação. A validação E2E usa registros marcados e confirma sua remoção.
Triagem cobre abertura, busca operacional, check-in regular/pendente, duplicidade, filas e concorrência para a mesma chegada.

Os testes transacionais agora usam exclusivamente banco isolado e conexões
independentes, conforme descrito acima.

## Atendimento transacional

Os testes de application cobrem justificativa, decisões, retirada titular, representante, primeira entrega, bloqueios operacionais, prioridade e autorização dinâmica do estorno.

O E2E controlado validou regularização durante o atendimento, prioridade, consultas, documento do representante mascarado e estorno. Duas requisições simultâneas para o mesmo direito produziram `201 + 409` e somente uma retirada válida. Após o cleanup foram confirmados zero registros da fixture, capacidade `300` e `30` beneficiários ativos.

## Fluxo físico

A correção de composição de lotes possui 18 regressões PostgreSQL/HTTP em `tests/integration/consistency.spec.ts`: operações sucessivas, item novo, rollback, saldo/movimentos/estado, desmontagem integral, parcial sem ajuste, bloqueio de parcial após qualquer ajuste, cestas indisponíveis e concorrência com locks reais. A migration `20260906_001_current_lot_composition.sql` é carregada automaticamente no banco temporário e sua reaplicação é testada com dados existentes. Consulte [lote-composition-fix.md](lote-composition-fix.md).

O E2E de estoque validou entrada `100`, inventários positivo e negativo, perda e bloqueio acima do saldo, simulação sem mutação, reserva `20` sem baixa física, montagem de `10` cestas consumindo `20` unidades, ajuste, desmontagem, liberação, retirada e estorno.

Na concorrência física, duas requisições para o mesmo direito produziram `201 + 409`, uma retirada, uma entrega e consumo de exatamente uma cesta. Sem liberação disponível, a API retornou `SEM_CESTA_DISPONIVEL`. O estorno restaurou `quantidadeConsumida` de `1` para `0`.
