# Mapeamento do banco PostgreSQL

## Auditoria operacional

`pastoral.auditoria` possui PK bigint, FK opcional para usuário, entidade/operação textuais, entidadeId opcional, motivo, timestamp e snapshots JSONB anterior/novo. Existem índices por data e por `(entidade, entidade_id)`, sem triggers próprios e sem coluna request ID. A expectativa é crescimento append-only proporcional às mutações auditáveis; não há política de retenção definida no schema.

A API não retorna snapshots na listagem. O detalhe remove recursivamente chaves de senha, password, secret, token, authorization, connection string e equivalentes. Nenhuma alteração de schema ou índice foi necessária.

## Read models do dashboard

O dashboard reutiliza `vw_capacidade_atual`, `vw_saldo_insumos`, `vw_disponibilidade_insumos`, `vw_reservas_insumos_ativas` e `vw_cestas_liberadas_distribuicao`, complementadas por CTEs/aggregates sobre direitos, planejamento, lotes e movimentos. Nenhuma view, índice ou tabela foi criada nesta etapa.

A compatibilidade automática de lote usa `lotes_montagem.planejamento_versao_id`: apenas lotes da versão aprovada analisada são somados. O schema não relaciona diretamente uma versão de lote a versões futuras ainda inexistentes; por isso a projeção de três meses documenta a composição aprovada de referência como limitação explícita.

## Validação do encerramento

`pastoral.encerrar_distribuicao` é reutilizada pela API. Ela bloqueia a distribuição e os direitos, classifica direitos abertos, cria ausências idempotentemente, reconcilia cada liberação e devolve remanescentes ao lote exato antes de marcar a distribuição como `ENCERRADA`.

O enum lógico de `movimentacoes_cestas.tipo` não possui um tipo para retorno de remanescente. A função atualiza `quantidade_retornada` e o saldo do lote, mas não cria movimentação separada; a API preserva esse comportamento do schema em vez de inventar DDL.

Para manter uma ordem única de locks na concorrência liberação × encerramento, o adapter de liberação bloqueia primeiro a distribuição e rejeita explicitamente distribuições encerradas antes de chamar `pastoral.liberar_cestas`.

Gerado por inspeção somente leitura do schema `pastoral` em 2026-08-30T10:45:43.289Z.
Credenciais e endereço do servidor foram deliberadamente omitidos.

## Resumo

- PostgreSQL: 17.0
- Tabelas: 57
- Views: 7
- Sequences: 55
- Constraints: 249
- Índices: 110
- Triggers/eventos: 4
- Funções próprias: 19
- Funções fornecidas por extensões no schema: 67
- Enums PostgreSQL: nenhum; estados são protegidos por CHECKs/varchar

## Tabelas, colunas, chaves e índices

### `pastoral.arquivos`

| Coluna          | Tipo                       | Nulo | Default |
| --------------- | -------------------------- | ---: | ------- |
| `id`            | `bigint`                   |   NO |         |
| `storage_key`   | `character varying`        |   NO |         |
| `nome_original` | `character varying`        |  YES |         |
| `mime_type`     | `character varying`        |  YES |         |
| `tamanho_bytes` | `bigint`                   |  YES |         |
| `criado_em`     | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `arquivos_pkey`: PRIMARY KEY (id)
- `arquivos_storage_key_key`: UNIQUE (storage_key)
- `arquivos_tamanho_bytes_check`: CHECK (tamanho_bytes IS NULL OR tamanho_bytes >= 0)

**Índices**

- `arquivos_pkey`: CREATE UNIQUE INDEX arquivos_pkey ON pastoral.arquivos USING btree (id)
- `arquivos_storage_key_key`: CREATE UNIQUE INDEX arquivos_storage_key_key ON pastoral.arquivos USING btree (storage_key)

### `pastoral.auditoria`

| Coluna            | Tipo                       | Nulo | Default |
| ----------------- | -------------------------- | ---: | ------- |
| `id`              | `bigint`                   |   NO |         |
| `usuario_id`      | `bigint`                   |  YES |         |
| `entidade`        | `character varying`        |   NO |         |
| `entidade_id`     | `bigint`                   |  YES |         |
| `operacao`        | `character varying`        |   NO |         |
| `estado_anterior` | `jsonb`                    |  YES |         |
| `estado_novo`     | `jsonb`                    |  YES |         |
| `motivo`          | `text`                     |  YES |         |
| `ocorrido_em`     | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `auditoria_pkey`: PRIMARY KEY (id)
- `auditoria_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `auditoria_pkey`: CREATE UNIQUE INDEX auditoria_pkey ON pastoral.auditoria USING btree (id)
- `idx_auditoria_data`: CREATE INDEX idx_auditoria_data ON pastoral.auditoria USING btree (ocorrido_em)
- `idx_auditoria_entidade`: CREATE INDEX idx_auditoria_entidade ON pastoral.auditoria USING btree (entidade, entidade_id)

### `pastoral.ausencias`

| Coluna                 | Tipo                       | Nulo | Default                                |
| ---------------------- | -------------------------- | ---: | -------------------------------------- |
| `id`                   | `bigint`                   |   NO |                                        |
| `direito_beneficio_id` | `bigint`                   |   NO |                                        |
| `status`               | `character varying`        |   NO | 'SEM_JUSTIFICATIVA'::character varying |
| `identificado_em`      | `timestamp with time zone` |   NO | now()                                  |

**Constraints**

- `ausencias_direito_beneficio_id_fkey`: FOREIGN KEY (direito_beneficio_id) REFERENCES pastoral.direitos_beneficio(id)
- `ausencias_direito_beneficio_id_key`: UNIQUE (direito_beneficio_id)
- `ausencias_pkey`: PRIMARY KEY (id)
- `ausencias_status_check`: CHECK (status::text = ANY (ARRAY['SEM_JUSTIFICATIVA'::character varying, 'JUSTIFICATIVA_PENDENTE'::character varying, 'JUSTIFICADA'::character varying, 'JUSTIFICATIVA_REJEITADA'::character varying]::text[]))

**Índices**

- `ausencias_direito_beneficio_id_key`: CREATE UNIQUE INDEX ausencias_direito_beneficio_id_key ON pastoral.ausencias USING btree (direito_beneficio_id)
- `ausencias_pkey`: CREATE UNIQUE INDEX ausencias_pkey ON pastoral.ausencias USING btree (id)

### `pastoral.beneficiarios`

| Coluna                  | Tipo                       | Nulo | Default                      |
| ----------------------- | -------------------------- | ---: | ---------------------------- |
| `id`                    | `bigint`                   |   NO |                              |
| `pessoa_id`             | `bigint`                   |   NO |                              |
| `grupo_distribuicao_id` | `bigint`                   |  YES |                              |
| `status`                | `character varying`        |   NO | 'ATIVO'::character varying   |
| `origem_cadastro`       | `character varying`        |   NO | 'SISTEMA'::character varying |
| `data_admissao`         | `date`                     |   NO | CURRENT_DATE                 |
| `criado_em`             | `timestamp with time zone` |   NO | now()                        |
| `atualizado_em`         | `timestamp with time zone` |   NO | now()                        |

**Constraints**

- `beneficiarios_grupo_distribuicao_id_fkey`: FOREIGN KEY (grupo_distribuicao_id) REFERENCES pastoral.grupos_distribuicao(id)
- `beneficiarios_origem_cadastro_check`: CHECK (origem_cadastro::text = ANY (ARRAY['SISTEMA'::character varying, 'LEGADO'::character varying]::text[]))
- `beneficiarios_pessoa_id_fkey`: FOREIGN KEY (pessoa_id) REFERENCES pastoral.pessoas(id)
- `beneficiarios_pessoa_id_key`: UNIQUE (pessoa_id)
- `beneficiarios_pkey`: PRIMARY KEY (id)
- `beneficiarios_status_check`: CHECK (status::text = ANY (ARRAY['ATIVO'::character varying, 'DESLIGADO'::character varying]::text[]))

**Índices**

- `beneficiarios_pessoa_id_key`: CREATE UNIQUE INDEX beneficiarios_pessoa_id_key ON pastoral.beneficiarios USING btree (pessoa_id)
- `beneficiarios_pkey`: CREATE UNIQUE INDEX beneficiarios_pkey ON pastoral.beneficiarios USING btree (id)
- `idx_beneficiarios_ativos_grupo`: CREATE INDEX idx_beneficiarios_ativos_grupo ON pastoral.beneficiarios USING btree (grupo_distribuicao_id, id) WHERE ((status)::text = 'ATIVO'::text)

### `pastoral.beneficiarios_desligamentos`

| Coluna                   | Tipo                       | Nulo | Default |
| ------------------------ | -------------------------- | ---: | ------- |
| `id`                     | `bigint`                   |   NO |         |
| `beneficiario_id`        | `bigint`                   |   NO |         |
| `motivo_desligamento_id` | `bigint`                   |   NO |         |
| `observacao`             | `text`                     |  YES |         |
| `usuario_responsavel_id` | `bigint`                   |   NO |         |
| `ocorrido_em`            | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `beneficiarios_desligamentos_beneficiario_id_fkey`: FOREIGN KEY (beneficiario_id) REFERENCES pastoral.beneficiarios(id)
- `beneficiarios_desligamentos_motivo_desligamento_id_fkey`: FOREIGN KEY (motivo_desligamento_id) REFERENCES pastoral.motivos_desligamento(id)
- `beneficiarios_desligamentos_pkey`: PRIMARY KEY (id)
- `beneficiarios_desligamentos_usuario_responsavel_id_fkey`: FOREIGN KEY (usuario_responsavel_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `beneficiarios_desligamentos_pkey`: CREATE UNIQUE INDEX beneficiarios_desligamentos_pkey ON pastoral.beneficiarios_desligamentos USING btree (id)

### `pastoral.beneficiarios_grupos_historico`

| Coluna             | Tipo                       | Nulo | Default |
| ------------------ | -------------------------- | ---: | ------- |
| `id`               | `bigint`                   |   NO |         |
| `beneficiario_id`  | `bigint`                   |   NO |         |
| `grupo_origem_id`  | `bigint`                   |  YES |         |
| `grupo_destino_id` | `bigint`                   |   NO |         |
| `vigencia_inicio`  | `timestamp with time zone` |   NO | now()   |
| `motivo`           | `text`                     |  YES |         |
| `usuario_id`       | `bigint`                   |   NO |         |

**Constraints**

- `beneficiarios_grupos_historico_beneficiario_id_fkey`: FOREIGN KEY (beneficiario_id) REFERENCES pastoral.beneficiarios(id)
- `beneficiarios_grupos_historico_grupo_destino_id_fkey`: FOREIGN KEY (grupo_destino_id) REFERENCES pastoral.grupos_distribuicao(id)
- `beneficiarios_grupos_historico_grupo_origem_id_fkey`: FOREIGN KEY (grupo_origem_id) REFERENCES pastoral.grupos_distribuicao(id)
- `beneficiarios_grupos_historico_pkey`: PRIMARY KEY (id)
- `beneficiarios_grupos_historico_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `beneficiarios_grupos_historico_pkey`: CREATE UNIQUE INDEX beneficiarios_grupos_historico_pkey ON pastoral.beneficiarios_grupos_historico USING btree (id)

### `pastoral.candidaturas`

| Coluna                     | Tipo                       | Nulo | Default                         |
| -------------------------- | -------------------------- | ---: | ------------------------------- |
| `id`                       | `bigint`                   |   NO |                                 |
| `pessoa_id`                | `bigint`                   |   NO |                                 |
| `status`                   | `character varying`        |   NO | 'AGUARDANDO'::character varying |
| `data_entrada`             | `timestamp with time zone` |   NO | now()                           |
| `prioridade_excepcional`   | `boolean`                  |   NO | false                           |
| `justificativa_prioridade` | `text`                     |  YES |                                 |
| `usuario_priorizacao_id`   | `bigint`                   |  YES |                                 |
| `criado_em`                | `timestamp with time zone` |   NO | now()                           |
| `atualizado_em`            | `timestamp with time zone` |   NO | now()                           |

**Constraints**

