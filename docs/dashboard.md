# Dashboard e projeções

O dashboard é um read model: não persiste indicadores, saúde ou alertas. A API executa um número fixo de queries agregadas, sem consulta por beneficiário ou por insumo.

## Horizonte

O horizonte contém o mês civil atual, `+1` e `+2`. Quando a competência atual está encerrada, começa no mês seguinte. Uma competência ausente é projetada sem ser inserida no banco. A demanda projetada é a quantidade de beneficiários ativos; a próxima distribuição usa seus direitos efetivamente previstos.

## Cobertura garantida

Para o planejamento regular aprovado da próxima competência:

```text
disponível para o plano por item = saldo físico - reservas remanescentes de outros planos
capacidade por item = floor(disponível para o plano / quantidade por cesta)
capacidade de montagem = mínimo das capacidades por item
capacidade garantida = cestas compatíveis + capacidade de montagem
```

Cestas compatíveis são lotes do mesmo planejamento aprovado, disponíveis no estoque ou já liberados para a distribuição e ainda não consumidos/retornados. Assim, o insumo consumido na montagem não é contado novamente. A reserva própria continua dentro do saldo físico e protege o planejamento; não é somada ao saldo.

## Cobertura projetada

A projeção usa a média mensal das entradas de cada apresentação nos três meses civis completos anteriores. Para o deslocamento `N`, adiciona `média × N` ao recurso do item antes de recalcular o mínimo da composição. Não considera promessa de doação, sazonalidade ou probabilidade. É exibida separadamente e nunca altera a cobertura garantida.

## Saúde e alertas

- `SAUDAVEL`: cobertura de pelo menos 100%.
- `ATENCAO`: cobertura entre 80% e 99,99%.
- `CRITICO`: cobertura abaixo de 80%.
- `SEM_PLANEJAMENTO`: não há composição regular aprovada.

Insumo crítico é uma apresentação com déficit real para completar a demanda remanescente. A ordenação prioriza a menor capacidade de cestas e depois o maior déficit.

## Limitações

A composição aprovada da próxima competência é usada como referência determinística do horizonte. Mudanças futuras de modelo, perdas, consumo fora do fluxo e entradas futuras diferentes da média alteram a projeção. Ela é apoio operacional, não promessa de estoque.
