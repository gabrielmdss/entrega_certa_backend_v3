-- Estoque ?nico: serializa??o antes de ler saldo/reserva ou bloquear linhas.
BEGIN;
CREATE OR REPLACE FUNCTION pastoral.bloquear_estoque() RETURNS void
LANGUAGE sql SET search_path = pg_catalog AS $$
 SELECT pg_catalog.pg_advisory_xact_lock(20260905, 1);
$$;

CREATE OR REPLACE FUNCTION pastoral.registrar_entrada_estoque(p_tipo character varying, p_doador_id bigint, p_usuario_id bigint, p_data_entrada date, p_observacao text, p_itens jsonb) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path = pastoral, pg_catalog
    AS $$
DECLARE
    v_entrada_id bigint;
    v_item jsonb;
    v_item_id bigint;
    v_apresentacao bigint;
    v_quantidade integer;
    v_validade date;
BEGIN
    PERFORM pastoral.bloquear_estoque();
    IF p_tipo NOT IN ('DOACAO','COMPRA','SALDO_INICIAL','AJUSTE_POSITIVO') THEN
        RAISE EXCEPTION 'Tipo de entrada inválido';
    END IF;
    IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens)=0 THEN
        RAISE EXCEPTION 'Informe ao menos um item';
    END IF;

    INSERT INTO entradas_estoque(tipo,doador_id,usuario_id,data_entrada,observacao)
    VALUES(p_tipo,p_doador_id,p_usuario_id,COALESCE(p_data_entrada,CURRENT_DATE),p_observacao)
    RETURNING id INTO v_entrada_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
        v_apresentacao := (v_item->>'apresentacao_insumo_id')::bigint;
        v_quantidade := (v_item->>'quantidade')::integer;
        v_validade := NULLIF(v_item->>'validade','')::date;
        IF v_apresentacao IS NULL OR v_quantidade IS NULL OR v_quantidade <= 0 THEN
            RAISE EXCEPTION 'Item de entrada inválido: %', v_item;
        END IF;
        INSERT INTO entradas_estoque_itens(entrada_estoque_id,apresentacao_insumo_id,quantidade,validade)
        VALUES(v_entrada_id,v_apresentacao,v_quantidade,v_validade)
        RETURNING id INTO v_item_id;

        INSERT INTO movimentacoes_insumos(
            apresentacao_insumo_id,tipo,quantidade,sentido,
            referencia_tipo,referencia_id,usuario_id,observacao
        ) VALUES(
            v_apresentacao,'ENTRADA',v_quantidade,1,
            'ENTRADA_ESTOQUE_ITEM',v_item_id,p_usuario_id,p_observacao
        );
    END LOOP;
    RETURN v_entrada_id;
END$$;