- `candidaturas_check`: CHECK (NOT prioridade_excepcional OR justificativa_prioridade IS NOT NULL)
- `candidaturas_pessoa_id_fkey`: FOREIGN KEY (pessoa_id) REFERENCES pastoral.pessoas(id)
- `candidaturas_pkey`: PRIMARY KEY (id)
- `candidaturas_status_check`: CHECK (status::text = ANY (ARRAY['AGUARDANDO'::character varying, 'CONVOCADO'::character varying, 'ADMITIDO'::character varying, 'NAO_LOCALIZADO'::character varying, 'DESISTIU'::character varying, 'CANCELADO'::character varying]::text[]))
- `candidaturas_usuario_priorizacao_id_fkey`: FOREIGN KEY (usuario_priorizacao_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `candidaturas_pkey`: CREATE UNIQUE INDEX candidaturas_pkey ON pastoral.candidaturas USING btree (id)
- `idx_candidaturas_fila`: CREATE INDEX idx_candidaturas_fila ON pastoral.candidaturas USING btree (prioridade_excepcional DESC, data_entrada, id) WHERE ((status)::text = 'AGUARDANDO'::text)
- `uq_candidatura_aberta_pessoa`: CREATE UNIQUE INDEX uq_candidatura_aberta_pessoa ON pastoral.candidaturas USING btree (pessoa_id) WHERE ((status)::text = ANY ((ARRAY['AGUARDANDO'::character varying, 'CONVOCADO'::character varying])::text[]))

### `pastoral.candidaturas_tentativas_contato`

| Coluna           | Tipo                       | Nulo | Default |
| ---------------- | -------------------------- | ---: | ------- |
| `id`             | `bigint`                   |   NO |         |
| `candidatura_id` | `bigint`                   |   NO |         |
| `usuario_id`     | `bigint`                   |   NO |         |
| `resultado`      | `character varying`        |  YES |         |
| `observacao`     | `text`                     |  YES |         |
| `ocorrido_em`    | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `candidaturas_tentativas_contato_candidatura_id_fkey`: FOREIGN KEY (candidatura_id) REFERENCES pastoral.candidaturas(id)
- `candidaturas_tentativas_contato_pkey`: PRIMARY KEY (id)
- `candidaturas_tentativas_contato_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `candidaturas_tentativas_contato_pkey`: CREATE UNIQUE INDEX candidaturas_tentativas_contato_pkey ON pastoral.candidaturas_tentativas_contato USING btree (id)

### `pastoral.categorias_prioridade_insumo`

| Coluna             | Tipo                | Nulo | Default |
| ------------------ | ------------------- | ---: | ------- |
| `id`               | `bigint`            |   NO |         |
| `codigo`           | `character varying` |   NO |         |
| `descricao`        | `character varying` |   NO |         |
| `ordem_prioridade` | `smallint`          |   NO |         |

**Constraints**

- `categorias_prioridade_insumo_codigo_key`: UNIQUE (codigo)
- `categorias_prioridade_insumo_pkey`: PRIMARY KEY (id)

**Índices**

- `categorias_prioridade_insumo_codigo_key`: CREATE UNIQUE INDEX categorias_prioridade_insumo_codigo_key ON pastoral.categorias_prioridade_insumo USING btree (codigo)
- `categorias_prioridade_insumo_pkey`: CREATE UNIQUE INDEX categorias_prioridade_insumo_pkey ON pastoral.categorias_prioridade_insumo USING btree (id)

### `pastoral.cestas_adicionais`

| Coluna                   | Tipo                       | Nulo | Default                         |
| ------------------------ | -------------------------- | ---: | ------------------------------- |
| `id`                     | `bigint`                   |   NO |                                 |
| `beneficiario_id`        | `bigint`                   |   NO |                                 |
| `distribuicao_id`        | `bigint`                   |   NO |                                 |
| `modelo_cesta_id`        | `bigint`                   |   NO |                                 |
| `quantidade`             | `integer`                  |   NO | 1                               |
| `justificativa`          | `text`                     |   NO |                                 |
| `usuario_autorizador_id` | `bigint`                   |   NO |                                 |
| `autorizado_em`          | `timestamp with time zone` |   NO | now()                           |
| `usuario_entrega_id`     | `bigint`                   |  YES |                                 |
| `entregue_em`            | `timestamp with time zone` |  YES |                                 |
| `status`                 | `character varying`        |   NO | 'AUTORIZADA'::character varying |

**Constraints**

- `cestas_adicionais_beneficiario_id_fkey`: FOREIGN KEY (beneficiario_id) REFERENCES pastoral.beneficiarios(id)
- `cestas_adicionais_distribuicao_id_fkey`: FOREIGN KEY (distribuicao_id) REFERENCES pastoral.distribuicoes(id)
- `cestas_adicionais_modelo_cesta_id_fkey`: FOREIGN KEY (modelo_cesta_id) REFERENCES pastoral.modelos_cesta(id)
- `cestas_adicionais_pkey`: PRIMARY KEY (id)
- `cestas_adicionais_quantidade_check`: CHECK (quantidade > 0)
- `cestas_adicionais_status_check`: CHECK (status::text = ANY (ARRAY['AUTORIZADA'::character varying, 'ENTREGUE'::character varying, 'CANCELADA'::character varying]::text[]))
- `cestas_adicionais_usuario_autorizador_id_fkey`: FOREIGN KEY (usuario_autorizador_id) REFERENCES pastoral.usuarios(id)
- `cestas_adicionais_usuario_entrega_id_fkey`: FOREIGN KEY (usuario_entrega_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `cestas_adicionais_pkey`: CREATE UNIQUE INDEX cestas_adicionais_pkey ON pastoral.cestas_adicionais USING btree (id)

### `pastoral.competencias`

| Coluna      | Tipo                       | Nulo | Default                     |
| ----------- | -------------------------- | ---: | --------------------------- |
| `id`        | `bigint`                   |   NO |                             |
| `ano`       | `smallint`                 |   NO |                             |
| `mes`       | `smallint`                 |   NO |                             |
| `status`    | `character varying`        |   NO | 'ABERTA'::character varying |
| `criado_em` | `timestamp with time zone` |   NO | now()                       |

**Constraints**

- `competencias_ano_mes_key`: UNIQUE (ano, mes)
- `competencias_mes_check`: CHECK (mes >= 1 AND mes <= 12)
- `competencias_pkey`: PRIMARY KEY (id)
- `competencias_status_check`: CHECK (status::text = ANY (ARRAY['ABERTA'::character varying, 'ENCERRADA'::character varying]::text[]))

**Índices**

- `competencias_ano_mes_key`: CREATE UNIQUE INDEX competencias_ano_mes_key ON pastoral.competencias USING btree (ano, mes)
- `competencias_pkey`: CREATE UNIQUE INDEX competencias_pkey ON pastoral.competencias USING btree (id)

### `pastoral.configuracoes_capacidade`

| Coluna                   | Tipo                       | Nulo | Default |
| ------------------------ | -------------------------- | ---: | ------- |
| `id`                     | `bigint`                   |   NO |         |
| `capacidade`             | `integer`                  |   NO |         |
| `vigencia_inicio`        | `timestamp with time zone` |   NO | now()   |
| `justificativa`          | `text`                     |   NO |         |
| `usuario_responsavel_id` | `bigint`                   |   NO |         |
| `criado_em`              | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `configuracoes_capacidade_capacidade_check`: CHECK (capacidade > 0)
- `configuracoes_capacidade_pkey`: PRIMARY KEY (id)
- `configuracoes_capacidade_usuario_responsavel_id_fkey`: FOREIGN KEY (usuario_responsavel_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `configuracoes_capacidade_pkey`: CREATE UNIQUE INDEX configuracoes_capacidade_pkey ON pastoral.configuracoes_capacidade USING btree (id)
- `idx_capacidade_vigencia`: CREATE INDEX idx_capacidade_vigencia ON pastoral.configuracoes_capacidade USING btree (vigencia_inicio DESC)

### `pastoral.direitos_beneficio`

| Coluna                     | Tipo                       | Nulo | Default                                  |
| -------------------------- | -------------------------- | ---: | ---------------------------------------- |
| `id`                       | `bigint`                   |   NO |                                          |
| `beneficiario_id`          | `bigint`                   |   NO |                                          |
| `competencia_id`           | `bigint`                   |   NO |                                          |
| `distribuicao_prevista_id` | `bigint`                   |  YES |                                          |
| `tipo`                     | `character varying`        |   NO | 'REGULAR'::character varying             |
| `status`                   | `character varying`        |   NO | 'DISPONIVEL'::character varying          |
| `origem`                   | `character varying`        |   NO | 'GERACAO_COMPETENCIA'::character varying |
| `criado_em`                | `timestamp with time zone` |   NO | now()                                    |
| `atualizado_em`            | `timestamp with time zone` |   NO | now()                                    |

**Constraints**

- `ck_direitos_beneficio_status`: CHECK (status::text = ANY (ARRAY['DISPONIVEL'::character varying, 'RETIRADO'::character varying, 'AUSENTE'::character varying, 'AUSENTE_JUSTIFICADO'::character varying, 'AUSENTE_NAO_JUSTIFICADO'::character varying, 'NAO_ATENDIDO_ESTOQUE'::character varying, 'NAO_ATENDIDO_IRREGULARIDADE'::character varying, 'ENCERRADO'::character varying]::text[]))
- `direitos_beneficio_beneficiario_id_competencia_id_tipo_key`: UNIQUE (beneficiario_id, competencia_id, tipo)
- `direitos_beneficio_beneficiario_id_fkey`: FOREIGN KEY (beneficiario_id) REFERENCES pastoral.beneficiarios(id)
- `direitos_beneficio_competencia_id_fkey`: FOREIGN KEY (competencia_id) REFERENCES pastoral.competencias(id)
- `direitos_beneficio_distribuicao_prevista_id_fkey`: FOREIGN KEY (distribuicao_prevista_id) REFERENCES pastoral.distribuicoes(id)
- `direitos_beneficio_pkey`: PRIMARY KEY (id)
- `direitos_beneficio_tipo_check`: CHECK (tipo::text = 'REGULAR'::text)

**Índices**

- `direitos_beneficio_beneficiario_id_competencia_id_tipo_key`: CREATE UNIQUE INDEX direitos_beneficio_beneficiario_id_competencia_id_tipo_key ON pastoral.direitos_beneficio USING btree (beneficiario_id, competencia_id, tipo)
- `direitos_beneficio_pkey`: CREATE UNIQUE INDEX direitos_beneficio_pkey ON pastoral.direitos_beneficio USING btree (id)
- `idx_direitos_disponiveis`: CREATE INDEX idx_direitos_disponiveis ON pastoral.direitos_beneficio USING btree (distribuicao_prevista_id, beneficiario_id) WHERE ((status)::text = 'DISPONIVEL'::text)

### `pastoral.distribuicoes`

| Coluna                    | Tipo                       | Nulo | Default                        |
| ------------------------- | -------------------------- | ---: | ------------------------------ |
| `id`                      | `bigint`                   |   NO |                                |
| `competencia_id`          | `bigint`                   |   NO |                                |
| `grupo_distribuicao_id`   | `bigint`                   |   NO |                                |
| `data_prevista`           | `date`                     |   NO |                                |
| `data_real`               | `date`                     |  YES |                                |
| `status`                  | `character varying`        |   NO | 'PLANEJADA'::character varying |
| `usuario_abertura_id`     | `bigint`                   |  YES |                                |
| `abertura_em`             | `timestamp with time zone` |  YES |                                |
| `usuario_encerramento_id` | `bigint`                   |  YES |                                |
| `encerramento_em`         | `timestamp with time zone` |  YES |                                |
| `criado_em`               | `timestamp with time zone` |   NO | now()                          |
| `atualizado_em`           | `timestamp with time zone` |   NO | now()                          |

**Constraints**

- `distribuicoes_competencia_id_fkey`: FOREIGN KEY (competencia_id) REFERENCES pastoral.competencias(id)
- `distribuicoes_competencia_id_grupo_distribuicao_id_key`: UNIQUE (competencia_id, grupo_distribuicao_id)
- `distribuicoes_grupo_distribuicao_id_fkey`: FOREIGN KEY (grupo_distribuicao_id) REFERENCES pastoral.grupos_distribuicao(id)
- `distribuicoes_pkey`: PRIMARY KEY (id)
- `distribuicoes_status_check`: CHECK (status::text = ANY (ARRAY['PLANEJADA'::character varying, 'PREPARADA'::character varying, 'ABERTA'::character varying, 'ENCERRADA'::character varying]::text[]))
- `distribuicoes_usuario_abertura_id_fkey`: FOREIGN KEY (usuario_abertura_id) REFERENCES pastoral.usuarios(id)
- `distribuicoes_usuario_encerramento_id_fkey`: FOREIGN KEY (usuario_encerramento_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `distribuicoes_competencia_id_grupo_distribuicao_id_key`: CREATE UNIQUE INDEX distribuicoes_competencia_id_grupo_distribuicao_id_key ON pastoral.distribuicoes USING btree (competencia_id, grupo_distribuicao_id)
- `distribuicoes_pkey`: CREATE UNIQUE INDEX distribuicoes_pkey ON pastoral.distribuicoes USING btree (id)
- `idx_distribuicoes_data`: CREATE INDEX idx_distribuicoes_data ON pastoral.distribuicoes USING btree (data_prevista)

### `pastoral.distribuicoes_checkins`

| Coluna                  | Tipo                       | Nulo | Default |
| ----------------------- | -------------------------- | ---: | ------- |
| `id`                    | `bigint`                   |   NO |         |
| `distribuicao_id`       | `bigint`                   |   NO |         |
| `beneficiario_id`       | `bigint`                   |   NO |         |
| `classificacao_inicial` | `character varying`        |   NO |         |
| `usuario_id`            | `bigint`                   |   NO |         |
| `ocorrido_em`           | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `distribuicoes_checkins_beneficiario_id_fkey`: FOREIGN KEY (beneficiario_id) REFERENCES pastoral.beneficiarios(id)
- `distribuicoes_checkins_classificacao_inicial_check`: CHECK (classificacao_inicial::text = ANY (ARRAY['REGULAR'::character varying, 'PENDENTE'::character varying]::text[]))
- `distribuicoes_checkins_distribuicao_id_beneficiario_id_key`: UNIQUE (distribuicao_id, beneficiario_id)
- `distribuicoes_checkins_distribuicao_id_fkey`: FOREIGN KEY (distribuicao_id) REFERENCES pastoral.distribuicoes(id)
- `distribuicoes_checkins_pkey`: PRIMARY KEY (id)
- `distribuicoes_checkins_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `distribuicoes_checkins_distribuicao_id_beneficiario_id_key`: CREATE UNIQUE INDEX distribuicoes_checkins_distribuicao_id_beneficiario_id_key ON pastoral.distribuicoes_checkins USING btree (distribuicao_id, beneficiario_id)
- `distribuicoes_checkins_pkey`: CREATE UNIQUE INDEX distribuicoes_checkins_pkey ON pastoral.distribuicoes_checkins USING btree (id)
- `idx_checkins_fila`: CREATE INDEX idx_checkins_fila ON pastoral.distribuicoes_checkins USING btree (distribuicao_id, ocorrido_em, id)

### `pastoral.distribuicoes_historico`

| Coluna            | Tipo                       | Nulo | Default |
| ----------------- | -------------------------- | ---: | ------- |
| `id`              | `bigint`                   |   NO |         |
| `distribuicao_id` | `bigint`                   |   NO |         |
| `tipo_evento`     | `character varying`        |   NO |         |
| `data_anterior`   | `date`                     |  YES |         |
| `data_nova`       | `date`                     |  YES |         |
| `motivo`          | `text`                     |  YES |         |
| `usuario_id`      | `bigint`                   |   NO |         |
| `ocorrido_em`     | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `distribuicoes_historico_distribuicao_id_fkey`: FOREIGN KEY (distribuicao_id) REFERENCES pastoral.distribuicoes(id)
- `distribuicoes_historico_pkey`: PRIMARY KEY (id)
- `distribuicoes_historico_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `distribuicoes_historico_pkey`: CREATE UNIQUE INDEX distribuicoes_historico_pkey ON pastoral.distribuicoes_historico USING btree (id)

### `pastoral.distribuicoes_liberacoes_cestas`

| Coluna                 | Tipo                       | Nulo | Default |
| ---------------------- | -------------------------- | ---: | ------- |
| `id`                   | `bigint`                   |   NO |         |
| `distribuicao_id`      | `bigint`                   |   NO |         |
| `lote_montagem_id`     | `bigint`                   |   NO |         |
| `quantidade_liberada`  | `integer`                  |   NO |         |
| `quantidade_consumida` | `integer`                  |   NO | 0       |
| `quantidade_retornada` | `integer`                  |   NO | 0       |
| `usuario_estoque_id`   | `bigint`                   |   NO |         |
| `liberado_em`          | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `distribuicoes_liberacoes_cestas_check`: CHECK ((quantidade_consumida + quantidade_retornada) <= quantidade_liberada)
- `distribuicoes_liberacoes_cestas_distribuicao_id_fkey`: FOREIGN KEY (distribuicao_id) REFERENCES pastoral.distribuicoes(id)
- `distribuicoes_liberacoes_cestas_lote_montagem_id_fkey`: FOREIGN KEY (lote_montagem_id) REFERENCES pastoral.lotes_montagem(id)
- `distribuicoes_liberacoes_cestas_pkey`: PRIMARY KEY (id)
- `distribuicoes_liberacoes_cestas_quantidade_consumida_check`: CHECK (quantidade_consumida >= 0)
- `distribuicoes_liberacoes_cestas_quantidade_liberada_check`: CHECK (quantidade_liberada > 0)
- `distribuicoes_liberacoes_cestas_quantidade_retornada_check`: CHECK (quantidade_retornada >= 0)
- `distribuicoes_liberacoes_cestas_usuario_estoque_id_fkey`: FOREIGN KEY (usuario_estoque_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `distribuicoes_liberacoes_cestas_pkey`: CREATE UNIQUE INDEX distribuicoes_liberacoes_cestas_pkey ON pastoral.distribuicoes_liberacoes_cestas USING btree (id)
- `idx_liberacoes_distribuicao`: CREATE INDEX idx_liberacoes_distribuicao ON pastoral.distribuicoes_liberacoes_cestas USING btree (distribuicao_id, liberado_em, id)

### `pastoral.doadores`

| Coluna       | Tipo                       | Nulo | Default |
| ------------ | -------------------------- | ---: | ------- |
| `id`         | `bigint`                   |   NO |         |
| `tipo`       | `character varying`        |   NO |         |
| `nome`       | `character varying`        |   NO |         |
| `telefone`   | `character varying`        |  YES |         |
| `observacao` | `text`                     |  YES |         |
| `ativo`      | `boolean`                  |   NO | true    |
| `criado_em`  | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `doadores_pkey`: PRIMARY KEY (id)
- `doadores_tipo_check`: CHECK (tipo::text = ANY (ARRAY['PESSOA'::character varying, 'INSTITUICAO'::character varying]::text[]))

**Índices**

- `doadores_pkey`: CREATE UNIQUE INDEX doadores_pkey ON pastoral.doadores USING btree (id)

### `pastoral.entradas_estoque`

| Coluna         | Tipo                       | Nulo | Default      |
| -------------- | -------------------------- | ---: | ------------ |
| `id`           | `bigint`                   |   NO |              |
| `tipo`         | `character varying`        |   NO |              |
| `doador_id`    | `bigint`                   |  YES |              |
| `usuario_id`   | `bigint`                   |   NO |              |
| `data_entrada` | `date`                     |   NO | CURRENT_DATE |
| `observacao`   | `text`                     |  YES |              |
| `criado_em`    | `timestamp with time zone` |   NO | now()        |

**Constraints**

- `entradas_estoque_doador_id_fkey`: FOREIGN KEY (doador_id) REFERENCES pastoral.doadores(id)
- `entradas_estoque_pkey`: PRIMARY KEY (id)
- `entradas_estoque_tipo_check`: CHECK (tipo::text = ANY (ARRAY['DOACAO'::character varying, 'COMPRA'::character varying, 'SALDO_INICIAL'::character varying, 'AJUSTE_POSITIVO'::character varying]::text[]))
- `entradas_estoque_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `entradas_estoque_pkey`: CREATE UNIQUE INDEX entradas_estoque_pkey ON pastoral.entradas_estoque USING btree (id)

### `pastoral.entradas_estoque_itens`

| Coluna                   | Tipo      | Nulo | Default |
| ------------------------ | --------- | ---: | ------- |
| `id`                     | `bigint`  |   NO |         |
| `entrada_estoque_id`     | `bigint`  |   NO |         |
| `apresentacao_insumo_id` | `bigint`  |   NO |         |
| `quantidade`             | `integer` |   NO |         |
| `validade`               | `date`    |  YES |         |

**Constraints**

- `entradas_estoque_itens_apresentacao_insumo_id_fkey`: FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id)
- `entradas_estoque_itens_entrada_estoque_id_fkey`: FOREIGN KEY (entrada_estoque_id) REFERENCES pastoral.entradas_estoque(id)
- `entradas_estoque_itens_pkey`: PRIMARY KEY (id)
- `entradas_estoque_itens_quantidade_check`: CHECK (quantidade > 0)

