# Correções de consistência — 2026-09-05

Inspeção prévia somente leitura do schema `pastoral`: funções e assinaturas
confirmadas diretamente no catálogo PostgreSQL. O snapshot estrutural em
`tests/integration/fixtures/pastoral-schema.sql` contém somente DDL, sem dados.
O mapeamento geral permanece em `database-mapping.md`.

## Divergências confirmadas antes da alteração

- Listagem/detalhe de lotes selecionam `pv.id` sem agrupá-lo (42803).
- Consumo de cesta adicional não considera `modelo_cesta_id`; autorização
  verifica existência da distribuição, mas não seu encerramento.
- Estorno depois do encerramento restaura uma liberação da distribuição fechada
  sem retornar seu saldo ao lote. A função existente também restaura o direito
  para `DISPONIVEL`, independentemente do encerramento.
- Perda e aprovação leem saldos sem um bloqueio compartilhado entre operações.
- Inventário aplica diferença contra o snapshot de abertura, mesmo se o saldo
  tiver mudado durante a contagem.

## Decisões limitadas ao modelo existente

- Manter assinaturas públicas das funções existentes.
- Serializar operações de insumos/reservas com advisory lock transacional do
  estoque único. O lock é adquirido antes dos locks de linhas e liberado pelo
  COMMIT/ROLLBACK; não permanece durante a contagem manual do inventário.
- Rejeitar conclusão de inventário cujo saldo de referência mudou. Não escolher
  silenciosamente uma política de ajuste sobre contagem desatualizada.
- Na distribuição encerrada, o estorno devolve a cesta ao lote de origem,
  aumenta a quantidade retornada da liberação e mantém o movimento de estorno.
  Preserva a restauração do direito para `DISPONIVEL` já existente no banco e
  documentada em `business-rules.md`. A distribuição permanece encerrada e
  não aceita novas retiradas.
- Cesta adicional consome somente lotes do modelo autorizado, preservando FIFO
  entre liberações compatíveis, e serializa entrega/autorização com encerramento.

As migrations são aplicadas pela suíte exclusivamente no banco temporário.
Aplicação em outro ambiente exige executar a migration antes do backend corrigido.

## Decisões de domínio pendentes

- Definir a classificação assistencial após estorno em distribuição encerrada:
  manter `DISPONIVEL` ou recalcular ausência/não atendimento. O encerramento
  classifica apenas direitos previstos para aquela distribuição; aplicar sua
  regra indiscriminadamente ao estorno alteraria também retiradas antecipadas
  de direitos previstos para outra distribuição. Esta entrega corrige a
  disponibilidade física sem introduzir essa alteração de negócio. Em corrida
  estorno/encerramento, o saldo físico converge; o status do direito ainda segue
  a ordem das duas operações existentes.
- Inventário com saldo alterado durante a contagem é rejeitado atomicamente;
  definir uma política de reconciliação da contagem com movimentos permitiria
  reaproveitá-lo. Até essa definição, deve-se iniciar nova contagem. A comparação
  detecta mudança do saldo líquido, não movimentos compensatórios de saldo zero.
