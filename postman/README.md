# Coleção Postman — Pastoral API

## Arquivos

- `pastoral-api.postman_collection.json`: coleção Postman 2.1 completa.
- `pastoral-local.postman_environment.json`: environment seguro, sem credenciais ou tokens reais.

## Importação e configuração

1. Importe os dois arquivos no Postman.
2. Selecione o environment **Pastoral Local**.
3. Ajuste `host` caso a API não esteja em `http://localhost:3000`.
4. Mantenha `baseUrl={{host}}/api/v1`.
5. Preencha as credenciais locais de `admin`, `atendimento`, `estoque` e `responsavel`.
6. Execute **01 - Auth / Login Admin**. O token é salvo automaticamente em `adminToken` e `accessToken`.

Nenhuma credencial, token ou endereço local do desenvolvedor foi versionado.

## Variáveis obrigatórias de catálogo

Alguns recursos não possuem endpoint de criação/listagem apropriado para produzir todas as dependências. Configure quando for usar os respectivos cenários:

- `pessoaId`: pessoa existente, ainda não beneficiária e elegível para o fluxo completo.
- `candidaturaPessoaId`: outra pessoa elegível para candidatura.
- `motivoDesligamentoId` e `motivoPerdaId`: IDs existentes no banco.
- `grupoAId` e `grupoBId`: vêm com os valores estruturais locais `1` e `2`; ajuste em outro ambiente.
- `beneficiarioOutraDistribuicaoId`: beneficiário com check-in na distribuição testada e direito disponível previsto para a outra distribuição; valida `DIREITO_NAO_DISPONIVEL` sem bloquear indevidamente a fila secundária.
- IDs dos cenários negativos (`distribuicaoSemCestaId`, `beneficiarioSemCestaId`, `distribuicaoEncerradaId`) devem apontar para fixtures adequadas.

A API atual não implementa endpoints de Pessoas. Por isso a coleção não inventa a pasta/rota `03 - Pessoas` e não consegue criar `pessoaId` via HTTP.

A pasta **10A - Cestas Adicionais** demonstra autorização, listagem, entrega e rejeição de uma segunda entrega. Ela reutiliza `distribuicaoId`, `beneficiarioId` e `modeloCestaId`, salvando o resultado em `cestaAdicionalId`.

## Uso individual

As pastas `02` a `21` funcionam como catálogo de operações e exemplos. Requests mutáveis são identificados por nome/descrição. Os scripts capturam automaticamente IDs retornados, incluindo beneficiário, candidatura, competência, retirada, insumo, apresentação, doador, inventário, modelo, versão, planejamento, lote e liberação.

O pre-request da coleção cria uma única variável `runId` e nomes como:

- `POSTMAN TESTE - BENEFICIARIO <runId>`;
- `Arroz Teste Postman <runId>`;
- `Doador Postman <runId>`;
- `Modelo Postman <runId>`.

Para iniciar uma nova execução com novos nomes, limpe `runId` no environment.

## Collection Runner

Para o fluxo principal, execute somente a pasta **99 - Fluxos Completos**, na ordem apresentada. Não execute a coleção inteira como se todas as pastas fossem um único fluxo: as pastas modulares contêm exemplos independentes, estados terminais e cenários negativos.

Pré-requisitos do fluxo `99`:

- API e PostgreSQL de desenvolvimento disponíveis;
- credenciais administrativas configuradas;
- `pessoaId`, `grupoAId`, `competenciaAnoTeste` e `competenciaMesTeste` válidos;
- a pessoa ainda não pode ser beneficiária;
- o ano/mês escolhido não deve ter planejamento/modelo da execução anterior.

O fluxo realiza login, admite o beneficiário, gera competência, cria doador/insumo/entrada/modelo/planejamento, aprova, monta, libera, abre, registra check-in e retirada, estorna, retira novamente, encerra e consulta resumo, dashboard e auditoria.

## Requests que alteram estado

Alteram estado todos os `POST`/`PUT`, exceto login e simulação de planejamento. Atenção especial para:

- alteração de capacidade global;
- admissão/desligamento/reativação e grupo;
- candidaturas;
- competência e distribuição;
- estoque, perda e inventário;
- planejamento, montagem, ajuste/desmontagem e liberação;
- check-in, justificativa, retirada, estorno e encerramento.

O teste de capacidade captura o valor atual e possui request de restauração separado. Execute os dois em sequência.

## Cleanup e repetibilidade

A API não possui endpoints `DELETE` nem operação geral de cleanup. Assim:

- a coleção nunca executa `DELETE`, `TRUNCATE`, `DROP` ou SQL direto;
- fixtures de insumo, doador, modelo, planejamento, competência e beneficiário permanecem;
- desligamento não equivale a exclusão e mantém histórico;
- use banco de desenvolvimento/homologação descartável;
- altere `runId` e a competência de teste para repetir fluxos mutáveis.

Não execute o fluxo completo contra produção.

## Cenários negativos

A pasta `90` cobre login inválido, ausência de token, falta de permissão, beneficiário inexistente, candidatura/check-in/retirada duplicados, retirada sem cesta, perda acima do saldo e encerramento repetido. Alguns dependem do estado criado anteriormente ou de IDs negativos explicitamente configurados.

## Newman

Para smoke tests que não dependem de credenciais:

```bash
npx newman run postman/pastoral-api.postman_collection.json \
  -e postman/pastoral-local.postman_environment.json \
  --folder "00 - Health"
```

Para o fluxo completo, use um environment local não versionado com credenciais e IDs de catálogo:

```bash
npx newman run postman/pastoral-api.postman_collection.json \
  -e postman/pastoral-local.postman_environment.json \
  --folder "99 - Fluxos Completos"
```

Não grave os valores sensíveis de uma execução de volta no arquivo versionado.