**Índices**

- `entradas_estoque_itens_pkey`: CREATE UNIQUE INDEX entradas_estoque_itens_pkey ON pastoral.entradas_estoque_itens USING btree (id)

### `pastoral.entregas_cestas`

| Coluna               | Tipo                       | Nulo | Default |
| -------------------- | -------------------------- | ---: | ------- |
| `id`                 | `bigint`                   |   NO |         |
| `distribuicao_id`    | `bigint`                   |   NO |         |
| `retirada_id`        | `bigint`                   |  YES |         |
| `cesta_adicional_id` | `bigint`                   |  YES |         |
| `quantidade`         | `integer`                  |   NO | 1       |
| `usuario_id`         | `bigint`                   |   NO |         |
| `ocorrido_em`        | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `entregas_cestas_cesta_adicional_id_fkey`: FOREIGN KEY (cesta_adicional_id) REFERENCES pastoral.cestas_adicionais(id)
- `entregas_cestas_cesta_adicional_id_key`: UNIQUE (cesta_adicional_id)
- `entregas_cestas_check`: CHECK (((retirada_id IS NOT NULL)::integer + (cesta_adicional_id IS NOT NULL)::integer) = 1)
- `entregas_cestas_distribuicao_id_fkey`: FOREIGN KEY (distribuicao_id) REFERENCES pastoral.distribuicoes(id)
- `entregas_cestas_pkey`: PRIMARY KEY (id)
- `entregas_cestas_quantidade_check`: CHECK (quantidade > 0)
- `entregas_cestas_retirada_id_fkey`: FOREIGN KEY (retirada_id) REFERENCES pastoral.retiradas(id)
- `entregas_cestas_retirada_id_key`: UNIQUE (retirada_id)
- `entregas_cestas_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `entregas_cestas_cesta_adicional_id_key`: CREATE UNIQUE INDEX entregas_cestas_cesta_adicional_id_key ON pastoral.entregas_cestas USING btree (cesta_adicional_id)
- `entregas_cestas_pkey`: CREATE UNIQUE INDEX entregas_cestas_pkey ON pastoral.entregas_cestas USING btree (id)
- `entregas_cestas_retirada_id_key`: CREATE UNIQUE INDEX entregas_cestas_retirada_id_key ON pastoral.entregas_cestas USING btree (retirada_id)

### `pastoral.entregas_cestas_lotes`

| Coluna               | Tipo      | Nulo | Default |
| -------------------- | --------- | ---: | ------- |
| `id`                 | `bigint`  |   NO |         |
| `entrega_cesta_id`   | `bigint`  |   NO |         |
| `liberacao_cesta_id` | `bigint`  |   NO |         |
| `lote_montagem_id`   | `bigint`  |   NO |         |
| `quantidade`         | `integer` |   NO |         |

**Constraints**

- `entregas_cestas_lotes_entrega_cesta_id_fkey`: FOREIGN KEY (entrega_cesta_id) REFERENCES pastoral.entregas_cestas(id)
- `entregas_cestas_lotes_entrega_cesta_id_liberacao_cesta_id_key`: UNIQUE (entrega_cesta_id, liberacao_cesta_id)
- `entregas_cestas_lotes_liberacao_cesta_id_fkey`: FOREIGN KEY (liberacao_cesta_id) REFERENCES pastoral.distribuicoes_liberacoes_cestas(id)
- `entregas_cestas_lotes_lote_montagem_id_fkey`: FOREIGN KEY (lote_montagem_id) REFERENCES pastoral.lotes_montagem(id)
- `entregas_cestas_lotes_pkey`: PRIMARY KEY (id)
- `entregas_cestas_lotes_quantidade_check`: CHECK (quantidade > 0)

**Índices**

- `entregas_cestas_lotes_entrega_cesta_id_liberacao_cesta_id_key`: CREATE UNIQUE INDEX entregas_cestas_lotes_entrega_cesta_id_liberacao_cesta_id_key ON pastoral.entregas_cestas_lotes USING btree (entrega_cesta_id, liberacao_cesta_id)
- `entregas_cestas_lotes_pkey`: CREATE UNIQUE INDEX entregas_cestas_lotes_pkey ON pastoral.entregas_cestas_lotes USING btree (id)

### `pastoral.grupos_distribuicao`

| Coluna             | Tipo                | Nulo | Default |
| ------------------ | ------------------- | ---: | ------- |
| `id`               | `bigint`            |   NO |         |
| `codigo`           | `character varying` |   NO |         |
| `nome`             | `character varying` |   NO |         |
| `regra_calendario` | `character varying` |   NO |         |
| `ordem`            | `smallint`          |   NO |         |
| `ativo`            | `boolean`           |   NO | true    |

**Constraints**

- `grupos_distribuicao_codigo_key`: UNIQUE (codigo)
- `grupos_distribuicao_pkey`: PRIMARY KEY (id)
- `grupos_distribuicao_regra_calendario_check`: CHECK (regra_calendario::text = ANY (ARRAY['SEGUNDO_SABADO'::character varying, 'QUARTO_SABADO'::character varying, 'MANUAL'::character varying]::text[]))

**Índices**

- `grupos_distribuicao_codigo_key`: CREATE UNIQUE INDEX grupos_distribuicao_codigo_key ON pastoral.grupos_distribuicao USING btree (codigo)
- `grupos_distribuicao_pkey`: CREATE UNIQUE INDEX grupos_distribuicao_pkey ON pastoral.grupos_distribuicao USING btree (id)

### `pastoral.insumos`

| Coluna                    | Tipo                       | Nulo | Default |
| ------------------------- | -------------------------- | ---: | ------- |
| `id`                      | `bigint`                   |   NO |         |
| `nome`                    | `character varying`        |   NO |         |
| `categoria_prioridade_id` | `bigint`                   |  YES |         |
| `ativo`                   | `boolean`                  |   NO | true    |
| `criado_em`               | `timestamp with time zone` |   NO | now()   |
| `atualizado_em`           | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `insumos_categoria_prioridade_id_fkey`: FOREIGN KEY (categoria_prioridade_id) REFERENCES pastoral.categorias_prioridade_insumo(id)
- `insumos_pkey`: PRIMARY KEY (id)

**Índices**

- `insumos_pkey`: CREATE UNIQUE INDEX insumos_pkey ON pastoral.insumos USING btree (id)
- `uq_insumo_nome_ativo`: CREATE UNIQUE INDEX uq_insumo_nome_ativo ON pastoral.insumos USING btree (lower((nome)::text)) WHERE ativo

### `pastoral.insumos_apresentacoes`

| Coluna                  | Tipo                | Nulo | Default |
| ----------------------- | ------------------- | ---: | ------- |
| `id`                    | `bigint`            |   NO |         |
| `insumo_id`             | `bigint`            |   NO |         |
| `descricao`             | `character varying` |   NO |         |
| `quantidade_referencia` | `numeric`           |  YES |         |
| `unidade_medida`        | `character varying` |  YES |         |
| `ativo`                 | `boolean`           |   NO | true    |

**Constraints**

- `insumos_apresentacoes_insumo_id_descricao_key`: UNIQUE (insumo_id, descricao)
- `insumos_apresentacoes_insumo_id_fkey`: FOREIGN KEY (insumo_id) REFERENCES pastoral.insumos(id)
- `insumos_apresentacoes_pkey`: PRIMARY KEY (id)
- `insumos_apresentacoes_quantidade_referencia_check`: CHECK (quantidade_referencia IS NULL OR quantidade_referencia > 0::numeric)

**Índices**

- `insumos_apresentacoes_insumo_id_descricao_key`: CREATE UNIQUE INDEX insumos_apresentacoes_insumo_id_descricao_key ON pastoral.insumos_apresentacoes USING btree (insumo_id, descricao)
- `insumos_apresentacoes_pkey`: CREATE UNIQUE INDEX insumos_apresentacoes_pkey ON pastoral.insumos_apresentacoes USING btree (id)

### `pastoral.inventarios`

| Coluna                   | Tipo                       | Nulo | Default                     |
| ------------------------ | -------------------------- | ---: | --------------------------- |
| `id`                     | `bigint`                   |   NO |                             |
| `status`                 | `character varying`        |   NO | 'ABERTO'::character varying |
| `usuario_responsavel_id` | `bigint`                   |   NO |                             |
| `iniciado_em`            | `timestamp with time zone` |   NO | now()                       |
| `concluido_em`           | `timestamp with time zone` |  YES |                             |

**Constraints**

- `inventarios_pkey`: PRIMARY KEY (id)
- `inventarios_status_check`: CHECK (status::text = ANY (ARRAY['ABERTO'::character varying, 'CONCLUIDO'::character varying, 'CANCELADO'::character varying]::text[]))
- `inventarios_usuario_responsavel_id_fkey`: FOREIGN KEY (usuario_responsavel_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `inventarios_pkey`: CREATE UNIQUE INDEX inventarios_pkey ON pastoral.inventarios USING btree (id)

### `pastoral.inventarios_itens`

| Coluna                   | Tipo      | Nulo | Default |
| ------------------------ | --------- | ---: | ------- |
| `id`                     | `bigint`  |   NO |         |
| `inventario_id`          | `bigint`  |   NO |         |
| `apresentacao_insumo_id` | `bigint`  |   NO |         |
| `saldo_sistema`          | `integer` |   NO |         |
| `saldo_fisico`           | `integer` |   NO |         |
| `diferenca`              | `integer` |  YES |         |

**Constraints**

- `inventarios_itens_apresentacao_insumo_id_fkey`: FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id)
- `inventarios_itens_inventario_id_apresentacao_insumo_id_key`: UNIQUE (inventario_id, apresentacao_insumo_id)
- `inventarios_itens_inventario_id_fkey`: FOREIGN KEY (inventario_id) REFERENCES pastoral.inventarios(id)
- `inventarios_itens_pkey`: PRIMARY KEY (id)
- `inventarios_itens_saldo_fisico_check`: CHECK (saldo_fisico >= 0)

**Índices**

- `inventarios_itens_inventario_id_apresentacao_insumo_id_key`: CREATE UNIQUE INDEX inventarios_itens_inventario_id_apresentacao_insumo_id_key ON pastoral.inventarios_itens USING btree (inventario_id, apresentacao_insumo_id)
- `inventarios_itens_pkey`: CREATE UNIQUE INDEX inventarios_itens_pkey ON pastoral.inventarios_itens USING btree (id)

### `pastoral.justificativas_ausencia`

| Coluna                | Tipo                       | Nulo | Default                       |
| --------------------- | -------------------------- | ---: | ----------------------------- |
| `id`                  | `bigint`                   |   NO |                               |
| `ausencia_id`         | `bigint`                   |   NO |                               |
| `descricao`           | `text`                     |   NO |                               |
| `momento`             | `character varying`        |   NO |                               |
| `usuario_registro_id` | `bigint`                   |   NO |                               |
| `data_apresentacao`   | `timestamp with time zone` |   NO | now()                         |
| `decisao`             | `character varying`        |   NO | 'PENDENTE'::character varying |
| `usuario_decisao_id`  | `bigint`                   |  YES |                               |
| `data_decisao`        | `timestamp with time zone` |  YES |                               |
| `observacao_decisao`  | `text`                     |  YES |                               |

**Constraints**

- `justificativas_ausencia_ausencia_id_fkey`: FOREIGN KEY (ausencia_id) REFERENCES pastoral.ausencias(id)
- `justificativas_ausencia_decisao_check`: CHECK (decisao::text = ANY (ARRAY['PENDENTE'::character varying, 'ACEITA'::character varying, 'REJEITADA'::character varying]::text[]))
- `justificativas_ausencia_momento_check`: CHECK (momento::text = ANY (ARRAY['ANTES_DISTRIBUICAO'::character varying, 'DEPOIS_DISTRIBUICAO'::character varying]::text[]))
- `justificativas_ausencia_pkey`: PRIMARY KEY (id)
- `justificativas_ausencia_usuario_decisao_id_fkey`: FOREIGN KEY (usuario_decisao_id) REFERENCES pastoral.usuarios(id)
- `justificativas_ausencia_usuario_registro_id_fkey`: FOREIGN KEY (usuario_registro_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `justificativas_ausencia_pkey`: CREATE UNIQUE INDEX justificativas_ausencia_pkey ON pastoral.justificativas_ausencia USING btree (id)

### `pastoral.lotes_montagem`

| Coluna                   | Tipo                       | Nulo | Default                    |
| ------------------------ | -------------------------- | ---: | -------------------------- |
| `id`                     | `bigint`                   |   NO |                            |
| `planejamento_versao_id` | `bigint`                   |   NO |                            |
| `quantidade_montada`     | `integer`                  |   NO |                            |
| `quantidade_disponivel`  | `integer`                  |   NO |                            |
| `usuario_id`             | `bigint`                   |   NO |                            |
| `montado_em`             | `timestamp with time zone` |   NO | now()                      |
| `status`                 | `character varying`        |   NO | 'ATIVO'::character varying |

**Constraints**

- `lotes_montagem_check`: CHECK (quantidade_disponivel <= quantidade_montada)
- `lotes_montagem_pkey`: PRIMARY KEY (id)
- `lotes_montagem_planejamento_versao_id_fkey`: FOREIGN KEY (planejamento_versao_id) REFERENCES pastoral.planejamentos_cesta_versoes(id)
- `lotes_montagem_quantidade_disponivel_check`: CHECK (quantidade_disponivel >= 0)
- `lotes_montagem_quantidade_montada_check`: CHECK (quantidade_montada > 0)
- `lotes_montagem_status_check`: CHECK (status::text = ANY (ARRAY['ATIVO'::character varying, 'ESGOTADO'::character varying, 'DESMONTADO'::character varying]::text[]))
- `lotes_montagem_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `idx_lotes_disponiveis`: CREATE INDEX idx_lotes_disponiveis ON pastoral.lotes_montagem USING btree (montado_em, id) WHERE ((quantidade_disponivel > 0) AND ((status)::text = 'ATIVO'::text))
- `lotes_montagem_pkey`: CREATE UNIQUE INDEX lotes_montagem_pkey ON pastoral.lotes_montagem USING btree (id)

