# Observabilidade operacional

## Endpoints

- `/health`: apenas confirma que o processo HTTP está vivo.
- `/ready`: executa `SELECT 1` e informa somente disponibilidade do PostgreSQL.
- `/api/v1/admin/status`: exige autenticação e `PERFIL_GERENCIAR`; expõe contadores do pool, uptime e memória do processo, sem host, credenciais ou connection string.

## Correlação e logs

O middleware aceita um `X-Request-Id` válido ou gera UUID, devolve o cabeçalho e registra `requestId`, método, caminho, status, duração, `userId` quando autenticado e `errorCode` quando houver. Respostas normais usam `info`, autenticação/autorização negada usa `warn` e falhas inesperadas usam `error`. Bodies, tokens e parâmetros SQL não são registrados.

A tabela `pastoral.auditoria` não possui coluna para request ID. Não foi criada migration apenas para essa correlação: o request permanece na trilha técnica, enquanto a auditoria mantém usuário, entidade, operação e instante.

## Timeouts e queries lentas

- conexão: `DB_CONNECTION_TIMEOUT_MS`, padrão `5000`;
- statement: `DB_STATEMENT_TIMEOUT_MS`, padrão `15000`;
- lock: `DB_LOCK_TIMEOUT_MS`, padrão `5000`;
- alerta de query lenta: `DB_SLOW_QUERY_MS`, padrão `500`.

O observador é instalado centralmente nos clientes criados pelo pool. O alerta contém apenas duração e limiar, nunca SQL ou parâmetros.

## Ordem de locks revisada

- retirada: distribuição, direito e consumo das liberações;
- estorno: retirada e reversão das liberações consumidas;
- montagem: versão/reservas e apresentações na ordem da função PostgreSQL;
- liberação: distribuição antes do lote;
- encerramento: distribuição, direitos, liberações e lotes;
- inventário: inventário e seus itens/apresentações.

As ordens já validadas foram preservadas. `lock_timeout` limita espera anormal; deadlock, serialização e lock indisponível são convertidos em conflitos seguros e repetíveis.
