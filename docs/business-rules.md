# Regras de negócio

## Indicadores operacionais

Vagas e excedente são derivados da capacidade vigente e beneficiários ativos. Distribuição aberta tem prioridade sobre futuras planejadas. Cobertura garantida usa somente estoque físico, reservas e cestas compatíveis existentes; cobertura projetada usa média histórica e permanece identificada como projeção. Consulte `dashboard.md` para as fórmulas completas.

## Encerramento

Direito com retirada válida permanece `RETIRADO`; sem check-in vira `AUSENTE`; presente regular ou pendente já regularizado vira `NAO_ATENDIDO_ESTOQUE`; pendente ainda irregular vira `NAO_ATENDIDO_IRREGULARIDADE`. Retirada estornada não conta como entrega e o direito volta a ser classificado. A ausência é criada uma única vez. Justificativa posterior protege a vaga, mas não recupera a cesta.

O encerramento devolve ao lote exato cada saldo `liberada - consumida - retornada`. Entregas regulares e cestas adicionais participam do consumo registrado nas liberações.

As regras estruturais e transacionais do schema `pastoral` são a fonte de verdade. A API deve preservar, entre outras, a unicidade do direito regular por competência, a retirada válida única, capacidade global, não acumulação, prioridade dos regulares, estoque não negativo e histórico imutável.

## Atendimento e regularização

`classificacao_inicial` registra como o beneficiário chegou e permanece imutável. A situação atual é derivada novamente: justificativa aceita muda a ausência para `JUSTIFICADA`, regulariza a pendência e protege a vaga, mas não recupera cesta nem recoloca o direito anterior como `DISPONIVEL`.

Quem chegou `PENDENTE`, mesmo regularizado, aguarda todos os presentes inicialmente `REGULAR` que ainda possuem direito disponível. A retirada usa `distribuicao_prevista_id`, permitindo primeira entrega sem alterar o grupo recorrente. O representante declaratório fica vinculado à retirada. O estorno preserva a retirada, cria o evento de estorno, restaura o direito e audita.

Na consulta de check-ins, `classificacao`/`fila` preservam a prioridade de chegada, enquanto `situacaoOperacional`, `podeRetirar` e `motivoBloqueio` são derivados. Uma retirada `VALIDA` significa `ATENDIDO`; sem retirada válida e com direito disponível significa `AGUARDANDO`; o estorno volta a retirada para `ESTORNADA` e restaura `AGUARDANDO`. Só bloqueia a fila secundária o regular presente cujo direito está `DISPONIVEL` e possui `distribuicao_prevista_id` igual à distribuição atual. Check-in regular com `GRUPO_DIFERENTE` permanece no histórico, mas não bloqueia. Check-ins não são removidos do histórico.

## Estoque físico

Cesta adicional é autorizada separadamente do direito regular, com quantidade e justificativa explícitas. A entrega só ocorre a partir de `AUTORIZADA` e delega a `pastoral.entregar_cesta_adicional` a validação da distribuição aberta, consumo das cestas liberadas e transição para `ENTREGUE`. O estado `CANCELADA` existe na persistência, mas o schema atual não oferece uma operação de cancelamento; por isso ela não foi inventada na API.

- `saldoDisponivel = saldoFisico - saldoReservado`.
- Reserva não é saída: aprovação mantém o físico e compromete disponibilidade.
- Montagem transforma insumos em cesta, consome físico e reserva e cria snapshot do lote.
- Liberação aloca cesta para distribuição, mas não é entrega.
- Retirada é a saída física definitiva da cesta liberada.
- Estorno reverte o consumo da liberação e registra movimento inverso.
- Versões de modelo e planejamento não são sobrescritas.
- `metaItens` é `SUM(quantidade)`: dois pacotes contam como dois itens.

Perda, montagem, ajuste, desmontagem e liberação são serializados sobre os registros relevantes. Constraints e funções impedem quantidades negativas. Reforços de liberação criam novos eventos.

A composição efetiva de um lote é derivada de seus movimentos físicos, mantendo snapshot e ajustes como histórico. Remoção credita somente o que sai do lote; adição debita somente o que entra. Desmontagem devolve o conteúdo efetivo. Qualquer ajuste impede desmontagem parcial; a integral exige todas as cestas disponíveis. Sem ajustes, a parcial usa a composição conhecida por cesta. Lote totalmente desmontado tem quantidades zero e estado DESMONTADO; não aceita novo ajuste/desmontagem. Ajustes exigem todas as cestas disponíveis para não alterar conteúdo de cestas liberadas/entregues sem rastreabilidade individual.

Funções PostgreSQL existentes para operações críticas devem ser chamadas por command ports, sem duplicação em controllers ou transações redundantes. Consulte `database-mapping.md` para as assinaturas reais.

Candidaturas abertas (`AGUARDANDO`/`CONVOCADO`) são únicas por pessoa. Priorização exige justificativa e não cria prazo automático. Admissão pela fila reutiliza a operação transacional de admissão e muda a candidatura para `ADMITIDO` na mesma transação.

Competências são únicas por ano/mês. `gerar_competencia` calcula as datas pelas regras dos grupos e usa `ON CONFLICT` para não duplicar competência, distribuição ou direito regular. Remarcação altera apenas a data da distribuição e preserva histórico e direitos.

Check-in não consome direito nem cesta. A classificação é `PENDENTE` quando o direito atual aponta para outra distribuição ou o direito anterior terminou em ausência/irregularidade sem ausência `JUSTIFICADA`. `AUSENTE_JUSTIFICADO` e `NAO_ATENDIDO_ESTOQUE` não bloqueiam. O direito explicitamente associado à distribuição prevalece sobre o grupo recorrente.