### `pastoral.lotes_montagem_ajustes`

| Coluna                       | Tipo                       | Nulo | Default |
| ---------------------------- | -------------------------- | ---: | ------- |
| `id`                         | `bigint`                   |   NO |         |
| `lote_montagem_id`           | `bigint`                   |   NO |         |
| `quantidade_cestas_afetadas` | `integer`                  |   NO |         |
| `motivo`                     | `text`                     |   NO |         |
| `usuario_id`                 | `bigint`                   |   NO |         |
| `ocorrido_em`                | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `lotes_montagem_ajustes_lote_montagem_id_fkey`: FOREIGN KEY (lote_montagem_id) REFERENCES pastoral.lotes_montagem(id)
- `lotes_montagem_ajustes_pkey`: PRIMARY KEY (id)
- `lotes_montagem_ajustes_quantidade_cestas_afetadas_check`: CHECK (quantidade_cestas_afetadas > 0)
- `lotes_montagem_ajustes_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `lotes_montagem_ajustes_pkey`: CREATE UNIQUE INDEX lotes_montagem_ajustes_pkey ON pastoral.lotes_montagem_ajustes USING btree (id)

### `pastoral.lotes_montagem_ajustes_itens`

| Coluna                   | Tipo                | Nulo | Default |
| ------------------------ | ------------------- | ---: | ------- |
| `id`                     | `bigint`            |   NO |         |
| `ajuste_id`              | `bigint`            |   NO |         |
| `apresentacao_insumo_id` | `bigint`            |   NO |         |
| `operacao`               | `character varying` |   NO |         |
| `quantidade_por_cesta`   | `integer`           |   NO |         |

**Constraints**

- `lotes_montagem_ajustes_itens_ajuste_id_fkey`: FOREIGN KEY (ajuste_id) REFERENCES pastoral.lotes_montagem_ajustes(id)
- `lotes_montagem_ajustes_itens_apresentacao_insumo_id_fkey`: FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id)
- `lotes_montagem_ajustes_itens_operacao_check`: CHECK (operacao::text = ANY (ARRAY['ADICIONAR'::character varying, 'REMOVER'::character varying]::text[]))
- `lotes_montagem_ajustes_itens_pkey`: PRIMARY KEY (id)
- `lotes_montagem_ajustes_itens_quantidade_por_cesta_check`: CHECK (quantidade_por_cesta > 0)

**Índices**

- `lotes_montagem_ajustes_itens_pkey`: CREATE UNIQUE INDEX lotes_montagem_ajustes_itens_pkey ON pastoral.lotes_montagem_ajustes_itens USING btree (id)

### `pastoral.lotes_montagem_itens`

| Coluna                   | Tipo      | Nulo | Default |
| ------------------------ | --------- | ---: | ------- |
| `id`                     | `bigint`  |   NO |         |
| `lote_montagem_id`       | `bigint`  |   NO |         |
| `apresentacao_insumo_id` | `bigint`  |   NO |         |
| `quantidade_por_cesta`   | `integer` |   NO |         |

**Constraints**

- `lotes_montagem_itens_apresentacao_insumo_id_fkey`: FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id)
- `lotes_montagem_itens_lote_montagem_id_apresentacao_insumo_i_key`: UNIQUE (lote_montagem_id, apresentacao_insumo_id)
- `lotes_montagem_itens_lote_montagem_id_fkey`: FOREIGN KEY (lote_montagem_id) REFERENCES pastoral.lotes_montagem(id)
- `lotes_montagem_itens_pkey`: PRIMARY KEY (id)
- `lotes_montagem_itens_quantidade_por_cesta_check`: CHECK (quantidade_por_cesta > 0)

**Índices**

- `lotes_montagem_itens_lote_montagem_id_apresentacao_insumo_i_key`: CREATE UNIQUE INDEX lotes_montagem_itens_lote_montagem_id_apresentacao_insumo_i_key ON pastoral.lotes_montagem_itens USING btree (lote_montagem_id, apresentacao_insumo_id)
- `lotes_montagem_itens_pkey`: CREATE UNIQUE INDEX lotes_montagem_itens_pkey ON pastoral.lotes_montagem_itens USING btree (id)

### `pastoral.modelos_cesta`

| Coluna      | Tipo                       | Nulo | Default |
| ----------- | -------------------------- | ---: | ------- |
| `id`        | `bigint`                   |   NO |         |
| `nome`      | `character varying`        |   NO |         |
| `tipo`      | `character varying`        |   NO |         |
| `ativo`     | `boolean`                  |   NO | true    |
| `criado_em` | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `modelos_cesta_pkey`: PRIMARY KEY (id)
- `modelos_cesta_tipo_check`: CHECK (tipo::text = ANY (ARRAY['REGULAR'::character varying, 'EMERGENCIAL'::character varying, 'ESPECIAL'::character varying, 'OUTRO'::character varying]::text[]))

**Índices**

- `modelos_cesta_pkey`: CREATE UNIQUE INDEX modelos_cesta_pkey ON pastoral.modelos_cesta USING btree (id)

### `pastoral.modelos_cesta_versoes`

| Coluna            | Tipo                       | Nulo | Default |
| ----------------- | -------------------------- | ---: | ------- |
| `id`              | `bigint`                   |   NO |         |
| `modelo_cesta_id` | `bigint`                   |   NO |         |
| `numero_versao`   | `integer`                  |   NO |         |
| `meta_itens`      | `integer`                  |  YES |         |
| `usuario_id`      | `bigint`                   |   NO |         |
| `criado_em`       | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `modelos_cesta_versoes_meta_itens_check`: CHECK (meta_itens IS NULL OR meta_itens > 0)
- `modelos_cesta_versoes_modelo_cesta_id_fkey`: FOREIGN KEY (modelo_cesta_id) REFERENCES pastoral.modelos_cesta(id)
- `modelos_cesta_versoes_modelo_cesta_id_numero_versao_key`: UNIQUE (modelo_cesta_id, numero_versao)
- `modelos_cesta_versoes_pkey`: PRIMARY KEY (id)
- `modelos_cesta_versoes_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `modelos_cesta_versoes_modelo_cesta_id_numero_versao_key`: CREATE UNIQUE INDEX modelos_cesta_versoes_modelo_cesta_id_numero_versao_key ON pastoral.modelos_cesta_versoes USING btree (modelo_cesta_id, numero_versao)
- `modelos_cesta_versoes_pkey`: CREATE UNIQUE INDEX modelos_cesta_versoes_pkey ON pastoral.modelos_cesta_versoes USING btree (id)

