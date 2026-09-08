BEGIN;

-- The API already uses zero when the last basket is dismantled.
ALTER TABLE pastoral.lotes_montagem
  DROP CONSTRAINT IF EXISTS lotes_montagem_quantidade_montada_check;
ALTER TABLE pastoral.lotes_montagem
  ADD CONSTRAINT lotes_montagem_quantidade_montada_check
  CHECK (quantidade_montada >= 0 AND (quantidade_montada > 0 OR status = 'DESMONTADO'));

-- Keep the original snapshot and adjustment audit immutable. The physical ledger
-- is the single source for the total still attributed to the lot (including
-- baskets allocated/delivered, whose contents are not individually identified).
CREATE OR REPLACE VIEW pastoral.vw_composicao_atual_lotes AS
WITH movimentos AS (
  SELECT m.referencia_id AS lote_montagem_id, m.apresentacao_insumo_id,
         -m.quantidade::bigint * m.sentido AS quantidade
    FROM pastoral.movimentacoes_insumos m
   WHERE m.referencia_tipo = 'LOTE_MONTAGEM'
     AND m.tipo IN ('CONSUMO_MONTAGEM', 'RETORNO_DESMONTAGEM')
  UNION ALL
  SELECT a.lote_montagem_id, m.apresentacao_insumo_id,
         -m.quantidade::bigint * m.sentido
    FROM pastoral.movimentacoes_insumos m
    JOIN pastoral.lotes_montagem_ajustes a ON a.id = m.referencia_id
   WHERE m.referencia_tipo = 'AJUSTE_LOTE'
     AND m.tipo IN ('CONSUMO_MONTAGEM', 'RETORNO_DESMONTAGEM')
)
SELECT lote_montagem_id, apresentacao_insumo_id,
       sum(quantidade)::bigint AS quantidade_total
  FROM movimentos
 GROUP BY lote_montagem_id, apresentacao_insumo_id;

COMMENT ON VIEW pastoral.vw_composicao_atual_lotes IS
  'Conteúdo líquido atribuído ao lote: montagem + adições - remoções - desmontagens; snapshot e auditoria preservados.';

COMMIT;
