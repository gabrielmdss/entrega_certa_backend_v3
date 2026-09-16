# Inspeção: ajuste, composição e desmontagem

Inspeção somente leitura do PostgreSQL configurado realizada em 2026-09-06, antes das alterações.

- `lotes_montagem`: quantidade montada/disponível e estados ATIVO, ESGOTADO e DESMONTADO. A constraint `quantidade_montada > 0` contradiz a desmontagem total implementada na API, que grava zero.
- `lotes_montagem_itens`: snapshot original, unidades inteiras positivas por cesta, único por lote/apresentação. Não recebe alterações em `ajustarLote`.
- `lotes_montagem_ajustes` e `_itens`: histórico da quantidade de cestas afetadas, operação e unidades por cesta; não identifica cestas individuais.
- `movimentacoes_insumos`: razão físico, com referências LOTE_MONTAGEM e AJUSTE_LOTE; montagem debita, remoção e desmontagem creditam. Quantidades estritamente positivas.
- `movimentacoes_cestas`: montagem, desmontagem, entrega e estorno; `reservas_insumos` registra consumo do planejamento.
- `pastoral.montar_cestas(bigint, integer, bigint) RETURNS bigint`: cria snapshot, lote, movimentos e consumo das reservas. O banco inspecionado ainda não inclui todas as migrations locais de 20260905; a suíte temporária aplica essas migrations incrementalmente.
- Ajuste e desmontagem são transações de `PostgresEstoque`, sem função PostgreSQL própria. Ambas usam o lock global `pastoral.bloquear_estoque()` da migration local de 20260905 e lock de linha no lote.
- Antes da correção, `GET /api/v1/estoque/lotes-montagem` e `/:id` liam o snapshot; `POST /:id/ajustes` e `/:id/desmontar` validavam inteiros positivos e permissões CESTA_AJUSTAR_LOTE/CESTA_DESMONTAR.
- Regressões existentes: `tests/integration/consistency.spec.ts`, com PostgreSQL temporário real, HTTP e disputa de locks observada em `pg_stat_activity`.

Causa confirmada: a validação de remoção e a devolução da desmontagem ignoram ajustes anteriores. Há ainda ambiguidade física na desmontagem parcial depois de ajustar somente parte das cestas: o contrato não identifica quais cestas foram alteradas.

## Implementação

`20260906_001_current_lot_composition.sql` cria a view `vw_composicao_atual_lotes`: débitos de montagem/adição menos créditos de remoção/desmontagem. Nenhuma tabela nova, regravação de snapshot, alteração de movimentos históricos ou correção automática de saldos antigos.

As consultas retornam `itens[].quantidadeTotal` adicional. `quantidadePorCesta` passa a ser a média informativa do conteúdo atribuído ao lote por quantidade montada; não identifica o conteúdo de uma cesta individual quando há ajuste parcial. A desmontagem integral usa o total inteiro diretamente, sem arredondamento. O frontend exibe o total recebido, sem reconstrução de composição nem multiplicação pela quantidade de cestas. A montagem continua gerando o snapshot original e seus débitos; a view contabiliza esses débitos e os movimentos posteriores exatamente uma vez.

Remoções verificam o total atual sob os locks existentes. Cada item da mesma requisição vê os movimentos anteriores da transação, com rollback integral em falha. Movimentos zero são omitidos, o lote DESMONTADO rejeita ajuste e desmontagem, e composição legada negativa exige conferência.

### Desmontagem e disponibilidade

- Sem qualquer ajuste: a desmontagem parcial mantém a composição por cesta conhecida do snapshot e desconta seus movimentos do total efetivo.
- Com qualquer ajuste, inclusive ajuste sobre todas as cestas: parcial retorna **409 LOTE_AJUSTADO_DESMONTAGEM_PARCIAL**, com mensagem “Este lote possui ajustes e só pode ser desmontado integralmente.” A checagem ocorre dentro da transação antes de qualquer movimento.
- A integral exige todas as cestas disponíveis. Se alguma foi liberada/entregue, o sistema não adivinha qual conteúdo corresponde às cestas restantes. Ajuste nessas condições retorna **409 LOTE_AJUSTE_CESTAS_INDISPONIVEIS**.
- A integral zera `quantidade_montada` e `quantidade_disponivel`, encerrando o lote como DESMONTADO. A constraint incremental admite zero somente nesse estado. Uma parcial que esgota as cestas disponíveis mantém ESGOTADO quando ainda há cestas atribuídas ao lote.
- Listagem e detalhe retornam `possuiAjustes`, `permiteDesmontagemParcial`, `podeAjustar` e `podeDesmontar`. São condições operacionais, não autorização: RBAC continua obrigatório e cada comando revalida o estado sob lock. `permiteDesmontagemParcial` descreve a regra de composição; depende também de `podeDesmontar`.
- A composição agregada inclui o conteúdo atribuído às cestas liberadas/entregues, pois o modelo não individualiza insumos por cesta. Essa atribuição não autoriza devolver tais itens: as quantidades disponíveis e os bloqueios acima impedem isso.

### Frontend

Montagem reutiliza os use cases e contracts de ajuste/desmontagem existentes. As ações são exibidas conforme RBAC e flags retornadas. O backend antigo, sem flags, não reabilita ações por inferência. Lote ajustado só oferece desmontagem integral. Confirmação, loading, proteção de duplo envio, atualização após mutação/conflito e preservação dos dados após erro são cobertos por testes. Os novos códigos 409 têm mensagens amigáveis locais, sem exibição de mensagens internas.

A migration é incremental, transacional e reaplicável; o setup de banco temporário já carrega automaticamente arquivos posteriores a 20260905. Aplicar nos ambientes reais `database/migrations/20260906_001_current_lot_composition.sql`, depois das migrations `20260905_001_serialize_stock_operations.sql` e `20260905_002_reconcile_basket_delivery.sql` quando ainda pendentes. Implantar o backend correspondente antes do frontend. Nenhuma migration foi aplicada automaticamente ao banco configurado.

A migration preserva dados históricos e não faz reconciliação física retroativa de eventual corrupção já ocorrida. Composição negativa é rejeitada nas mutações para conferência; não há crédito automático para mascarar inconsistências antigas.

## Validação

Foram acrescentadas 18 regressões PostgreSQL/HTTP: montagem inicial, remoção seguida de integral, adição, ajustes sucessivos, apresentação nova, rollback com itens repetidos excedentes, falta de saldo, composição zero/dupla desmontagem, remoção excedente, ajuste × ajuste, ajuste × desmontagem, parcial sem ajuste, parcial bloqueada após ajuste de parte/todas as cestas, parcial anterior ao ajuste, cestas indisponíveis e repetibilidade da migration. São verificados composição, saldo físico, movimentos, histórico e estado. Não há TODOs pendentes nesses cenários.

Antes da correção, as primeiras oito regressões falhavam, incluindo duas remoções excedentes concorrentes aceitas com 201 + 201. Após a correção, a disputa observada em conexões reais retorna 201 + 409 e mantém o estoque correto. A suíte usa exclusivamente banco temporário aleatório, removido ao final. Resultados dos gates são registrados no relatório da entrega.