### `pastoral.modelos_cesta_versoes_itens`

| Coluna                   | Tipo      | Nulo | Default |
| ------------------------ | --------- | ---: | ------- |
| `id`                     | `bigint`  |   NO |         |
| `modelo_cesta_versao_id` | `bigint`  |   NO |         |
| `apresentacao_insumo_id` | `bigint`  |   NO |         |
| `quantidade`             | `integer` |   NO |         |

**Constraints**

- `modelos_cesta_versoes_itens_apresentacao_insumo_id_fkey`: FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id)
- `modelos_cesta_versoes_itens_modelo_cesta_versao_id_apresent_key`: UNIQUE (modelo_cesta_versao_id, apresentacao_insumo_id)
- `modelos_cesta_versoes_itens_modelo_cesta_versao_id_fkey`: FOREIGN KEY (modelo_cesta_versao_id) REFERENCES pastoral.modelos_cesta_versoes(id)
- `modelos_cesta_versoes_itens_pkey`: PRIMARY KEY (id)
- `modelos_cesta_versoes_itens_quantidade_check`: CHECK (quantidade > 0)

**Índices**

- `modelos_cesta_versoes_itens_modelo_cesta_versao_id_apresent_key`: CREATE UNIQUE INDEX modelos_cesta_versoes_itens_modelo_cesta_versao_id_apresent_key ON pastoral.modelos_cesta_versoes_itens USING btree (modelo_cesta_versao_id, apresentacao_insumo_id)
- `modelos_cesta_versoes_itens_pkey`: CREATE UNIQUE INDEX modelos_cesta_versoes_itens_pkey ON pastoral.modelos_cesta_versoes_itens USING btree (id)

### `pastoral.motivos_desligamento`

| Coluna      | Tipo                | Nulo | Default |
| ----------- | ------------------- | ---: | ------- |
| `id`        | `bigint`            |   NO |         |
| `codigo`    | `character varying` |   NO |         |
| `descricao` | `character varying` |   NO |         |
| `ativo`     | `boolean`           |   NO | true    |

**Constraints**

- `motivos_desligamento_codigo_key`: UNIQUE (codigo)
- `motivos_desligamento_pkey`: PRIMARY KEY (id)

**Índices**

- `motivos_desligamento_codigo_key`: CREATE UNIQUE INDEX motivos_desligamento_codigo_key ON pastoral.motivos_desligamento USING btree (codigo)
- `motivos_desligamento_pkey`: CREATE UNIQUE INDEX motivos_desligamento_pkey ON pastoral.motivos_desligamento USING btree (id)

### `pastoral.motivos_perda_estoque`

| Coluna      | Tipo                | Nulo | Default |
| ----------- | ------------------- | ---: | ------- |
| `id`        | `bigint`            |   NO |         |
| `codigo`    | `character varying` |   NO |         |
| `descricao` | `character varying` |   NO |         |
| `ativo`     | `boolean`           |   NO | true    |

**Constraints**

- `motivos_perda_estoque_codigo_key`: UNIQUE (codigo)
- `motivos_perda_estoque_pkey`: PRIMARY KEY (id)

**Índices**

- `motivos_perda_estoque_codigo_key`: CREATE UNIQUE INDEX motivos_perda_estoque_codigo_key ON pastoral.motivos_perda_estoque USING btree (codigo)
- `motivos_perda_estoque_pkey`: CREATE UNIQUE INDEX motivos_perda_estoque_pkey ON pastoral.motivos_perda_estoque USING btree (id)

### `pastoral.movimentacoes_cestas`

| Coluna             | Tipo                       | Nulo | Default |
| ------------------ | -------------------------- | ---: | ------- |
| `id`               | `bigint`                   |   NO |         |
| `lote_montagem_id` | `bigint`                   |   NO |         |
| `tipo`             | `character varying`        |   NO |         |
| `quantidade`       | `integer`                  |   NO |         |
| `sentido`          | `smallint`                 |   NO |         |
| `referencia_tipo`  | `character varying`        |  YES |         |
| `referencia_id`    | `bigint`                   |  YES |         |
| `usuario_id`       | `bigint`                   |   NO |         |
| `ocorrido_em`      | `timestamp with time zone` |   NO | now()   |
| `observacao`       | `text`                     |  YES |         |

**Constraints**

- `movimentacoes_cestas_lote_montagem_id_fkey`: FOREIGN KEY (lote_montagem_id) REFERENCES pastoral.lotes_montagem(id)
- `movimentacoes_cestas_pkey`: PRIMARY KEY (id)
- `movimentacoes_cestas_quantidade_check`: CHECK (quantidade > 0)
- `movimentacoes_cestas_sentido_check`: CHECK (sentido = ANY (ARRAY['-1'::integer, 1]))
- `movimentacoes_cestas_tipo_check`: CHECK (tipo::text = ANY (ARRAY['MONTAGEM'::character varying, 'DESMONTAGEM'::character varying, 'ENTREGA'::character varying, 'ESTORNO_ENTREGA'::character varying]::text[]))
- `movimentacoes_cestas_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `idx_mov_cestas_lote`: CREATE INDEX idx_mov_cestas_lote ON pastoral.movimentacoes_cestas USING btree (lote_montagem_id, ocorrido_em, id)
- `movimentacoes_cestas_pkey`: CREATE UNIQUE INDEX movimentacoes_cestas_pkey ON pastoral.movimentacoes_cestas USING btree (id)

### `pastoral.movimentacoes_insumos`

| Coluna                   | Tipo                       | Nulo | Default |
| ------------------------ | -------------------------- | ---: | ------- |
| `id`                     | `bigint`                   |   NO |         |
| `apresentacao_insumo_id` | `bigint`                   |   NO |         |
| `tipo`                   | `character varying`        |   NO |         |
| `quantidade`             | `integer`                  |   NO |         |
| `sentido`                | `smallint`                 |   NO |         |
| `referencia_tipo`        | `character varying`        |  YES |         |
| `referencia_id`          | `bigint`                   |  YES |         |
| `usuario_id`             | `bigint`                   |   NO |         |
| `ocorrido_em`            | `timestamp with time zone` |   NO | now()   |
| `observacao`             | `text`                     |  YES |         |

**Constraints**

- `movimentacoes_insumos_apresentacao_insumo_id_fkey`: FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id)
- `movimentacoes_insumos_pkey`: PRIMARY KEY (id)
- `movimentacoes_insumos_quantidade_check`: CHECK (quantidade > 0)
- `movimentacoes_insumos_sentido_check`: CHECK (sentido = ANY (ARRAY['-1'::integer, 1]))
- `movimentacoes_insumos_tipo_check`: CHECK (tipo::text = ANY (ARRAY['ENTRADA'::character varying, 'CONSUMO_MONTAGEM'::character varying, 'RETORNO_DESMONTAGEM'::character varying, 'PERDA'::character varying, 'AJUSTE_INVENTARIO'::character varying]::text[]))
- `movimentacoes_insumos_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `idx_mov_insumo`: CREATE INDEX idx_mov_insumo ON pastoral.movimentacoes_insumos USING btree (apresentacao_insumo_id, ocorrido_em, id)
- `movimentacoes_insumos_pkey`: CREATE UNIQUE INDEX movimentacoes_insumos_pkey ON pastoral.movimentacoes_insumos USING btree (id)