CREATE OR REPLACE FUNCTION pastoral.registrar_perda_estoque(p_apresentacao_insumo_id bigint, p_quantidade integer, p_motivo_perda_id bigint, p_observacao text, p_usuario_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path = pastoral, pg_catalog
    AS $$
DECLARE
    v_saldo bigint;
    v_id bigint;
BEGIN
    PERFORM pastoral.bloquear_estoque();
    IF p_quantidade<=0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
    SELECT saldo_fisico INTO v_saldo
      FROM vw_saldo_insumos
     WHERE apresentacao_insumo_id=p_apresentacao_insumo_id;
    IF COALESCE(v_saldo,0)<p_quantidade THEN
        RAISE EXCEPTION 'Saldo físico insuficiente';
    END IF;
    INSERT INTO perdas_estoque(
        apresentacao_insumo_id,quantidade,motivo_perda_id,observacao,usuario_id
    ) VALUES(
        p_apresentacao_insumo_id,p_quantidade,p_motivo_perda_id,p_observacao,p_usuario_id
    ) RETURNING id INTO v_id;

    INSERT INTO movimentacoes_insumos(
        apresentacao_insumo_id,tipo,quantidade,sentido,
        referencia_tipo,referencia_id,usuario_id,observacao
    ) VALUES(
        p_apresentacao_insumo_id,'PERDA',p_quantidade,-1,
        'PERDA_ESTOQUE',v_id,p_usuario_id,p_observacao
    );
    RETURN v_id;
END$$;

CREATE OR REPLACE FUNCTION pastoral.aprovar_planejamento(p_planejamento_versao_id bigint, p_usuario_id bigint) RETURNS void
    LANGUAGE plpgsql
    SET search_path = pastoral, pg_catalog
    AS $$
DECLARE
    v_planejamento_id bigint;
    v_qtd integer;
    r record;
    v_saldo_disponivel bigint;
BEGIN
    PERFORM pastoral.bloquear_estoque();
    SELECT planejamento_cesta_id,quantidade_planejada
      INTO v_planejamento_id,v_qtd
      FROM planejamentos_cesta_versoes
     WHERE id=p_planejamento_versao_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Versão de planejamento não encontrada'; END IF;

    IF EXISTS (
        SELECT 1 FROM planejamentos_cesta_versoes
         WHERE planejamento_cesta_id=v_planejamento_id
           AND status='APROVADA'
           AND id<>p_planejamento_versao_id
    ) THEN
        UPDATE planejamentos_cesta_versoes
           SET status='SUBSTITUIDA'
         WHERE planejamento_cesta_id=v_planejamento_id
           AND status='APROVADA'
           AND id<>p_planejamento_versao_id;
    END IF;

    DELETE FROM reservas_insumos WHERE planejamento_versao_id=p_planejamento_versao_id;

    FOR r IN
        SELECT apresentacao_insumo_id, quantidade_por_cesta
          FROM planejamentos_cesta_versoes_itens
         WHERE planejamento_versao_id=p_planejamento_versao_id
    LOOP
        SELECT saldo_disponivel INTO v_saldo_disponivel
          FROM vw_disponibilidade_insumos
         WHERE apresentacao_insumo_id=r.apresentacao_insumo_id;

        IF COALESCE(v_saldo_disponivel,0) < (r.quantidade_por_cesta*v_qtd) THEN
            RAISE EXCEPTION 'Saldo disponível insuficiente para o insumo %: necessário %, disponível %',
                r.apresentacao_insumo_id,(r.quantidade_por_cesta*v_qtd),COALESCE(v_saldo_disponivel,0);
        END IF;

        INSERT INTO reservas_insumos(
            planejamento_versao_id,apresentacao_insumo_id,quantidade_reservada
        ) VALUES(
            p_planejamento_versao_id,
            r.apresentacao_insumo_id,
            r.quantidade_por_cesta*v_qtd
        );
    END LOOP;

    UPDATE planejamentos_cesta_versoes
       SET status='APROVADA',usuario_aprovador_id=p_usuario_id,aprovado_em=now()
     WHERE id=p_planejamento_versao_id;
END$$;

CREATE OR REPLACE FUNCTION pastoral.montar_cestas(p_planejamento_versao_id bigint, p_quantidade integer, p_usuario_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path = pastoral, pg_catalog
    AS $$
DECLARE r record; v_lote bigint; v_fisico bigint; v_reservado bigint; v_necessario bigint;
BEGIN
    PERFORM pastoral.bloquear_estoque();
 IF p_quantidade<=0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM planejamentos_cesta_versoes WHERE id=p_planejamento_versao_id AND status='APROVADA') THEN RAISE EXCEPTION 'Planejamento não está aprovado'; END IF;
 FOR r IN SELECT i.apresentacao_insumo_id,i.quantidade_por_cesta,rv.id reserva_id,rv.quantidade_reservada,rv.quantidade_consumida,rv.quantidade_liberada
          FROM planejamentos_cesta_versoes_itens i
          JOIN reservas_insumos rv ON rv.planejamento_versao_id=i.planejamento_versao_id AND rv.apresentacao_insumo_id=i.apresentacao_insumo_id
          WHERE i.planejamento_versao_id=p_planejamento_versao_id
          FOR UPDATE OF rv LOOP
   v_necessario := r.quantidade_por_cesta*p_quantidade;
   IF r.quantidade_reservada-r.quantidade_consumida-r.quantidade_liberada < v_necessario THEN RAISE EXCEPTION 'Reserva insuficiente para insumo %',r.apresentacao_insumo_id; END IF;
   SELECT saldo_fisico INTO v_fisico FROM vw_saldo_insumos WHERE apresentacao_insumo_id=r.apresentacao_insumo_id;
   IF COALESCE(v_fisico,0) < v_necessario THEN RAISE EXCEPTION 'Saldo físico insuficiente para insumo %',r.apresentacao_insumo_id; END IF;
 END LOOP;
 INSERT INTO lotes_montagem(planejamento_versao_id,quantidade_montada,quantidade_disponivel,usuario_id)
 VALUES(p_planejamento_versao_id,p_quantidade,p_quantidade,p_usuario_id) RETURNING id INTO v_lote;
 INSERT INTO lotes_montagem_itens(lote_montagem_id,apresentacao_insumo_id,quantidade_por_cesta)
 SELECT v_lote,apresentacao_insumo_id,quantidade_por_cesta FROM planejamentos_cesta_versoes_itens WHERE planejamento_versao_id=p_planejamento_versao_id;
 FOR r IN SELECT i.apresentacao_insumo_id,i.quantidade_por_cesta,rv.id reserva_id
          FROM planejamentos_cesta_versoes_itens i JOIN reservas_insumos rv ON rv.planejamento_versao_id=i.planejamento_versao_id AND rv.apresentacao_insumo_id=i.apresentacao_insumo_id
          WHERE i.planejamento_versao_id=p_planejamento_versao_id LOOP
   v_necessario := r.quantidade_por_cesta*p_quantidade;
   UPDATE reservas_insumos SET quantidade_consumida=quantidade_consumida+v_necessario,atualizado_em=now() WHERE id=r.reserva_id;
   INSERT INTO movimentacoes_insumos(apresentacao_insumo_id,tipo,quantidade,sentido,referencia_tipo,referencia_id,usuario_id)
   VALUES(r.apresentacao_insumo_id,'CONSUMO_MONTAGEM',v_necessario,-1,'LOTE_MONTAGEM',v_lote,p_usuario_id);
 END LOOP;
 INSERT INTO movimentacoes_cestas(lote_montagem_id,tipo,quantidade,sentido,referencia_tipo,referencia_id,usuario_id)
 VALUES(v_lote,'MONTAGEM',p_quantidade,1,'LOTE_MONTAGEM',v_lote,p_usuario_id);
 RETURN v_lote;
END$$;

CREATE OR REPLACE FUNCTION pastoral.concluir_inventario(p_inventario_id bigint, p_usuario_id bigint) RETURNS void
    LANGUAGE plpgsql
    SET search_path = pastoral, pg_catalog
    AS $$
DECLARE r record;
BEGIN
    PERFORM pastoral.bloquear_estoque();
    PERFORM 1 FROM inventarios WHERE id=p_inventario_id AND status='ABERTO' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventário não está aberto';
    END IF;
    FOR r IN SELECT * FROM inventarios_itens WHERE inventario_id=p_inventario_id LOOP
        IF COALESCE((SELECT saldo_fisico FROM vw_saldo_insumos WHERE apresentacao_insumo_id=r.apresentacao_insumo_id),0) <> r.saldo_sistema THEN
            RAISE EXCEPTION 'Inventário desatualizado: saldo alterado durante a contagem';
        END IF;
        IF r.diferenca<>0 THEN
            INSERT INTO movimentacoes_insumos(
                apresentacao_insumo_id,tipo,quantidade,sentido,
                referencia_tipo,referencia_id,usuario_id,observacao
            ) VALUES(
                r.apresentacao_insumo_id,'AJUSTE_INVENTARIO',ABS(r.diferenca),
                CASE WHEN r.diferenca>0 THEN 1 ELSE -1 END,
                'INVENTARIO',p_inventario_id,p_usuario_id,'Ajuste por inventário físico'
            );
        END IF;
    END LOOP;
    UPDATE inventarios SET status='CONCLUIDO',concluido_em=now() WHERE id=p_inventario_id;
END$$;

COMMIT;