### `pastoral.perdas_estoque`

| Coluna                   | Tipo                       | Nulo | Default |
| ------------------------ | -------------------------- | ---: | ------- |
| `id`                     | `bigint`                   |   NO |         |
| `apresentacao_insumo_id` | `bigint`                   |   NO |         |
| `quantidade`             | `integer`                  |   NO |         |
| `motivo_perda_id`        | `bigint`                   |   NO |         |
| `observacao`             | `text`                     |  YES |         |
| `usuario_id`             | `bigint`                   |   NO |         |
| `ocorrido_em`            | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `perdas_estoque_apresentacao_insumo_id_fkey`: FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id)
- `perdas_estoque_motivo_perda_id_fkey`: FOREIGN KEY (motivo_perda_id) REFERENCES pastoral.motivos_perda_estoque(id)
- `perdas_estoque_pkey`: PRIMARY KEY (id)
- `perdas_estoque_quantidade_check`: CHECK (quantidade > 0)
- `perdas_estoque_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `perdas_estoque_pkey`: CREATE UNIQUE INDEX perdas_estoque_pkey ON pastoral.perdas_estoque USING btree (id)

### `pastoral.perfis`

| Coluna      | Tipo                | Nulo | Default |
| ----------- | ------------------- | ---: | ------- |
| `id`        | `bigint`            |   NO |         |
| `codigo`    | `character varying` |   NO |         |
| `nome`      | `character varying` |   NO |         |
| `descricao` | `text`              |  YES |         |
| `ativo`     | `boolean`           |   NO | true    |

**Constraints**

- `perfis_codigo_key`: UNIQUE (codigo)
- `perfis_pkey`: PRIMARY KEY (id)

**Índices**

- `perfis_codigo_key`: CREATE UNIQUE INDEX perfis_codigo_key ON pastoral.perfis USING btree (codigo)
- `perfis_pkey`: CREATE UNIQUE INDEX perfis_pkey ON pastoral.perfis USING btree (id)

### `pastoral.perfis_permissoes`

| Coluna         | Tipo     | Nulo | Default |
| -------------- | -------- | ---: | ------- |
| `perfil_id`    | `bigint` |   NO |         |
| `permissao_id` | `bigint` |   NO |         |

**Constraints**

- `perfis_permissoes_perfil_id_fkey`: FOREIGN KEY (perfil_id) REFERENCES pastoral.perfis(id)
- `perfis_permissoes_permissao_id_fkey`: FOREIGN KEY (permissao_id) REFERENCES pastoral.permissoes(id)
- `perfis_permissoes_pkey`: PRIMARY KEY (perfil_id, permissao_id)

**Índices**

- `perfis_permissoes_pkey`: CREATE UNIQUE INDEX perfis_permissoes_pkey ON pastoral.perfis_permissoes USING btree (perfil_id, permissao_id)

### `pastoral.permissoes`

| Coluna      | Tipo                | Nulo | Default |
| ----------- | ------------------- | ---: | ------- |
| `id`        | `bigint`            |   NO |         |
| `codigo`    | `character varying` |   NO |         |
| `descricao` | `text`              |   NO |         |

**Constraints**

- `permissoes_codigo_key`: UNIQUE (codigo)
- `permissoes_pkey`: PRIMARY KEY (id)

**Índices**

- `permissoes_codigo_key`: CREATE UNIQUE INDEX permissoes_codigo_key ON pastoral.permissoes USING btree (codigo)
- `permissoes_pkey`: CREATE UNIQUE INDEX permissoes_pkey ON pastoral.permissoes USING btree (id)

### `pastoral.pessoas`

| Coluna                   | Tipo                       | Nulo | Default |
| ------------------------ | -------------------------- | ---: | ------- |
| `id`                     | `bigint`                   |   NO |         |
| `nome_completo`          | `character varying`        |   NO |         |
| `nome_normalizado`       | `character varying`        |   NO |         |
| `data_nascimento`        | `date`                     |  YES |         |
| `telefone`               | `character varying`        |  YES |         |
| `observacao_operacional` | `text`                     |  YES |         |
| `observacao_restrita`    | `text`                     |  YES |         |
| `ativo`                  | `boolean`                  |   NO | true    |
| `criado_em`              | `timestamp with time zone` |   NO | now()   |
| `atualizado_em`          | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `pessoas_pkey`: PRIMARY KEY (id)

**Índices**

- `idx_pessoas_nome_trgm`: CREATE INDEX idx_pessoas_nome_trgm ON pastoral.pessoas USING gin (nome_normalizado pastoral.gin_trgm_ops)
- `pessoas_pkey`: CREATE UNIQUE INDEX pessoas_pkey ON pastoral.pessoas USING btree (id)

### `pastoral.pessoas_arquivos`

| Coluna                | Tipo                       | Nulo | Default |
| --------------------- | -------------------------- | ---: | ------- |
| `id`                  | `bigint`                   |   NO |         |
| `pessoa_id`           | `bigint`                   |   NO |         |
| `arquivo_id`          | `bigint`                   |   NO |         |
| `tipo`                | `character varying`        |   NO |         |
| `principal`           | `boolean`                  |   NO | false   |
| `usuario_cadastro_id` | `bigint`                   |  YES |         |
| `criado_em`           | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `pessoas_arquivos_arquivo_id_fkey`: FOREIGN KEY (arquivo_id) REFERENCES pastoral.arquivos(id)
- `pessoas_arquivos_pessoa_id_fkey`: FOREIGN KEY (pessoa_id) REFERENCES pastoral.pessoas(id)
- `pessoas_arquivos_pkey`: PRIMARY KEY (id)
- `pessoas_arquivos_tipo_check`: CHECK (tipo::text = ANY (ARRAY['FOTO_PERFIL'::character varying, 'DOCUMENTO'::character varying, 'OUTRO'::character varying]::text[]))
- `pessoas_arquivos_usuario_cadastro_id_fkey`: FOREIGN KEY (usuario_cadastro_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `idx_pessoas_arquivos_pessoa`: CREATE INDEX idx_pessoas_arquivos_pessoa ON pastoral.pessoas_arquivos USING btree (pessoa_id)
- `pessoas_arquivos_pkey`: CREATE UNIQUE INDEX pessoas_arquivos_pkey ON pastoral.pessoas_arquivos USING btree (id)
- `uq_pessoa_foto_principal`: CREATE UNIQUE INDEX uq_pessoa_foto_principal ON pastoral.pessoas_arquivos USING btree (pessoa_id) WHERE (principal AND ((tipo)::text = 'FOTO_PERFIL'::text))

### `pastoral.pessoas_documentos`

| Coluna               | Tipo                       | Nulo | Default |
| -------------------- | -------------------------- | ---: | ------- |
| `id`                 | `bigint`                   |   NO |         |
| `pessoa_id`          | `bigint`                   |   NO |         |
| `tipo_documento_id`  | `bigint`                   |   NO |         |
| `numero`             | `character varying`        |   NO |         |
| `numero_normalizado` | `character varying`        |   NO |         |
| `arquivo_id`         | `bigint`                   |  YES |         |
| `principal`          | `boolean`                  |   NO | false   |
| `ativo`              | `boolean`                  |   NO | true    |
| `criado_em`          | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `pessoas_documentos_arquivo_id_fkey`: FOREIGN KEY (arquivo_id) REFERENCES pastoral.arquivos(id)
- `pessoas_documentos_pessoa_id_fkey`: FOREIGN KEY (pessoa_id) REFERENCES pastoral.pessoas(id)
- `pessoas_documentos_pkey`: PRIMARY KEY (id)
- `pessoas_documentos_tipo_documento_id_fkey`: FOREIGN KEY (tipo_documento_id) REFERENCES pastoral.tipos_documento(id)
- `pessoas_documentos_tipo_documento_id_numero_normalizado_key`: UNIQUE (tipo_documento_id, numero_normalizado)

**Índices**

- `idx_pessoas_documentos_numero`: CREATE INDEX idx_pessoas_documentos_numero ON pastoral.pessoas_documentos USING btree (numero_normalizado)
- `idx_pessoas_documentos_pessoa`: CREATE INDEX idx_pessoas_documentos_pessoa ON pastoral.pessoas_documentos USING btree (pessoa_id)
- `pessoas_documentos_pkey`: CREATE UNIQUE INDEX pessoas_documentos_pkey ON pastoral.pessoas_documentos USING btree (id)
- `pessoas_documentos_tipo_documento_id_numero_normalizado_key`: CREATE UNIQUE INDEX pessoas_documentos_tipo_documento_id_numero_normalizado_key ON pastoral.pessoas_documentos USING btree (tipo_documento_id, numero_normalizado)

### `pastoral.pessoas_enderecos`

| Coluna          | Tipo                       | Nulo | Default |
| --------------- | -------------------------- | ---: | ------- |
| `id`            | `bigint`                   |   NO |         |
| `pessoa_id`     | `bigint`                   |   NO |         |
| `cep`           | `character varying`        |  YES |         |
| `logradouro`    | `character varying`        |  YES |         |
| `numero`        | `character varying`        |  YES |         |
| `complemento`   | `character varying`        |  YES |         |
| `bairro`        | `character varying`        |  YES |         |
| `cidade`        | `character varying`        |  YES |         |
| `uf`            | `character`                |  YES |         |
| `referencia`    | `text`                     |  YES |         |
| `principal`     | `boolean`                  |   NO | false   |
| `ativo`         | `boolean`                  |   NO | true    |
| `criado_em`     | `timestamp with time zone` |   NO | now()   |
| `atualizado_em` | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `pessoas_enderecos_pessoa_id_fkey`: FOREIGN KEY (pessoa_id) REFERENCES pastoral.pessoas(id)
- `pessoas_enderecos_pkey`: PRIMARY KEY (id)

**Índices**

- `idx_pessoas_enderecos_pessoa`: CREATE INDEX idx_pessoas_enderecos_pessoa ON pastoral.pessoas_enderecos USING btree (pessoa_id)
- `pessoas_enderecos_pkey`: CREATE UNIQUE INDEX pessoas_enderecos_pkey ON pastoral.pessoas_enderecos USING btree (id)

### `pastoral.planejamentos_cesta`

| Coluna            | Tipo                       | Nulo | Default |
| ----------------- | -------------------------- | ---: | ------- |
| `id`              | `bigint`                   |   NO |         |
| `competencia_id`  | `bigint`                   |   NO |         |
| `modelo_cesta_id` | `bigint`                   |   NO |         |
| `criado_em`       | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `planejamentos_cesta_competencia_id_fkey`: FOREIGN KEY (competencia_id) REFERENCES pastoral.competencias(id)
- `planejamentos_cesta_competencia_id_modelo_cesta_id_key`: UNIQUE (competencia_id, modelo_cesta_id)
- `planejamentos_cesta_modelo_cesta_id_fkey`: FOREIGN KEY (modelo_cesta_id) REFERENCES pastoral.modelos_cesta(id)
- `planejamentos_cesta_pkey`: PRIMARY KEY (id)

**Índices**

- `planejamentos_cesta_competencia_id_modelo_cesta_id_key`: CREATE UNIQUE INDEX planejamentos_cesta_competencia_id_modelo_cesta_id_key ON pastoral.planejamentos_cesta USING btree (competencia_id, modelo_cesta_id)
- `planejamentos_cesta_pkey`: CREATE UNIQUE INDEX planejamentos_cesta_pkey ON pastoral.planejamentos_cesta USING btree (id)

### `pastoral.planejamentos_cesta_versoes`

| Coluna                  | Tipo                       | Nulo | Default                        |
| ----------------------- | -------------------------- | ---: | ------------------------------ |
| `id`                    | `bigint`                   |   NO |                                |
| `planejamento_cesta_id` | `bigint`                   |   NO |                                |
| `numero_versao`         | `integer`                  |   NO |                                |
| `quantidade_planejada`  | `integer`                  |   NO |                                |
| `status`                | `character varying`        |   NO | 'SIMULACAO'::character varying |
| `usuario_aprovador_id`  | `bigint`                   |  YES |                                |
| `aprovado_em`           | `timestamp with time zone` |  YES |                                |
| `motivo_revisao`        | `text`                     |  YES |                                |
| `criado_em`             | `timestamp with time zone` |   NO | now()                          |

**Constraints**

- `planejamentos_cesta_versoes_pkey`: PRIMARY KEY (id)
- `planejamentos_cesta_versoes_planejamento_cesta_id_fkey`: FOREIGN KEY (planejamento_cesta_id) REFERENCES pastoral.planejamentos_cesta(id)
- `planejamentos_cesta_versoes_planejamento_cesta_id_numero_ve_key`: UNIQUE (planejamento_cesta_id, numero_versao)
- `planejamentos_cesta_versoes_quantidade_planejada_check`: CHECK (quantidade_planejada > 0)
- `planejamentos_cesta_versoes_status_check`: CHECK (status::text = ANY (ARRAY['SIMULACAO'::character varying, 'APROVADA'::character varying, 'SUBSTITUIDA'::character varying, 'CONCLUIDA'::character varying]::text[]))
- `planejamentos_cesta_versoes_usuario_aprovador_id_fkey`: FOREIGN KEY (usuario_aprovador_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `planejamentos_cesta_versoes_pkey`: CREATE UNIQUE INDEX planejamentos_cesta_versoes_pkey ON pastoral.planejamentos_cesta_versoes USING btree (id)
- `planejamentos_cesta_versoes_planejamento_cesta_id_numero_ve_key`: CREATE UNIQUE INDEX planejamentos_cesta_versoes_planejamento_cesta_id_numero_ve_key ON pastoral.planejamentos_cesta_versoes USING btree (planejamento_cesta_id, numero_versao)
- `uq_planejamento_versao_aprovada`: CREATE UNIQUE INDEX uq_planejamento_versao_aprovada ON pastoral.planejamentos_cesta_versoes USING btree (planejamento_cesta_id) WHERE ((status)::text = 'APROVADA'::text)

### `pastoral.planejamentos_cesta_versoes_itens`

| Coluna                   | Tipo      | Nulo | Default |
| ------------------------ | --------- | ---: | ------- |
| `id`                     | `bigint`  |   NO |         |
| `planejamento_versao_id` | `bigint`  |   NO |         |
| `apresentacao_insumo_id` | `bigint`  |   NO |         |
| `quantidade_por_cesta`   | `integer` |   NO |         |

**Constraints**

- `planejamentos_cesta_versoes_i_planejamento_versao_id_aprese_key`: UNIQUE (planejamento_versao_id, apresentacao_insumo_id)
- `planejamentos_cesta_versoes_itens_apresentacao_insumo_id_fkey`: FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id)
- `planejamentos_cesta_versoes_itens_pkey`: PRIMARY KEY (id)
- `planejamentos_cesta_versoes_itens_planejamento_versao_id_fkey`: FOREIGN KEY (planejamento_versao_id) REFERENCES pastoral.planejamentos_cesta_versoes(id)
- `planejamentos_cesta_versoes_itens_quantidade_por_cesta_check`: CHECK (quantidade_por_cesta > 0)

**Índices**

- `planejamentos_cesta_versoes_i_planejamento_versao_id_aprese_key`: CREATE UNIQUE INDEX planejamentos_cesta_versoes_i_planejamento_versao_id_aprese_key ON pastoral.planejamentos_cesta_versoes_itens USING btree (planejamento_versao_id, apresentacao_insumo_id)
- `planejamentos_cesta_versoes_itens_pkey`: CREATE UNIQUE INDEX planejamentos_cesta_versoes_itens_pkey ON pastoral.planejamentos_cesta_versoes_itens USING btree (id)

### `pastoral.reservas_insumos`

| Coluna                   | Tipo                       | Nulo | Default |
| ------------------------ | -------------------------- | ---: | ------- |
| `id`                     | `bigint`                   |   NO |         |
| `planejamento_versao_id` | `bigint`                   |   NO |         |
| `apresentacao_insumo_id` | `bigint`                   |   NO |         |
| `quantidade_reservada`   | `integer`                  |   NO |         |
| `quantidade_consumida`   | `integer`                  |   NO | 0       |
| `quantidade_liberada`    | `integer`                  |   NO | 0       |
| `criado_em`              | `timestamp with time zone` |   NO | now()   |
| `atualizado_em`          | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `reservas_insumos_apresentacao_insumo_id_fkey`: FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id)
- `reservas_insumos_check`: CHECK ((quantidade_consumida + quantidade_liberada) <= quantidade_reservada)
- `reservas_insumos_pkey`: PRIMARY KEY (id)
- `reservas_insumos_planejamento_versao_id_apresentacao_insumo_key`: UNIQUE (planejamento_versao_id, apresentacao_insumo_id)
- `reservas_insumos_planejamento_versao_id_fkey`: FOREIGN KEY (planejamento_versao_id) REFERENCES pastoral.planejamentos_cesta_versoes(id)
- `reservas_insumos_quantidade_consumida_check`: CHECK (quantidade_consumida >= 0)
- `reservas_insumos_quantidade_liberada_check`: CHECK (quantidade_liberada >= 0)
- `reservas_insumos_quantidade_reservada_check`: CHECK (quantidade_reservada >= 0)

**Índices**

- `reservas_insumos_pkey`: CREATE UNIQUE INDEX reservas_insumos_pkey ON pastoral.reservas_insumos USING btree (id)
- `reservas_insumos_planejamento_versao_id_apresentacao_insumo_key`: CREATE UNIQUE INDEX reservas_insumos_planejamento_versao_id_apresentacao_insumo_key ON pastoral.reservas_insumos USING btree (planejamento_versao_id, apresentacao_insumo_id)

### `pastoral.retiradas`

| Coluna                 | Tipo                       | Nulo | Default                     |
| ---------------------- | -------------------------- | ---: | --------------------------- |
| `id`                   | `bigint`                   |   NO |                             |
| `direito_beneficio_id` | `bigint`                   |   NO |                             |
| `distribuicao_id`      | `bigint`                   |   NO |                             |
| `beneficiario_id`      | `bigint`                   |   NO |                             |
| `tipo`                 | `character varying`        |   NO |                             |
| `status`               | `character varying`        |   NO | 'VALIDA'::character varying |
| `forma_identificacao`  | `character varying`        |  YES |                             |
| `usuario_operador_id`  | `bigint`                   |   NO |                             |
| `ocorrido_em`          | `timestamp with time zone` |   NO | now()                       |

**Constraints**

- `retiradas_beneficiario_id_fkey`: FOREIGN KEY (beneficiario_id) REFERENCES pastoral.beneficiarios(id)
- `retiradas_direito_beneficio_id_fkey`: FOREIGN KEY (direito_beneficio_id) REFERENCES pastoral.direitos_beneficio(id)
- `retiradas_distribuicao_id_fkey`: FOREIGN KEY (distribuicao_id) REFERENCES pastoral.distribuicoes(id)
- `retiradas_forma_identificacao_check`: CHECK (forma_identificacao IS NULL OR (forma_identificacao::text = ANY (ARRAY['DOCUMENTO'::character varying, 'FOTO_HISTORICO'::character varying, 'REPRESENTANTE'::character varying, 'CONTINGENCIA'::character varying]::text[])))
- `retiradas_pkey`: PRIMARY KEY (id)
- `retiradas_status_check`: CHECK (status::text = ANY (ARRAY['VALIDA'::character varying, 'ESTORNADA'::character varying]::text[]))
- `retiradas_tipo_check`: CHECK (tipo::text = ANY (ARRAY['TITULAR'::character varying, 'REPRESENTANTE'::character varying, 'PRIMEIRA_ENTREGA'::character varying, 'ANTECIPADA'::character varying, 'CONTINGENCIA'::character varying]::text[]))
- `retiradas_usuario_operador_id_fkey`: FOREIGN KEY (usuario_operador_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `idx_retiradas_distribuicao`: CREATE INDEX idx_retiradas_distribuicao ON pastoral.retiradas USING btree (distribuicao_id, ocorrido_em, id)
- `retiradas_pkey`: CREATE UNIQUE INDEX retiradas_pkey ON pastoral.retiradas USING btree (id)
- `uq_retirada_valida_direito`: CREATE UNIQUE INDEX uq_retirada_valida_direito ON pastoral.retiradas USING btree (direito_beneficio_id) WHERE ((status)::text = 'VALIDA'::text)

### `pastoral.retiradas_estornos`

| Coluna        | Tipo                       | Nulo | Default |
| ------------- | -------------------------- | ---: | ------- |
| `id`          | `bigint`                   |   NO |         |
| `retirada_id` | `bigint`                   |   NO |         |
| `motivo`      | `text`                     |   NO |         |
| `usuario_id`  | `bigint`                   |   NO |         |
| `ocorrido_em` | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `retiradas_estornos_pkey`: PRIMARY KEY (id)
- `retiradas_estornos_retirada_id_fkey`: FOREIGN KEY (retirada_id) REFERENCES pastoral.retiradas(id)
- `retiradas_estornos_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `retiradas_estornos_pkey`: CREATE UNIQUE INDEX retiradas_estornos_pkey ON pastoral.retiradas_estornos USING btree (id)

### `pastoral.retiradas_representantes`

| Coluna                     | Tipo                | Nulo | Default |
| -------------------------- | ------------------- | ---: | ------- |
| `id`                       | `bigint`            |   NO |         |
| `retirada_id`              | `bigint`            |   NO |         |
| `pessoa_representante_id`  | `bigint`            |  YES |         |
| `nome`                     | `character varying` |   NO |         |
| `documento`                | `character varying` |  YES |         |
| `relacao`                  | `character varying` |  YES |         |
| `autorizacao_declaratoria` | `boolean`           |   NO | true    |

**Constraints**

- `retiradas_representantes_pessoa_representante_id_fkey`: FOREIGN KEY (pessoa_representante_id) REFERENCES pastoral.pessoas(id)
- `retiradas_representantes_pkey`: PRIMARY KEY (id)
- `retiradas_representantes_retirada_id_fkey`: FOREIGN KEY (retirada_id) REFERENCES pastoral.retiradas(id)
- `retiradas_representantes_retirada_id_key`: UNIQUE (retirada_id)

**Índices**

- `retiradas_representantes_pkey`: CREATE UNIQUE INDEX retiradas_representantes_pkey ON pastoral.retiradas_representantes USING btree (id)
- `retiradas_representantes_retirada_id_key`: CREATE UNIQUE INDEX retiradas_representantes_retirada_id_key ON pastoral.retiradas_representantes USING btree (retirada_id)

### `pastoral.tipos_documento`

| Coluna   | Tipo                | Nulo | Default |
| -------- | ------------------- | ---: | ------- |
| `id`     | `bigint`            |   NO |         |
| `codigo` | `character varying` |   NO |         |
| `nome`   | `character varying` |   NO |         |
| `ativo`  | `boolean`           |   NO | true    |

**Constraints**

- `tipos_documento_codigo_key`: UNIQUE (codigo)
- `tipos_documento_pkey`: PRIMARY KEY (id)

**Índices**

- `tipos_documento_codigo_key`: CREATE UNIQUE INDEX tipos_documento_codigo_key ON pastoral.tipos_documento USING btree (codigo)
- `tipos_documento_pkey`: CREATE UNIQUE INDEX tipos_documento_pkey ON pastoral.tipos_documento USING btree (id)

### `pastoral.usuarios`

| Coluna            | Tipo                       | Nulo | Default |
| ----------------- | -------------------------- | ---: | ------- |
| `id`              | `bigint`                   |   NO |         |
| `pessoa_id`       | `bigint`                   |  YES |         |
| `login`           | `character varying`        |   NO |         |
| `senha_hash`      | `character varying`        |   NO |         |
| `ativo`           | `boolean`                  |   NO | true    |
| `ultimo_login_em` | `timestamp with time zone` |  YES |         |
| `criado_em`       | `timestamp with time zone` |   NO | now()   |
| `atualizado_em`   | `timestamp with time zone` |   NO | now()   |

**Constraints**

- `usuarios_login_key`: UNIQUE (login)
- `usuarios_pessoa_id_fkey`: FOREIGN KEY (pessoa_id) REFERENCES pastoral.pessoas(id)
- `usuarios_pessoa_id_key`: UNIQUE (pessoa_id)
- `usuarios_pkey`: PRIMARY KEY (id)

**Índices**

- `usuarios_login_key`: CREATE UNIQUE INDEX usuarios_login_key ON pastoral.usuarios USING btree (login)
- `usuarios_pessoa_id_key`: CREATE UNIQUE INDEX usuarios_pessoa_id_key ON pastoral.usuarios USING btree (pessoa_id)
- `usuarios_pkey`: CREATE UNIQUE INDEX usuarios_pkey ON pastoral.usuarios USING btree (id)

### `pastoral.usuarios_perfis`

| Coluna       | Tipo     | Nulo | Default |
| ------------ | -------- | ---: | ------- |
| `usuario_id` | `bigint` |   NO |         |
| `perfil_id`  | `bigint` |   NO |         |

**Constraints**

- `usuarios_perfis_perfil_id_fkey`: FOREIGN KEY (perfil_id) REFERENCES pastoral.perfis(id)
- `usuarios_perfis_pkey`: PRIMARY KEY (usuario_id, perfil_id)
- `usuarios_perfis_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id)

**Índices**

- `usuarios_perfis_pkey`: CREATE UNIQUE INDEX usuarios_perfis_pkey ON pastoral.usuarios_perfis USING btree (usuario_id, perfil_id)

## Views

- `pastoral.vw_beneficiarios_ativos`
- `pastoral.vw_capacidade_atual`
- `pastoral.vw_cestas_liberadas_distribuicao`
- `pastoral.vw_disponibilidade_insumos`
- `pastoral.vw_preparacao_distribuicoes`
- `pastoral.vw_reservas_insumos_ativas`
- `pastoral.vw_saldo_insumos`

## Triggers

- `tg_pessoas_normalizacao` em `pastoral.pessoas`: BEFORE INSERT — EXECUTE FUNCTION pastoral.trg_pessoas_normalizacao()
- `tg_pessoas_normalizacao` em `pastoral.pessoas`: BEFORE UPDATE — EXECUTE FUNCTION pastoral.trg_pessoas_normalizacao()
- `tg_documentos_normalizacao` em `pastoral.pessoas_documentos`: BEFORE INSERT — EXECUTE FUNCTION pastoral.trg_documentos_normalizacao()
- `tg_documentos_normalizacao` em `pastoral.pessoas_documentos`: BEFORE UPDATE — EXECUTE FUNCTION pastoral.trg_documentos_normalizacao()

## Sequences

- `pastoral.arquivos_id_seq`
- `pastoral.auditoria_id_seq`
- `pastoral.ausencias_id_seq`
- `pastoral.beneficiarios_desligamentos_id_seq`
- `pastoral.beneficiarios_grupos_historico_id_seq`
- `pastoral.beneficiarios_id_seq`
- `pastoral.candidaturas_id_seq`
- `pastoral.candidaturas_tentativas_contato_id_seq`
- `pastoral.categorias_prioridade_insumo_id_seq`
- `pastoral.cestas_adicionais_id_seq`
- `pastoral.competencias_id_seq`
- `pastoral.configuracoes_capacidade_id_seq`
- `pastoral.direitos_beneficio_id_seq`
- `pastoral.distribuicoes_checkins_id_seq`
- `pastoral.distribuicoes_historico_id_seq`
- `pastoral.distribuicoes_id_seq`
- `pastoral.distribuicoes_liberacoes_cestas_id_seq`
- `pastoral.doadores_id_seq`
- `pastoral.entradas_estoque_id_seq`
- `pastoral.entradas_estoque_itens_id_seq`
- `pastoral.entregas_cestas_id_seq`
- `pastoral.entregas_cestas_lotes_id_seq`
- `pastoral.grupos_distribuicao_id_seq`
- `pastoral.insumos_apresentacoes_id_seq`
- `pastoral.insumos_id_seq`
- `pastoral.inventarios_id_seq`
- `pastoral.inventarios_itens_id_seq`
- `pastoral.justificativas_ausencia_id_seq`
- `pastoral.lotes_montagem_ajustes_id_seq`
- `pastoral.lotes_montagem_ajustes_itens_id_seq`
- `pastoral.lotes_montagem_id_seq`
- `pastoral.lotes_montagem_itens_id_seq`
- `pastoral.modelos_cesta_id_seq`
- `pastoral.modelos_cesta_versoes_id_seq`
- `pastoral.modelos_cesta_versoes_itens_id_seq`
- `pastoral.motivos_desligamento_id_seq`
- `pastoral.motivos_perda_estoque_id_seq`
- `pastoral.movimentacoes_cestas_id_seq`
- `pastoral.movimentacoes_insumos_id_seq`
- `pastoral.perdas_estoque_id_seq`
- `pastoral.perfis_id_seq`
- `pastoral.permissoes_id_seq`
- `pastoral.pessoas_arquivos_id_seq`
- `pastoral.pessoas_documentos_id_seq`
- `pastoral.pessoas_enderecos_id_seq`
- `pastoral.pessoas_id_seq`
- `pastoral.planejamentos_cesta_id_seq`
- `pastoral.planejamentos_cesta_versoes_id_seq`
- `pastoral.planejamentos_cesta_versoes_itens_id_seq`
- `pastoral.reservas_insumos_id_seq`
- `pastoral.retiradas_estornos_id_seq`
- `pastoral.retiradas_id_seq`
- `pastoral.retiradas_representantes_id_seq`
- `pastoral.tipos_documento_id_seq`
- `pastoral.usuarios_id_seq`

## Funções próprias e assinaturas

- `pastoral.abrir_distribuicao(p_distribuicao_id bigint, p_usuario_id bigint) → void` (plpgsql)
- `pastoral.aprovar_planejamento(p_planejamento_versao_id bigint, p_usuario_id bigint) → void` (plpgsql)
- `pastoral.concluir_inventario(p_inventario_id bigint, p_usuario_id bigint) → void` (plpgsql)
- `pastoral.encerrar_distribuicao(p_distribuicao_id bigint, p_usuario_id bigint) → void` (plpgsql)
- `pastoral.entregar_cesta_adicional(p_cesta_adicional_id bigint, p_usuario_id bigint) → bigint` (plpgsql)
- `pastoral.estornar_retirada(p_retirada_id bigint, p_usuario_id bigint, p_motivo text) → void` (plpgsql)
- `pastoral.fn_beneficiario_tem_pendencia_anterior(p_beneficiario_id bigint, p_competencia_id bigint) → boolean` (sql)
- `pastoral.fn_consumir_cestas_liberadas(p_distribuicao_id bigint, p_quantidade integer, p_entrega_id bigint, p_usuario_id bigint) → void` (plpgsql)
- `pastoral.fn_normalizar_documento(p_texto text) → text` (sql)
- `pastoral.fn_normalizar_texto(p_texto text) → text` (sql)
- `pastoral.fn_nth_weekday_of_month(p_year integer, p_month integer, p_isodow integer, p_n integer) → date` (sql)
- `pastoral.gerar_competencia(p_ano integer, p_mes integer, p_usuario_id bigint) → bigint` (plpgsql)
- `pastoral.liberar_cestas(p_distribuicao_id bigint, p_lote_id bigint, p_quantidade integer, p_usuario_id bigint) → bigint` (plpgsql)
- `pastoral.montar_cestas(p_planejamento_versao_id bigint, p_quantidade integer, p_usuario_id bigint) → bigint` (plpgsql)
- `pastoral.registrar_entrada_estoque(p_tipo character varying, p_doador_id bigint, p_usuario_id bigint, p_data_entrada date, p_observacao text, p_itens jsonb) → bigint` (plpgsql)
- `pastoral.registrar_perda_estoque(p_apresentacao_insumo_id bigint, p_quantidade integer, p_motivo_perda_id bigint, p_observacao text, p_usuario_id bigint) → bigint` (plpgsql)
- `pastoral.registrar_retirada(p_direito_id bigint, p_distribuicao_id bigint, p_tipo character varying, p_forma_identificacao character varying, p_usuario_id bigint) → bigint` (plpgsql)
- `pastoral.trg_documentos_normalizacao() → trigger` (plpgsql)
- `pastoral.trg_pessoas_normalizacao() → trigger` (plpgsql)

## Funções de extensões

Foram encontradas 67 funções pertencentes a extensões (por exemplo, pgcrypto/pg_trgm). Elas não são regras de negócio da aplicação e não são reproduzidas individualmente neste documento.

## Tipos enumerados

- Nenhum enum nativo no schema.

## Observações de integração

- O schema real usa `pastoral.beneficiarios` com IDs `bigint`; a API os mantém como strings na fronteira HTTP.
- O status de beneficiário é `varchar` protegido por constraint, não enum PostgreSQL.
- Datas civis (`date`) devem permanecer strings `YYYY-MM-DD`; timestamps são `timestamptz`.
- Funções transacionais próprias devem ser chamadas com o schema explicitamente qualificado.
- A inspeção não executou DDL nem alterou dados.

## Divergências observadas em validação

- `pastoral.trg_pessoas_normalizacao()` chama `fn_normalizar_texto(...)` sem qualificação. Uma inserção em `pastoral.pessoas` falha quando a sessão não possui `pastoral` no `search_path`. A API continua usando nomes qualificados; o banco não foi alterado. Recomenda-se corrigir futuramente o corpo do trigger para `pastoral.fn_normalizar_texto(...)` por migration incremental.
- Não existem funções próprias para admissão, desligamento, reativação, alteração de grupo ou capacidade. Nesta etapa essas operações foram implementadas com transações e locks explícitos nos adapters PostgreSQL.
- Migration `20260830_001_qualify_pessoas_normalization_function.sql` aplicada: o trigger agora chama `pastoral.fn_normalizar_texto`. Um INSERT com `search_path = pg_catalog, public` foi validado com rollback.
- `pastoral.gerar_competencia` foi confirmada como idempotente por `ON CONFLICT` para competência, distribuições e direitos. Como seu corpo usa referências não qualificadas, o adapter define `SET LOCAL search_path TO pastoral,public` antes da chamada.
- `pastoral.abrir_distribuicao` é reutilizada com `SET LOCAL search_path`; segunda abertura vira conflito `DISTRIBUICAO_JA_ABERTA`.
- `fn_beneficiario_tem_pendencia_anterior` considera somente estados do direito. Para a triagem, o adapter também consulta `ausencias.status`, distinguindo justificativa aceita, pendente e rejeitada.
- `registrar_retirada` e `estornar_retirada` são agora reutilizadas pela API e acoplam atomicamente retirada/estorno à entrega física e às cestas liberadas.
- `uq_retirada_valida_direito` permanece como garantia final contra duas retiradas válidas concorrentes.
- Não existe permissão específica para antecipação. Provisoriamente a API exige `RETIRADA_ESTORNAR_QUALQUER`, justificativa e auditoria, sem criar outro direito; uma permissão semântica própria depende de decisão futura de schema/RBAC.
- A migration `20260830_002_consider_justified_absence.sql` ajusta `fn_beneficiario_tem_pendencia_anterior` para considerar `ausencias.status = JUSTIFICADA`, permitindo que `registrar_retirada` seja reutilizada após regularização.
- `inventarios_itens.diferenca` é coluna gerada (`saldo_fisico - saldo_sistema`), embora o mapeamento anterior não registrasse `is_generated`; a API nunca escreve nessa coluna.
- Entrada, perda, conclusão de inventário, aprovação, montagem, liberação, retirada e estorno delegam às funções PostgreSQL correspondentes.
- Desmontagem e ajuste não possuem função própria no schema e usam transações explícitas com locks, snapshots e movimentações imutáveis.
