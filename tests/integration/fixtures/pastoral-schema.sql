--
-- PostgreSQL database dump
--

-- Dumped from database version 17.0
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pastoral; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pastoral;
CREATE EXTENSION pg_trgm WITH SCHEMA pastoral;
CREATE EXTENSION pgcrypto WITH SCHEMA pastoral;

--
-- Name: abrir_distribuicao(bigint, bigint); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.abrir_distribuicao(p_distribuicao_id bigint, p_usuario_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE v_status text;
BEGIN
 SELECT status INTO v_status FROM distribuicoes WHERE id=p_distribuicao_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Distribuição não encontrada'; END IF;
 IF v_status NOT IN ('PLANEJADA','PREPARADA') THEN RAISE EXCEPTION 'Distribuição não pode ser aberta no status %',v_status; END IF;
 UPDATE distribuicoes SET status='ABERTA',usuario_abertura_id=p_usuario_id,abertura_em=now(),data_real=COALESCE(data_real,CURRENT_DATE),atualizado_em=now() WHERE id=p_distribuicao_id;
END$$;

--
-- Name: aprovar_planejamento(bigint, bigint); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.aprovar_planejamento(p_planejamento_versao_id bigint, p_usuario_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_planejamento_id bigint;
    v_qtd integer;
    r record;
    v_saldo_disponivel bigint;
BEGIN
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

--
-- Name: concluir_inventario(bigint, bigint); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.concluir_inventario(p_inventario_id bigint, p_usuario_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE r record;
BEGIN
    PERFORM 1 FROM inventarios WHERE id=p_inventario_id AND status='ABERTO' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventário não está aberto';
    END IF;
    FOR r IN SELECT * FROM inventarios_itens WHERE inventario_id=p_inventario_id LOOP
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

--
-- Name: encerrar_distribuicao(bigint, bigint); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.encerrar_distribuicao(p_distribuicao_id bigint, p_usuario_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    r record;
    v_status text;
    v_competencia_id bigint;
    v_retorno integer;
BEGIN
    SELECT status, competencia_id
      INTO v_status, v_competencia_id
      FROM distribuicoes
     WHERE id = p_distribuicao_id
     FOR UPDATE;

    IF NOT FOUND OR v_status <> 'ABERTA' THEN
        RAISE EXCEPTION 'Distribuição não está aberta';
    END IF;

    FOR r IN
        SELECT db.id,
               db.beneficiario_id,
               EXISTS (
                   SELECT 1
                     FROM distribuicoes_checkins c
                    WHERE c.distribuicao_id = p_distribuicao_id
                      AND c.beneficiario_id = db.beneficiario_id
               ) AS presente
          FROM direitos_beneficio db
         WHERE db.distribuicao_prevista_id = p_distribuicao_id
           AND db.status = 'DISPONIVEL'
         FOR UPDATE
    LOOP
        IF r.presente THEN
            IF fn_beneficiario_tem_pendencia_anterior(
                r.beneficiario_id,
                v_competencia_id
            ) THEN
                UPDATE direitos_beneficio
                   SET status = 'NAO_ATENDIDO_IRREGULARIDADE',
                       atualizado_em = now()
                 WHERE id = r.id;
            ELSE
                UPDATE direitos_beneficio
                   SET status = 'NAO_ATENDIDO_ESTOQUE',
                       atualizado_em = now()
                 WHERE id = r.id;
            END IF;
        ELSE
            UPDATE direitos_beneficio
               SET status = 'AUSENTE',
                   atualizado_em = now()
             WHERE id = r.id;

            INSERT INTO ausencias(direito_beneficio_id)
            VALUES (r.id)
            ON CONFLICT (direito_beneficio_id) DO NOTHING;
        END IF;
    END LOOP;

    -- Retorna ao lote todas as cestas liberadas e não consumidas.
    FOR r IN
        SELECT *
          FROM distribuicoes_liberacoes_cestas
         WHERE distribuicao_id = p_distribuicao_id
         FOR UPDATE
    LOOP
        v_retorno := r.quantidade_liberada
                   - r.quantidade_consumida
                   - r.quantidade_retornada;

        IF v_retorno > 0 THEN
            UPDATE distribuicoes_liberacoes_cestas
               SET quantidade_retornada = quantidade_retornada + v_retorno
             WHERE id = r.id;

            UPDATE lotes_montagem
               SET quantidade_disponivel = quantidade_disponivel + v_retorno,
                   status = 'ATIVO'
             WHERE id = r.lote_montagem_id;
        END IF;
    END LOOP;

    UPDATE distribuicoes
       SET status = 'ENCERRADA',
           usuario_encerramento_id = p_usuario_id,
           encerramento_em = now(),
           atualizado_em = now()
     WHERE id = p_distribuicao_id;
END;
$$;

--
-- Name: entregar_cesta_adicional(bigint, bigint); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.entregar_cesta_adicional(p_cesta_adicional_id bigint, p_usuario_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE v_ca cestas_adicionais%ROWTYPE; v_entrega bigint;
BEGIN
 SELECT * INTO v_ca FROM cestas_adicionais WHERE id=p_cesta_adicional_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cesta adicional não encontrada'; END IF;
 IF v_ca.status<>'AUTORIZADA' THEN RAISE EXCEPTION 'Cesta adicional não está autorizada'; END IF;
 IF NOT EXISTS(SELECT 1 FROM distribuicoes WHERE id=v_ca.distribuicao_id AND status='ABERTA') THEN RAISE EXCEPTION 'Distribuição não está aberta'; END IF;
 INSERT INTO entregas_cestas(distribuicao_id,cesta_adicional_id,quantidade,usuario_id)
 VALUES(v_ca.distribuicao_id,v_ca.id,v_ca.quantidade,p_usuario_id) RETURNING id INTO v_entrega;
 PERFORM fn_consumir_cestas_liberadas(v_ca.distribuicao_id,v_ca.quantidade,v_entrega,p_usuario_id);
 UPDATE cestas_adicionais SET status='ENTREGUE',usuario_entrega_id=p_usuario_id,entregue_em=now() WHERE id=v_ca.id;
 RETURN v_entrega;
END$$;

--
-- Name: estornar_retirada(bigint, bigint, text); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.estornar_retirada(p_retirada_id bigint, p_usuario_id bigint, p_motivo text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE v_r retiradas%ROWTYPE; v_e bigint; x record;
BEGIN
 SELECT * INTO v_r FROM retiradas WHERE id=p_retirada_id FOR UPDATE;
 IF NOT FOUND OR v_r.status<>'VALIDA' THEN RAISE EXCEPTION 'Retirada não encontrada ou já estornada'; END IF;
 SELECT id INTO v_e FROM entregas_cestas WHERE retirada_id=p_retirada_id FOR UPDATE;
 IF v_e IS NULL THEN RAISE EXCEPTION 'Entrega física não encontrada'; END IF;
 FOR x IN SELECT * FROM entregas_cestas_lotes WHERE entrega_cesta_id=v_e FOR UPDATE LOOP
   UPDATE distribuicoes_liberacoes_cestas SET quantidade_consumida=quantidade_consumida-x.quantidade WHERE id=x.liberacao_cesta_id;
   INSERT INTO movimentacoes_cestas(lote_montagem_id,tipo,quantidade,sentido,referencia_tipo,referencia_id,usuario_id,observacao)
   VALUES(x.lote_montagem_id,'ESTORNO_ENTREGA',x.quantidade,1,'ESTORNO_RETIRADA',p_retirada_id,p_usuario_id,p_motivo);
 END LOOP;
 UPDATE retiradas SET status='ESTORNADA' WHERE id=p_retirada_id;
 INSERT INTO retiradas_estornos(retirada_id,motivo,usuario_id) VALUES(p_retirada_id,p_motivo,p_usuario_id);
 UPDATE direitos_beneficio SET status='DISPONIVEL',atualizado_em=now() WHERE id=v_r.direito_beneficio_id;
END$$;

--
-- Name: fn_beneficiario_tem_pendencia_anterior(bigint, bigint); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.fn_beneficiario_tem_pendencia_anterior(p_beneficiario_id bigint, p_competencia_id bigint) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pastoral', 'pg_catalog'
    AS $$
WITH atual AS (SELECT ano,mes FROM pastoral.competencias WHERE id=p_competencia_id), anterior AS (
 SELECT db.status,a.status ausencia_status FROM pastoral.direitos_beneficio db
 JOIN pastoral.competencias c ON c.id=db.competencia_id CROSS JOIN atual
 LEFT JOIN pastoral.ausencias a ON a.direito_beneficio_id=db.id
 WHERE db.beneficiario_id=p_beneficiario_id AND db.tipo='REGULAR'
 AND (c.ano*12+c.mes)<(atual.ano*12+atual.mes)
 ORDER BY c.ano DESC,c.mes DESC LIMIT 1)
SELECT COALESCE((SELECT status IN('AUSENTE','AUSENTE_NAO_JUSTIFICADO','NAO_ATENDIDO_IRREGULARIDADE')
 AND COALESCE(ausencia_status,'SEM_JUSTIFICATIVA')<>'JUSTIFICADA' FROM anterior),false);
$$;

--
-- Name: fn_consumir_cestas_liberadas(bigint, integer, bigint, bigint); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.fn_consumir_cestas_liberadas(p_distribuicao_id bigint, p_quantidade integer, p_entrega_id bigint, p_usuario_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE r record; v_restante int:=p_quantidade; v_tomar int;
BEGIN
 FOR r IN SELECT * FROM distribuicoes_liberacoes_cestas
          WHERE distribuicao_id=p_distribuicao_id AND quantidade_liberada-quantidade_consumida-quantidade_retornada>0
          ORDER BY liberado_em,id FOR UPDATE LOOP
   EXIT WHEN v_restante=0;
   v_tomar:=LEAST(v_restante,r.quantidade_liberada-r.quantidade_consumida-r.quantidade_retornada);
   UPDATE distribuicoes_liberacoes_cestas SET quantidade_consumida=quantidade_consumida+v_tomar WHERE id=r.id;
   INSERT INTO entregas_cestas_lotes(entrega_cesta_id,liberacao_cesta_id,lote_montagem_id,quantidade)
   VALUES(p_entrega_id,r.id,r.lote_montagem_id,v_tomar);
   INSERT INTO movimentacoes_cestas(lote_montagem_id,tipo,quantidade,sentido,referencia_tipo,referencia_id,usuario_id)
   VALUES(r.lote_montagem_id,'ENTREGA',v_tomar,-1,'ENTREGA_CESTA',p_entrega_id,p_usuario_id);
   v_restante:=v_restante-v_tomar;
 END LOOP;
 IF v_restante>0 THEN RAISE EXCEPTION 'Cestas liberadas insuficientes'; END IF;
END$$;

--
-- Name: fn_normalizar_documento(text); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.fn_normalizar_documento(p_texto text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT upper(regexp_replace(COALESCE(p_texto,''), '[^[:alnum:]]', '', 'g'));
$$;

--
-- Name: fn_normalizar_texto(text); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.fn_normalizar_texto(p_texto text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT trim(regexp_replace(
        translate(lower(COALESCE(p_texto,'')),
                  'áàâãäéèêëíìîïóòôõöúùûüçñ',
                  'aaaaaeeeeiiiiooooouuuucn'),
        '\s+', ' ', 'g'));
$$;

--
-- Name: fn_nth_weekday_of_month(integer, integer, integer, integer); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.fn_nth_weekday_of_month(p_year integer, p_month integer, p_isodow integer, p_n integer) RETURNS date
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
WITH first_day AS (SELECT make_date(p_year,p_month,1) d),
first_target AS (
 SELECT d + ((p_isodow - extract(isodow from d)::int + 7) % 7) AS d FROM first_day
)
SELECT (d + ((p_n-1)*7))::date FROM first_target;
$$;

--
-- Name: gerar_competencia(integer, integer, bigint); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.gerar_competencia(p_ano integer, p_mes integer, p_usuario_id bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE v_comp bigint; r record; v_data date;
BEGIN
 IF p_mes NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Mês inválido'; END IF;
 INSERT INTO competencias(ano,mes) VALUES(p_ano,p_mes)
 ON CONFLICT(ano,mes) DO UPDATE SET ano=EXCLUDED.ano RETURNING id INTO v_comp;
 FOR r IN SELECT * FROM grupos_distribuicao WHERE ativo ORDER BY ordem LOOP
   v_data := CASE r.regra_calendario
     WHEN 'SEGUNDO_SABADO' THEN fn_nth_weekday_of_month(p_ano,p_mes,6,2)
     WHEN 'QUARTO_SABADO' THEN fn_nth_weekday_of_month(p_ano,p_mes,6,4)
     ELSE NULL END;
   IF v_data IS NOT NULL THEN
     INSERT INTO distribuicoes(competencia_id,grupo_distribuicao_id,data_prevista)
     VALUES(v_comp,r.id,v_data) ON CONFLICT(competencia_id,grupo_distribuicao_id) DO NOTHING;
   END IF;
 END LOOP;
 INSERT INTO direitos_beneficio(beneficiario_id,competencia_id,distribuicao_prevista_id)
 SELECT b.id,v_comp,d.id FROM beneficiarios b
 JOIN distribuicoes d ON d.competencia_id=v_comp AND d.grupo_distribuicao_id=b.grupo_distribuicao_id
 WHERE b.status='ATIVO'
 ON CONFLICT(beneficiario_id,competencia_id,tipo) DO NOTHING;
 RETURN v_comp;
END$$;

--
-- Name: liberar_cestas(bigint, bigint, integer, bigint); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.liberar_cestas(p_distribuicao_id bigint, p_lote_id bigint, p_quantidade integer, p_usuario_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE v_disp int; v_status text; v_id bigint;
BEGIN
 IF p_quantidade<=0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
 SELECT quantidade_disponivel,status INTO v_disp,v_status FROM lotes_montagem WHERE id=p_lote_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
 IF v_status<>'ATIVO' OR v_disp<p_quantidade THEN RAISE EXCEPTION 'Quantidade insuficiente no lote'; END IF;
 IF NOT EXISTS(SELECT 1 FROM distribuicoes WHERE id=p_distribuicao_id AND status IN ('PLANEJADA','PREPARADA','ABERTA')) THEN RAISE EXCEPTION 'Distribuição indisponível'; END IF;
 INSERT INTO distribuicoes_liberacoes_cestas(distribuicao_id,lote_montagem_id,quantidade_liberada,usuario_estoque_id)
 VALUES(p_distribuicao_id,p_lote_id,p_quantidade,p_usuario_id) RETURNING id INTO v_id;
 UPDATE lotes_montagem SET quantidade_disponivel=quantidade_disponivel-p_quantidade,
 status=CASE WHEN quantidade_disponivel-p_quantidade=0 THEN 'ESGOTADO' ELSE status END WHERE id=p_lote_id;
 UPDATE distribuicoes SET status=CASE WHEN status='PLANEJADA' THEN 'PREPARADA' ELSE status END, atualizado_em=now() WHERE id=p_distribuicao_id;
 RETURN v_id;
END$$;

--
-- Name: montar_cestas(bigint, integer, bigint); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.montar_cestas(p_planejamento_versao_id bigint, p_quantidade integer, p_usuario_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE r record; v_lote bigint; v_fisico bigint; v_reservado bigint; v_necessario bigint;
BEGIN
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

--
-- Name: registrar_entrada_estoque(character varying, bigint, bigint, date, text, jsonb); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.registrar_entrada_estoque(p_tipo character varying, p_doador_id bigint, p_usuario_id bigint, p_data_entrada date, p_observacao text, p_itens jsonb) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_entrada_id bigint;
    v_item jsonb;
    v_item_id bigint;
    v_apresentacao bigint;
    v_quantidade integer;
    v_validade date;
BEGIN
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

--
-- Name: registrar_perda_estoque(bigint, integer, bigint, text, bigint); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.registrar_perda_estoque(p_apresentacao_insumo_id bigint, p_quantidade integer, p_motivo_perda_id bigint, p_observacao text, p_usuario_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_saldo bigint;
    v_id bigint;
BEGIN
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

--
-- Name: registrar_retirada(bigint, bigint, character varying, character varying, bigint); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.registrar_retirada(p_direito_id bigint, p_distribuicao_id bigint, p_tipo character varying, p_forma_identificacao character varying, p_usuario_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_direito pastoral.direitos_beneficio%ROWTYPE;
    v_retirada bigint;
    v_entrega bigint;
    v_competencia_distribuicao bigint;
    v_classificacao varchar(20);
BEGIN
    SELECT * INTO v_direito
      FROM pastoral.direitos_beneficio
     WHERE id = p_direito_id
     FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Direito não encontrado'; END IF;
    IF v_direito.status <> 'DISPONIVEL' THEN
        RAISE EXCEPTION 'Direito não disponível: %', v_direito.status;
    END IF;

    SELECT competencia_id INTO v_competencia_distribuicao
      FROM pastoral.distribuicoes
     WHERE id = p_distribuicao_id AND status = 'ABERTA';

    IF NOT FOUND THEN RAISE EXCEPTION 'Distribuição não está aberta'; END IF;
    IF v_competencia_distribuicao <> v_direito.competencia_id THEN
        RAISE EXCEPTION 'Direito e distribuição pertencem a competências diferentes';
    END IF;

    SELECT classificacao_inicial INTO v_classificacao
      FROM pastoral.distribuicoes_checkins
     WHERE distribuicao_id = p_distribuicao_id
       AND beneficiario_id = v_direito.beneficiario_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Beneficiário ainda não realizou check-in nesta distribuição';
    END IF;
    IF pastoral.fn_beneficiario_tem_pendencia_anterior(
        v_direito.beneficiario_id,
        v_direito.competencia_id
    ) THEN
        RAISE EXCEPTION 'Beneficiário possui pendência anterior não regularizada';
    END IF;

    IF v_classificacao = 'PENDENTE' AND EXISTS (
        SELECT 1
          FROM pastoral.distribuicoes_checkins ci
          JOIN pastoral.direitos_beneficio dr
            ON dr.beneficiario_id = ci.beneficiario_id
           AND dr.competencia_id = v_direito.competencia_id
           AND dr.tipo = 'REGULAR'
         WHERE ci.distribuicao_id = p_distribuicao_id
           AND ci.classificacao_inicial = 'REGULAR'
           AND dr.status = 'DISPONIVEL'
           AND dr.distribuicao_prevista_id = p_distribuicao_id
    ) THEN
        RAISE EXCEPTION 'Existem beneficiários regulares presentes aguardando atendimento';
    END IF;

    INSERT INTO pastoral.retiradas(
        direito_beneficio_id, distribuicao_id, beneficiario_id, tipo,
        forma_identificacao, usuario_operador_id
    ) VALUES (
        p_direito_id, p_distribuicao_id, v_direito.beneficiario_id, p_tipo,
        p_forma_identificacao, p_usuario_id
    ) RETURNING id INTO v_retirada;

    INSERT INTO pastoral.entregas_cestas(
        distribuicao_id, retirada_id, quantidade, usuario_id
    ) VALUES (p_distribuicao_id, v_retirada, 1, p_usuario_id)
    RETURNING id INTO v_entrega;

    PERFORM pastoral.fn_consumir_cestas_liberadas(
        p_distribuicao_id, 1, v_entrega, p_usuario_id
    );

    UPDATE pastoral.direitos_beneficio
       SET status = 'RETIRADO', atualizado_em = now()
     WHERE id = p_direito_id;

    RETURN v_retirada;
END;
$$;

--
-- Name: trg_documentos_normalizacao(); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.trg_documentos_normalizacao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.numero_normalizado := fn_normalizar_documento(NEW.numero);
    RETURN NEW;
END$$;

--
-- Name: trg_pessoas_normalizacao(); Type: FUNCTION; Schema: pastoral; Owner: -
--

CREATE FUNCTION pastoral.trg_pessoas_normalizacao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.nome_normalizado := pastoral.fn_normalizar_texto(NEW.nome_completo);
    NEW.atualizado_em := now();
    RETURN NEW;
END
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: arquivos; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.arquivos (
    id bigint NOT NULL,
    storage_key character varying(500) NOT NULL,
    nome_original character varying(255),
    mime_type character varying(100),
    tamanho_bytes bigint,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT arquivos_tamanho_bytes_check CHECK (((tamanho_bytes IS NULL) OR (tamanho_bytes >= 0)))
);

--
-- Name: arquivos_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.arquivos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.arquivos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: auditoria; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.auditoria (
    id bigint NOT NULL,
    usuario_id bigint,
    entidade character varying(100) NOT NULL,
    entidade_id bigint,
    operacao character varying(50) NOT NULL,
    estado_anterior jsonb,
    estado_novo jsonb,
    motivo text,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: auditoria_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.auditoria ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.auditoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: ausencias; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.ausencias (
    id bigint NOT NULL,
    direito_beneficio_id bigint NOT NULL,
    status character varying(40) DEFAULT 'SEM_JUSTIFICATIVA'::character varying NOT NULL,
    identificado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ausencias_status_check CHECK (((status)::text = ANY ((ARRAY['SEM_JUSTIFICATIVA'::character varying, 'JUSTIFICATIVA_PENDENTE'::character varying, 'JUSTIFICADA'::character varying, 'JUSTIFICATIVA_REJEITADA'::character varying])::text[])))
);

--
-- Name: ausencias_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.ausencias ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.ausencias_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: beneficiarios; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.beneficiarios (
    id bigint NOT NULL,
    pessoa_id bigint NOT NULL,
    grupo_distribuicao_id bigint,
    status character varying(20) DEFAULT 'ATIVO'::character varying NOT NULL,
    origem_cadastro character varying(20) DEFAULT 'SISTEMA'::character varying NOT NULL,
    data_admissao date DEFAULT CURRENT_DATE NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT beneficiarios_origem_cadastro_check CHECK (((origem_cadastro)::text = ANY ((ARRAY['SISTEMA'::character varying, 'LEGADO'::character varying])::text[]))),
    CONSTRAINT beneficiarios_status_check CHECK (((status)::text = ANY ((ARRAY['ATIVO'::character varying, 'DESLIGADO'::character varying])::text[])))
);

--
-- Name: beneficiarios_desligamentos; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.beneficiarios_desligamentos (
    id bigint NOT NULL,
    beneficiario_id bigint NOT NULL,
    motivo_desligamento_id bigint NOT NULL,
    observacao text,
    usuario_responsavel_id bigint NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: beneficiarios_desligamentos_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.beneficiarios_desligamentos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.beneficiarios_desligamentos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: beneficiarios_grupos_historico; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.beneficiarios_grupos_historico (
    id bigint NOT NULL,
    beneficiario_id bigint NOT NULL,
    grupo_origem_id bigint,
    grupo_destino_id bigint NOT NULL,
    vigencia_inicio timestamp with time zone DEFAULT now() NOT NULL,
    motivo text,
    usuario_id bigint NOT NULL
);

--
-- Name: beneficiarios_grupos_historico_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.beneficiarios_grupos_historico ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.beneficiarios_grupos_historico_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: beneficiarios_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.beneficiarios ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.beneficiarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: candidaturas; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.candidaturas (
    id bigint NOT NULL,
    pessoa_id bigint NOT NULL,
    status character varying(30) DEFAULT 'AGUARDANDO'::character varying NOT NULL,
    data_entrada timestamp with time zone DEFAULT now() NOT NULL,
    prioridade_excepcional boolean DEFAULT false NOT NULL,
    justificativa_prioridade text,
    usuario_priorizacao_id bigint,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT candidaturas_check CHECK (((NOT prioridade_excepcional) OR (justificativa_prioridade IS NOT NULL))),
    CONSTRAINT candidaturas_status_check CHECK (((status)::text = ANY ((ARRAY['AGUARDANDO'::character varying, 'CONVOCADO'::character varying, 'ADMITIDO'::character varying, 'NAO_LOCALIZADO'::character varying, 'DESISTIU'::character varying, 'CANCELADO'::character varying])::text[])))
);

--
-- Name: candidaturas_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.candidaturas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.candidaturas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: candidaturas_tentativas_contato; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.candidaturas_tentativas_contato (
    id bigint NOT NULL,
    candidatura_id bigint NOT NULL,
    usuario_id bigint NOT NULL,
    resultado character varying(100),
    observacao text,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: candidaturas_tentativas_contato_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.candidaturas_tentativas_contato ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.candidaturas_tentativas_contato_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: categorias_prioridade_insumo; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.categorias_prioridade_insumo (
    id bigint NOT NULL,
    codigo character varying(30) NOT NULL,
    descricao character varying(100) NOT NULL,
    ordem_prioridade smallint NOT NULL
);

--
-- Name: categorias_prioridade_insumo_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.categorias_prioridade_insumo ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.categorias_prioridade_insumo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: cestas_adicionais; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.cestas_adicionais (
    id bigint NOT NULL,
    beneficiario_id bigint NOT NULL,
    distribuicao_id bigint NOT NULL,
    modelo_cesta_id bigint NOT NULL,
    quantidade integer DEFAULT 1 NOT NULL,
    justificativa text NOT NULL,
    usuario_autorizador_id bigint NOT NULL,
    autorizado_em timestamp with time zone DEFAULT now() NOT NULL,
    usuario_entrega_id bigint,
    entregue_em timestamp with time zone,
    status character varying(20) DEFAULT 'AUTORIZADA'::character varying NOT NULL,
    CONSTRAINT cestas_adicionais_quantidade_check CHECK ((quantidade > 0)),
    CONSTRAINT cestas_adicionais_status_check CHECK (((status)::text = ANY ((ARRAY['AUTORIZADA'::character varying, 'ENTREGUE'::character varying, 'CANCELADA'::character varying])::text[])))
);

--
-- Name: cestas_adicionais_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.cestas_adicionais ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.cestas_adicionais_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: competencias; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.competencias (
    id bigint NOT NULL,
    ano smallint NOT NULL,
    mes smallint NOT NULL,
    status character varying(20) DEFAULT 'ABERTA'::character varying NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT competencias_mes_check CHECK (((mes >= 1) AND (mes <= 12))),
    CONSTRAINT competencias_status_check CHECK (((status)::text = ANY ((ARRAY['ABERTA'::character varying, 'ENCERRADA'::character varying])::text[])))
);

--
-- Name: competencias_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.competencias ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.competencias_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: configuracoes_capacidade; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.configuracoes_capacidade (
    id bigint NOT NULL,
    capacidade integer NOT NULL,
    vigencia_inicio timestamp with time zone DEFAULT now() NOT NULL,
    justificativa text NOT NULL,
    usuario_responsavel_id bigint NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT configuracoes_capacidade_capacidade_check CHECK ((capacidade > 0))
);

--
-- Name: configuracoes_capacidade_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.configuracoes_capacidade ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.configuracoes_capacidade_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: direitos_beneficio; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.direitos_beneficio (
    id bigint NOT NULL,
    beneficiario_id bigint NOT NULL,
    competencia_id bigint NOT NULL,
    distribuicao_prevista_id bigint,
    tipo character varying(20) DEFAULT 'REGULAR'::character varying NOT NULL,
    status character varying(40) DEFAULT 'DISPONIVEL'::character varying NOT NULL,
    origem character varying(30) DEFAULT 'GERACAO_COMPETENCIA'::character varying NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_direitos_beneficio_status CHECK (((status)::text = ANY ((ARRAY['DISPONIVEL'::character varying, 'RETIRADO'::character varying, 'AUSENTE'::character varying, 'AUSENTE_JUSTIFICADO'::character varying, 'AUSENTE_NAO_JUSTIFICADO'::character varying, 'NAO_ATENDIDO_ESTOQUE'::character varying, 'NAO_ATENDIDO_IRREGULARIDADE'::character varying, 'ENCERRADO'::character varying])::text[]))),
    CONSTRAINT direitos_beneficio_tipo_check CHECK (((tipo)::text = 'REGULAR'::text))
);

--
-- Name: direitos_beneficio_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.direitos_beneficio ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.direitos_beneficio_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: distribuicoes; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.distribuicoes (
    id bigint NOT NULL,
    competencia_id bigint NOT NULL,
    grupo_distribuicao_id bigint NOT NULL,
    data_prevista date NOT NULL,
    data_real date,
    status character varying(20) DEFAULT 'PLANEJADA'::character varying NOT NULL,
    usuario_abertura_id bigint,
    abertura_em timestamp with time zone,
    usuario_encerramento_id bigint,
    encerramento_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT distribuicoes_status_check CHECK (((status)::text = ANY ((ARRAY['PLANEJADA'::character varying, 'PREPARADA'::character varying, 'ABERTA'::character varying, 'ENCERRADA'::character varying])::text[])))
);

--
-- Name: distribuicoes_checkins; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.distribuicoes_checkins (
    id bigint NOT NULL,
    distribuicao_id bigint NOT NULL,
    beneficiario_id bigint NOT NULL,
    classificacao_inicial character varying(20) NOT NULL,
    usuario_id bigint NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT distribuicoes_checkins_classificacao_inicial_check CHECK (((classificacao_inicial)::text = ANY ((ARRAY['REGULAR'::character varying, 'PENDENTE'::character varying])::text[])))
);

--
-- Name: distribuicoes_checkins_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.distribuicoes_checkins ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.distribuicoes_checkins_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: distribuicoes_historico; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.distribuicoes_historico (
    id bigint NOT NULL,
    distribuicao_id bigint NOT NULL,
    tipo_evento character varying(50) NOT NULL,
    data_anterior date,
    data_nova date,
    motivo text,
    usuario_id bigint NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: distribuicoes_historico_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.distribuicoes_historico ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.distribuicoes_historico_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: distribuicoes_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.distribuicoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.distribuicoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: distribuicoes_liberacoes_cestas; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.distribuicoes_liberacoes_cestas (
    id bigint NOT NULL,
    distribuicao_id bigint NOT NULL,
    lote_montagem_id bigint NOT NULL,
    quantidade_liberada integer NOT NULL,
    quantidade_consumida integer DEFAULT 0 NOT NULL,
    quantidade_retornada integer DEFAULT 0 NOT NULL,
    usuario_estoque_id bigint NOT NULL,
    liberado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT distribuicoes_liberacoes_cestas_check CHECK (((quantidade_consumida + quantidade_retornada) <= quantidade_liberada)),
    CONSTRAINT distribuicoes_liberacoes_cestas_quantidade_consumida_check CHECK ((quantidade_consumida >= 0)),
    CONSTRAINT distribuicoes_liberacoes_cestas_quantidade_liberada_check CHECK ((quantidade_liberada > 0)),
    CONSTRAINT distribuicoes_liberacoes_cestas_quantidade_retornada_check CHECK ((quantidade_retornada >= 0))
);

--
-- Name: distribuicoes_liberacoes_cestas_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.distribuicoes_liberacoes_cestas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.distribuicoes_liberacoes_cestas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: doadores; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.doadores (
    id bigint NOT NULL,
    tipo character varying(30) NOT NULL,
    nome character varying(200) NOT NULL,
    telefone character varying(30),
    observacao text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT doadores_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['PESSOA'::character varying, 'INSTITUICAO'::character varying])::text[])))
);

--
-- Name: doadores_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.doadores ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.doadores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: entradas_estoque; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.entradas_estoque (
    id bigint NOT NULL,
    tipo character varying(30) NOT NULL,
    doador_id bigint,
    usuario_id bigint NOT NULL,
    data_entrada date DEFAULT CURRENT_DATE NOT NULL,
    observacao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entradas_estoque_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['DOACAO'::character varying, 'COMPRA'::character varying, 'SALDO_INICIAL'::character varying, 'AJUSTE_POSITIVO'::character varying])::text[])))
);

--
-- Name: entradas_estoque_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.entradas_estoque ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.entradas_estoque_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: entradas_estoque_itens; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.entradas_estoque_itens (
    id bigint NOT NULL,
    entrada_estoque_id bigint NOT NULL,
    apresentacao_insumo_id bigint NOT NULL,
    quantidade integer NOT NULL,
    validade date,
    CONSTRAINT entradas_estoque_itens_quantidade_check CHECK ((quantidade > 0))
);

--
-- Name: entradas_estoque_itens_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.entradas_estoque_itens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.entradas_estoque_itens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: entregas_cestas; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.entregas_cestas (
    id bigint NOT NULL,
    distribuicao_id bigint NOT NULL,
    retirada_id bigint,
    cesta_adicional_id bigint,
    quantidade integer DEFAULT 1 NOT NULL,
    usuario_id bigint NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entregas_cestas_check CHECK (((((retirada_id IS NOT NULL))::integer + ((cesta_adicional_id IS NOT NULL))::integer) = 1)),
    CONSTRAINT entregas_cestas_quantidade_check CHECK ((quantidade > 0))
);

--
-- Name: entregas_cestas_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.entregas_cestas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.entregas_cestas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: entregas_cestas_lotes; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.entregas_cestas_lotes (
    id bigint NOT NULL,
    entrega_cesta_id bigint NOT NULL,
    liberacao_cesta_id bigint NOT NULL,
    lote_montagem_id bigint NOT NULL,
    quantidade integer NOT NULL,
    CONSTRAINT entregas_cestas_lotes_quantidade_check CHECK ((quantidade > 0))
);

--
-- Name: entregas_cestas_lotes_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.entregas_cestas_lotes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.entregas_cestas_lotes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: grupos_distribuicao; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.grupos_distribuicao (
    id bigint NOT NULL,
    codigo character varying(30) NOT NULL,
    nome character varying(100) NOT NULL,
    regra_calendario character varying(30) NOT NULL,
    ordem smallint NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    CONSTRAINT grupos_distribuicao_regra_calendario_check CHECK (((regra_calendario)::text = ANY ((ARRAY['SEGUNDO_SABADO'::character varying, 'QUARTO_SABADO'::character varying, 'MANUAL'::character varying])::text[])))
);

--
-- Name: grupos_distribuicao_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.grupos_distribuicao ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.grupos_distribuicao_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: insumos; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.insumos (
    id bigint NOT NULL,
    nome character varying(150) NOT NULL,
    categoria_prioridade_id bigint,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: insumos_apresentacoes; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.insumos_apresentacoes (
    id bigint NOT NULL,
    insumo_id bigint NOT NULL,
    descricao character varying(150) NOT NULL,
    quantidade_referencia numeric(14,3),
    unidade_medida character varying(20),
    ativo boolean DEFAULT true NOT NULL,
    CONSTRAINT insumos_apresentacoes_quantidade_referencia_check CHECK (((quantidade_referencia IS NULL) OR (quantidade_referencia > (0)::numeric)))
);

--
-- Name: insumos_apresentacoes_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.insumos_apresentacoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.insumos_apresentacoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: insumos_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.insumos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.insumos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: inventarios; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.inventarios (
    id bigint NOT NULL,
    status character varying(20) DEFAULT 'ABERTO'::character varying NOT NULL,
    usuario_responsavel_id bigint NOT NULL,
    iniciado_em timestamp with time zone DEFAULT now() NOT NULL,
    concluido_em timestamp with time zone,
    CONSTRAINT inventarios_status_check CHECK (((status)::text = ANY ((ARRAY['ABERTO'::character varying, 'CONCLUIDO'::character varying, 'CANCELADO'::character varying])::text[])))
);

--
-- Name: inventarios_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.inventarios ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.inventarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: inventarios_itens; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.inventarios_itens (
    id bigint NOT NULL,
    inventario_id bigint NOT NULL,
    apresentacao_insumo_id bigint NOT NULL,
    saldo_sistema integer NOT NULL,
    saldo_fisico integer NOT NULL,
    diferenca integer GENERATED ALWAYS AS ((saldo_fisico - saldo_sistema)) STORED,
    CONSTRAINT inventarios_itens_saldo_fisico_check CHECK ((saldo_fisico >= 0))
);

--
-- Name: inventarios_itens_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.inventarios_itens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.inventarios_itens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: justificativas_ausencia; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.justificativas_ausencia (
    id bigint NOT NULL,
    ausencia_id bigint NOT NULL,
    descricao text NOT NULL,
    momento character varying(30) NOT NULL,
    usuario_registro_id bigint NOT NULL,
    data_apresentacao timestamp with time zone DEFAULT now() NOT NULL,
    decisao character varying(20) DEFAULT 'PENDENTE'::character varying NOT NULL,
    usuario_decisao_id bigint,
    data_decisao timestamp with time zone,
    observacao_decisao text,
    CONSTRAINT justificativas_ausencia_decisao_check CHECK (((decisao)::text = ANY ((ARRAY['PENDENTE'::character varying, 'ACEITA'::character varying, 'REJEITADA'::character varying])::text[]))),
    CONSTRAINT justificativas_ausencia_momento_check CHECK (((momento)::text = ANY ((ARRAY['ANTES_DISTRIBUICAO'::character varying, 'DEPOIS_DISTRIBUICAO'::character varying])::text[])))
);

--
-- Name: justificativas_ausencia_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.justificativas_ausencia ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.justificativas_ausencia_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: lotes_montagem; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.lotes_montagem (
    id bigint NOT NULL,
    planejamento_versao_id bigint NOT NULL,
    quantidade_montada integer NOT NULL,
    quantidade_disponivel integer NOT NULL,
    usuario_id bigint NOT NULL,
    montado_em timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'ATIVO'::character varying NOT NULL,
    CONSTRAINT lotes_montagem_check CHECK ((quantidade_disponivel <= quantidade_montada)),
    CONSTRAINT lotes_montagem_quantidade_disponivel_check CHECK ((quantidade_disponivel >= 0)),
    CONSTRAINT lotes_montagem_quantidade_montada_check CHECK ((quantidade_montada > 0)),
    CONSTRAINT lotes_montagem_status_check CHECK (((status)::text = ANY ((ARRAY['ATIVO'::character varying, 'ESGOTADO'::character varying, 'DESMONTADO'::character varying])::text[])))
);

--
-- Name: lotes_montagem_ajustes; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.lotes_montagem_ajustes (
    id bigint NOT NULL,
    lote_montagem_id bigint NOT NULL,
    quantidade_cestas_afetadas integer NOT NULL,
    motivo text NOT NULL,
    usuario_id bigint NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lotes_montagem_ajustes_quantidade_cestas_afetadas_check CHECK ((quantidade_cestas_afetadas > 0))
);

--
-- Name: lotes_montagem_ajustes_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.lotes_montagem_ajustes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.lotes_montagem_ajustes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: lotes_montagem_ajustes_itens; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.lotes_montagem_ajustes_itens (
    id bigint NOT NULL,
    ajuste_id bigint NOT NULL,
    apresentacao_insumo_id bigint NOT NULL,
    operacao character varying(20) NOT NULL,
    quantidade_por_cesta integer NOT NULL,
    CONSTRAINT lotes_montagem_ajustes_itens_operacao_check CHECK (((operacao)::text = ANY ((ARRAY['ADICIONAR'::character varying, 'REMOVER'::character varying])::text[]))),
    CONSTRAINT lotes_montagem_ajustes_itens_quantidade_por_cesta_check CHECK ((quantidade_por_cesta > 0))
);

--
-- Name: lotes_montagem_ajustes_itens_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.lotes_montagem_ajustes_itens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.lotes_montagem_ajustes_itens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: lotes_montagem_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.lotes_montagem ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.lotes_montagem_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: lotes_montagem_itens; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.lotes_montagem_itens (
    id bigint NOT NULL,
    lote_montagem_id bigint NOT NULL,
    apresentacao_insumo_id bigint NOT NULL,
    quantidade_por_cesta integer NOT NULL,
    CONSTRAINT lotes_montagem_itens_quantidade_por_cesta_check CHECK ((quantidade_por_cesta > 0))
);

--
-- Name: lotes_montagem_itens_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.lotes_montagem_itens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.lotes_montagem_itens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: modelos_cesta; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.modelos_cesta (
    id bigint NOT NULL,
    nome character varying(150) NOT NULL,
    tipo character varying(30) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT modelos_cesta_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['REGULAR'::character varying, 'EMERGENCIAL'::character varying, 'ESPECIAL'::character varying, 'OUTRO'::character varying])::text[])))
);

--
-- Name: modelos_cesta_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.modelos_cesta ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.modelos_cesta_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: modelos_cesta_versoes; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.modelos_cesta_versoes (
    id bigint NOT NULL,
    modelo_cesta_id bigint NOT NULL,
    numero_versao integer NOT NULL,
    meta_itens integer,
    usuario_id bigint NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT modelos_cesta_versoes_meta_itens_check CHECK (((meta_itens IS NULL) OR (meta_itens > 0)))
);

--
-- Name: modelos_cesta_versoes_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.modelos_cesta_versoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.modelos_cesta_versoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: modelos_cesta_versoes_itens; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.modelos_cesta_versoes_itens (
    id bigint NOT NULL,
    modelo_cesta_versao_id bigint NOT NULL,
    apresentacao_insumo_id bigint NOT NULL,
    quantidade integer NOT NULL,
    CONSTRAINT modelos_cesta_versoes_itens_quantidade_check CHECK ((quantidade > 0))
);

--
-- Name: modelos_cesta_versoes_itens_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.modelos_cesta_versoes_itens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.modelos_cesta_versoes_itens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: motivos_desligamento; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.motivos_desligamento (
    id bigint NOT NULL,
    codigo character varying(50) NOT NULL,
    descricao character varying(200) NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);

--
-- Name: motivos_desligamento_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.motivos_desligamento ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.motivos_desligamento_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: motivos_perda_estoque; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.motivos_perda_estoque (
    id bigint NOT NULL,
    codigo character varying(50) NOT NULL,
    descricao character varying(200) NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);

--
-- Name: motivos_perda_estoque_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.motivos_perda_estoque ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.motivos_perda_estoque_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: movimentacoes_cestas; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.movimentacoes_cestas (
    id bigint NOT NULL,
    lote_montagem_id bigint NOT NULL,
    tipo character varying(40) NOT NULL,
    quantidade integer NOT NULL,
    sentido smallint NOT NULL,
    referencia_tipo character varying(50),
    referencia_id bigint,
    usuario_id bigint NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL,
    observacao text,
    CONSTRAINT movimentacoes_cestas_quantidade_check CHECK ((quantidade > 0)),
    CONSTRAINT movimentacoes_cestas_sentido_check CHECK ((sentido = ANY (ARRAY['-1'::integer, 1]))),
    CONSTRAINT movimentacoes_cestas_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['MONTAGEM'::character varying, 'DESMONTAGEM'::character varying, 'ENTREGA'::character varying, 'ESTORNO_ENTREGA'::character varying])::text[])))
);

--
-- Name: movimentacoes_cestas_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.movimentacoes_cestas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.movimentacoes_cestas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: movimentacoes_insumos; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.movimentacoes_insumos (
    id bigint NOT NULL,
    apresentacao_insumo_id bigint NOT NULL,
    tipo character varying(40) NOT NULL,
    quantidade integer NOT NULL,
    sentido smallint NOT NULL,
    referencia_tipo character varying(50),
    referencia_id bigint,
    usuario_id bigint NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL,
    observacao text,
    CONSTRAINT movimentacoes_insumos_quantidade_check CHECK ((quantidade > 0)),
    CONSTRAINT movimentacoes_insumos_sentido_check CHECK ((sentido = ANY (ARRAY['-1'::integer, 1]))),
    CONSTRAINT movimentacoes_insumos_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['ENTRADA'::character varying, 'CONSUMO_MONTAGEM'::character varying, 'RETORNO_DESMONTAGEM'::character varying, 'PERDA'::character varying, 'AJUSTE_INVENTARIO'::character varying])::text[])))
);

--
-- Name: movimentacoes_insumos_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.movimentacoes_insumos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.movimentacoes_insumos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: perdas_estoque; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.perdas_estoque (
    id bigint NOT NULL,
    apresentacao_insumo_id bigint NOT NULL,
    quantidade integer NOT NULL,
    motivo_perda_id bigint NOT NULL,
    observacao text,
    usuario_id bigint NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT perdas_estoque_quantidade_check CHECK ((quantidade > 0))
);

--
-- Name: perdas_estoque_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.perdas_estoque ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.perdas_estoque_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: perfis; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.perfis (
    id bigint NOT NULL,
    codigo character varying(50) NOT NULL,
    nome character varying(100) NOT NULL,
    descricao text,
    ativo boolean DEFAULT true NOT NULL
);

--
-- Name: perfis_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.perfis ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.perfis_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: perfis_permissoes; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.perfis_permissoes (
    perfil_id bigint NOT NULL,
    permissao_id bigint NOT NULL
);

--
-- Name: permissoes; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.permissoes (
    id bigint NOT NULL,
    codigo character varying(100) NOT NULL,
    descricao text NOT NULL
);

--
-- Name: permissoes_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.permissoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.permissoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: pessoas; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.pessoas (
    id bigint NOT NULL,
    nome_completo character varying(200) NOT NULL,
    nome_normalizado character varying(200) NOT NULL,
    data_nascimento date,
    telefone character varying(30),
    observacao_operacional text,
    observacao_restrita text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: pessoas_arquivos; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.pessoas_arquivos (
    id bigint NOT NULL,
    pessoa_id bigint NOT NULL,
    arquivo_id bigint NOT NULL,
    tipo character varying(30) NOT NULL,
    principal boolean DEFAULT false NOT NULL,
    usuario_cadastro_id bigint,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pessoas_arquivos_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['FOTO_PERFIL'::character varying, 'DOCUMENTO'::character varying, 'OUTRO'::character varying])::text[])))
);

--
-- Name: pessoas_arquivos_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.pessoas_arquivos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.pessoas_arquivos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: pessoas_documentos; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.pessoas_documentos (
    id bigint NOT NULL,
    pessoa_id bigint NOT NULL,
    tipo_documento_id bigint NOT NULL,
    numero character varying(100) NOT NULL,
    numero_normalizado character varying(100) NOT NULL,
    arquivo_id bigint,
    principal boolean DEFAULT false NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: pessoas_documentos_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.pessoas_documentos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.pessoas_documentos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: pessoas_enderecos; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.pessoas_enderecos (
    id bigint NOT NULL,
    pessoa_id bigint NOT NULL,
    cep character varying(12),
    logradouro character varying(200),
    numero character varying(30),
    complemento character varying(100),
    bairro character varying(100),
    cidade character varying(100),
    uf character(2),
    referencia text,
    principal boolean DEFAULT false NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: pessoas_enderecos_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.pessoas_enderecos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.pessoas_enderecos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: pessoas_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.pessoas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.pessoas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: planejamentos_cesta; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.planejamentos_cesta (
    id bigint NOT NULL,
    competencia_id bigint NOT NULL,
    modelo_cesta_id bigint NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: planejamentos_cesta_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.planejamentos_cesta ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.planejamentos_cesta_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: planejamentos_cesta_versoes; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.planejamentos_cesta_versoes (
    id bigint NOT NULL,
    planejamento_cesta_id bigint NOT NULL,
    numero_versao integer NOT NULL,
    quantidade_planejada integer NOT NULL,
    status character varying(20) DEFAULT 'SIMULACAO'::character varying NOT NULL,
    usuario_aprovador_id bigint,
    aprovado_em timestamp with time zone,
    motivo_revisao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT planejamentos_cesta_versoes_quantidade_planejada_check CHECK ((quantidade_planejada > 0)),
    CONSTRAINT planejamentos_cesta_versoes_status_check CHECK (((status)::text = ANY ((ARRAY['SIMULACAO'::character varying, 'APROVADA'::character varying, 'SUBSTITUIDA'::character varying, 'CONCLUIDA'::character varying])::text[])))
);

--
-- Name: planejamentos_cesta_versoes_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.planejamentos_cesta_versoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.planejamentos_cesta_versoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: planejamentos_cesta_versoes_itens; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.planejamentos_cesta_versoes_itens (
    id bigint NOT NULL,
    planejamento_versao_id bigint NOT NULL,
    apresentacao_insumo_id bigint NOT NULL,
    quantidade_por_cesta integer NOT NULL,
    CONSTRAINT planejamentos_cesta_versoes_itens_quantidade_por_cesta_check CHECK ((quantidade_por_cesta > 0))
);

--
-- Name: planejamentos_cesta_versoes_itens_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.planejamentos_cesta_versoes_itens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.planejamentos_cesta_versoes_itens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: reservas_insumos; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.reservas_insumos (
    id bigint NOT NULL,
    planejamento_versao_id bigint NOT NULL,
    apresentacao_insumo_id bigint NOT NULL,
    quantidade_reservada integer NOT NULL,
    quantidade_consumida integer DEFAULT 0 NOT NULL,
    quantidade_liberada integer DEFAULT 0 NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reservas_insumos_check CHECK (((quantidade_consumida + quantidade_liberada) <= quantidade_reservada)),
    CONSTRAINT reservas_insumos_quantidade_consumida_check CHECK ((quantidade_consumida >= 0)),
    CONSTRAINT reservas_insumos_quantidade_liberada_check CHECK ((quantidade_liberada >= 0)),
    CONSTRAINT reservas_insumos_quantidade_reservada_check CHECK ((quantidade_reservada >= 0))
);

--
-- Name: reservas_insumos_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.reservas_insumos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.reservas_insumos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: retiradas; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.retiradas (
    id bigint NOT NULL,
    direito_beneficio_id bigint NOT NULL,
    distribuicao_id bigint NOT NULL,
    beneficiario_id bigint NOT NULL,
    tipo character varying(30) NOT NULL,
    status character varying(20) DEFAULT 'VALIDA'::character varying NOT NULL,
    forma_identificacao character varying(30),
    usuario_operador_id bigint NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT retiradas_forma_identificacao_check CHECK (((forma_identificacao IS NULL) OR ((forma_identificacao)::text = ANY ((ARRAY['DOCUMENTO'::character varying, 'FOTO_HISTORICO'::character varying, 'REPRESENTANTE'::character varying, 'CONTINGENCIA'::character varying])::text[])))),
    CONSTRAINT retiradas_status_check CHECK (((status)::text = ANY ((ARRAY['VALIDA'::character varying, 'ESTORNADA'::character varying])::text[]))),
    CONSTRAINT retiradas_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['TITULAR'::character varying, 'REPRESENTANTE'::character varying, 'PRIMEIRA_ENTREGA'::character varying, 'ANTECIPADA'::character varying, 'CONTINGENCIA'::character varying])::text[])))
);

--
-- Name: retiradas_estornos; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.retiradas_estornos (
    id bigint NOT NULL,
    retirada_id bigint NOT NULL,
    motivo text NOT NULL,
    usuario_id bigint NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: retiradas_estornos_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.retiradas_estornos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.retiradas_estornos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: retiradas_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.retiradas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.retiradas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: retiradas_representantes; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.retiradas_representantes (
    id bigint NOT NULL,
    retirada_id bigint NOT NULL,
    pessoa_representante_id bigint,
    nome character varying(200) NOT NULL,
    documento character varying(100),
    relacao character varying(100),
    autorizacao_declaratoria boolean DEFAULT true NOT NULL
);

--
-- Name: retiradas_representantes_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.retiradas_representantes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.retiradas_representantes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: tipos_documento; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.tipos_documento (
    id bigint NOT NULL,
    codigo character varying(30) NOT NULL,
    nome character varying(100) NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);

--
-- Name: tipos_documento_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.tipos_documento ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.tipos_documento_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: usuarios; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.usuarios (
    id bigint NOT NULL,
    pessoa_id bigint,
    login character varying(100) NOT NULL,
    senha_hash character varying(255) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ultimo_login_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: pastoral; Owner: -
--

ALTER TABLE pastoral.usuarios ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pastoral.usuarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: usuarios_perfis; Type: TABLE; Schema: pastoral; Owner: -
--

CREATE TABLE pastoral.usuarios_perfis (
    usuario_id bigint NOT NULL,
    perfil_id bigint NOT NULL
);

--
-- Name: vw_beneficiarios_ativos; Type: VIEW; Schema: pastoral; Owner: -
--

CREATE VIEW pastoral.vw_beneficiarios_ativos AS
 SELECT b.id AS beneficiario_id,
    p.id AS pessoa_id,
    p.nome_completo,
    p.data_nascimento,
    b.grupo_distribuicao_id,
    b.data_admissao
   FROM (pastoral.beneficiarios b
     JOIN pastoral.pessoas p ON ((p.id = b.pessoa_id)))
  WHERE ((b.status)::text = 'ATIVO'::text);

--
-- Name: vw_capacidade_atual; Type: VIEW; Schema: pastoral; Owner: -
--

CREATE VIEW pastoral.vw_capacidade_atual AS
 SELECT capacidade,
    ( SELECT count(*) AS count
           FROM pastoral.beneficiarios b
          WHERE ((b.status)::text = 'ATIVO'::text)) AS beneficiarios_ativos,
    (capacidade - ( SELECT count(*) AS count
           FROM pastoral.beneficiarios b
          WHERE ((b.status)::text = 'ATIVO'::text))) AS vagas_teoricas
   FROM pastoral.configuracoes_capacidade c
  ORDER BY vigencia_inicio DESC, id DESC
 LIMIT 1;

--
-- Name: vw_cestas_liberadas_distribuicao; Type: VIEW; Schema: pastoral; Owner: -
--

CREATE VIEW pastoral.vw_cestas_liberadas_distribuicao AS
 SELECT d.id AS distribuicao_id,
    COALESCE(sum(l.quantidade_liberada), (0)::bigint) AS quantidade_liberada,
    COALESCE(sum(l.quantidade_consumida), (0)::bigint) AS quantidade_consumida,
    COALESCE(sum(l.quantidade_retornada), (0)::bigint) AS quantidade_retornada,
    COALESCE(sum(((l.quantidade_liberada - l.quantidade_consumida) - l.quantidade_retornada)), (0)::bigint) AS quantidade_disponivel
   FROM (pastoral.distribuicoes d
     LEFT JOIN pastoral.distribuicoes_liberacoes_cestas l ON ((l.distribuicao_id = d.id)))
  GROUP BY d.id;

--
-- Name: vw_reservas_insumos_ativas; Type: VIEW; Schema: pastoral; Owner: -
--

CREATE VIEW pastoral.vw_reservas_insumos_ativas AS
 SELECT r.apresentacao_insumo_id,
    sum(((r.quantidade_reservada - r.quantidade_consumida) - r.quantidade_liberada)) AS saldo_reservado
   FROM (pastoral.reservas_insumos r
     JOIN pastoral.planejamentos_cesta_versoes v ON ((v.id = r.planejamento_versao_id)))
  WHERE ((v.status)::text = 'APROVADA'::text)
  GROUP BY r.apresentacao_insumo_id;

--
-- Name: vw_saldo_insumos; Type: VIEW; Schema: pastoral; Owner: -
--

CREATE VIEW pastoral.vw_saldo_insumos AS
 SELECT ai.id AS apresentacao_insumo_id,
    i.nome AS insumo,
    ai.descricao AS apresentacao,
    COALESCE(sum((mi.quantidade * mi.sentido)), (0)::bigint) AS saldo_fisico
   FROM ((pastoral.insumos_apresentacoes ai
     JOIN pastoral.insumos i ON ((i.id = ai.insumo_id)))
     LEFT JOIN pastoral.movimentacoes_insumos mi ON ((mi.apresentacao_insumo_id = ai.id)))
  GROUP BY ai.id, i.nome, ai.descricao;

--
-- Name: vw_disponibilidade_insumos; Type: VIEW; Schema: pastoral; Owner: -
--

CREATE VIEW pastoral.vw_disponibilidade_insumos AS
 SELECT s.apresentacao_insumo_id,
    s.insumo,
    s.apresentacao,
    s.saldo_fisico,
    COALESCE(r.saldo_reservado, (0)::bigint) AS saldo_reservado,
    (s.saldo_fisico - COALESCE(r.saldo_reservado, (0)::bigint)) AS saldo_disponivel
   FROM (pastoral.vw_saldo_insumos s
     LEFT JOIN pastoral.vw_reservas_insumos_ativas r USING (apresentacao_insumo_id));

--
-- Name: vw_preparacao_distribuicoes; Type: VIEW; Schema: pastoral; Owner: -
--

CREATE VIEW pastoral.vw_preparacao_distribuicoes AS
 SELECT d.id AS distribuicao_id,
    d.data_prevista,
    d.status,
    count(db.id) FILTER (WHERE ((db.status)::text = ANY ((ARRAY['DISPONIVEL'::character varying, 'RETIRADO'::character varying])::text[]))) AS direitos_previstos,
    COALESCE(l.quantidade_liberada, (0)::bigint) AS cestas_liberadas,
    COALESCE(l.quantidade_consumida, (0)::bigint) AS cestas_entregues,
    COALESCE(l.quantidade_disponivel, (0)::bigint) AS cestas_disponiveis
   FROM ((pastoral.distribuicoes d
     LEFT JOIN pastoral.direitos_beneficio db ON ((db.distribuicao_prevista_id = d.id)))
     LEFT JOIN pastoral.vw_cestas_liberadas_distribuicao l ON ((l.distribuicao_id = d.id)))
  GROUP BY d.id, d.data_prevista, d.status, l.quantidade_liberada, l.quantidade_consumida, l.quantidade_disponivel;

--
-- Name: arquivos arquivos_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.arquivos
    ADD CONSTRAINT arquivos_pkey PRIMARY KEY (id);

--
-- Name: arquivos arquivos_storage_key_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.arquivos
    ADD CONSTRAINT arquivos_storage_key_key UNIQUE (storage_key);

--
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);

--
-- Name: ausencias ausencias_direito_beneficio_id_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.ausencias
    ADD CONSTRAINT ausencias_direito_beneficio_id_key UNIQUE (direito_beneficio_id);

--
-- Name: ausencias ausencias_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.ausencias
    ADD CONSTRAINT ausencias_pkey PRIMARY KEY (id);

--
-- Name: beneficiarios_desligamentos beneficiarios_desligamentos_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios_desligamentos
    ADD CONSTRAINT beneficiarios_desligamentos_pkey PRIMARY KEY (id);

--
-- Name: beneficiarios_grupos_historico beneficiarios_grupos_historico_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios_grupos_historico
    ADD CONSTRAINT beneficiarios_grupos_historico_pkey PRIMARY KEY (id);

--
-- Name: beneficiarios beneficiarios_pessoa_id_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios
    ADD CONSTRAINT beneficiarios_pessoa_id_key UNIQUE (pessoa_id);

--
-- Name: beneficiarios beneficiarios_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios
    ADD CONSTRAINT beneficiarios_pkey PRIMARY KEY (id);

--
-- Name: candidaturas candidaturas_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.candidaturas
    ADD CONSTRAINT candidaturas_pkey PRIMARY KEY (id);

--
-- Name: candidaturas_tentativas_contato candidaturas_tentativas_contato_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.candidaturas_tentativas_contato
    ADD CONSTRAINT candidaturas_tentativas_contato_pkey PRIMARY KEY (id);

--
-- Name: categorias_prioridade_insumo categorias_prioridade_insumo_codigo_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.categorias_prioridade_insumo
    ADD CONSTRAINT categorias_prioridade_insumo_codigo_key UNIQUE (codigo);

--
-- Name: categorias_prioridade_insumo categorias_prioridade_insumo_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.categorias_prioridade_insumo
    ADD CONSTRAINT categorias_prioridade_insumo_pkey PRIMARY KEY (id);

--
-- Name: cestas_adicionais cestas_adicionais_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.cestas_adicionais
    ADD CONSTRAINT cestas_adicionais_pkey PRIMARY KEY (id);

--
-- Name: competencias competencias_ano_mes_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.competencias
    ADD CONSTRAINT competencias_ano_mes_key UNIQUE (ano, mes);

--
-- Name: competencias competencias_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.competencias
    ADD CONSTRAINT competencias_pkey PRIMARY KEY (id);

--
-- Name: configuracoes_capacidade configuracoes_capacidade_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.configuracoes_capacidade
    ADD CONSTRAINT configuracoes_capacidade_pkey PRIMARY KEY (id);

--
-- Name: direitos_beneficio direitos_beneficio_beneficiario_id_competencia_id_tipo_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.direitos_beneficio
    ADD CONSTRAINT direitos_beneficio_beneficiario_id_competencia_id_tipo_key UNIQUE (beneficiario_id, competencia_id, tipo);

--
-- Name: direitos_beneficio direitos_beneficio_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.direitos_beneficio
    ADD CONSTRAINT direitos_beneficio_pkey PRIMARY KEY (id);

--
-- Name: distribuicoes_checkins distribuicoes_checkins_distribuicao_id_beneficiario_id_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes_checkins
    ADD CONSTRAINT distribuicoes_checkins_distribuicao_id_beneficiario_id_key UNIQUE (distribuicao_id, beneficiario_id);

--
-- Name: distribuicoes_checkins distribuicoes_checkins_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes_checkins
    ADD CONSTRAINT distribuicoes_checkins_pkey PRIMARY KEY (id);

--
-- Name: distribuicoes distribuicoes_competencia_id_grupo_distribuicao_id_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes
    ADD CONSTRAINT distribuicoes_competencia_id_grupo_distribuicao_id_key UNIQUE (competencia_id, grupo_distribuicao_id);

--
-- Name: distribuicoes_historico distribuicoes_historico_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes_historico
    ADD CONSTRAINT distribuicoes_historico_pkey PRIMARY KEY (id);

--
-- Name: distribuicoes_liberacoes_cestas distribuicoes_liberacoes_cestas_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes_liberacoes_cestas
    ADD CONSTRAINT distribuicoes_liberacoes_cestas_pkey PRIMARY KEY (id);

--
-- Name: distribuicoes distribuicoes_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes
    ADD CONSTRAINT distribuicoes_pkey PRIMARY KEY (id);

--
-- Name: doadores doadores_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.doadores
    ADD CONSTRAINT doadores_pkey PRIMARY KEY (id);

--
-- Name: entradas_estoque_itens entradas_estoque_itens_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entradas_estoque_itens
    ADD CONSTRAINT entradas_estoque_itens_pkey PRIMARY KEY (id);

--
-- Name: entradas_estoque entradas_estoque_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entradas_estoque
    ADD CONSTRAINT entradas_estoque_pkey PRIMARY KEY (id);

--
-- Name: entregas_cestas entregas_cestas_cesta_adicional_id_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entregas_cestas
    ADD CONSTRAINT entregas_cestas_cesta_adicional_id_key UNIQUE (cesta_adicional_id);

--
-- Name: entregas_cestas_lotes entregas_cestas_lotes_entrega_cesta_id_liberacao_cesta_id_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entregas_cestas_lotes
    ADD CONSTRAINT entregas_cestas_lotes_entrega_cesta_id_liberacao_cesta_id_key UNIQUE (entrega_cesta_id, liberacao_cesta_id);

--
-- Name: entregas_cestas_lotes entregas_cestas_lotes_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entregas_cestas_lotes
    ADD CONSTRAINT entregas_cestas_lotes_pkey PRIMARY KEY (id);

--
-- Name: entregas_cestas entregas_cestas_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entregas_cestas
    ADD CONSTRAINT entregas_cestas_pkey PRIMARY KEY (id);

--
-- Name: entregas_cestas entregas_cestas_retirada_id_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entregas_cestas
    ADD CONSTRAINT entregas_cestas_retirada_id_key UNIQUE (retirada_id);

--
-- Name: grupos_distribuicao grupos_distribuicao_codigo_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.grupos_distribuicao
    ADD CONSTRAINT grupos_distribuicao_codigo_key UNIQUE (codigo);

--
-- Name: grupos_distribuicao grupos_distribuicao_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.grupos_distribuicao
    ADD CONSTRAINT grupos_distribuicao_pkey PRIMARY KEY (id);

--
-- Name: insumos_apresentacoes insumos_apresentacoes_insumo_id_descricao_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.insumos_apresentacoes
    ADD CONSTRAINT insumos_apresentacoes_insumo_id_descricao_key UNIQUE (insumo_id, descricao);

--
-- Name: insumos_apresentacoes insumos_apresentacoes_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.insumos_apresentacoes
    ADD CONSTRAINT insumos_apresentacoes_pkey PRIMARY KEY (id);

--
-- Name: insumos insumos_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.insumos
    ADD CONSTRAINT insumos_pkey PRIMARY KEY (id);

--
-- Name: inventarios_itens inventarios_itens_inventario_id_apresentacao_insumo_id_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.inventarios_itens
    ADD CONSTRAINT inventarios_itens_inventario_id_apresentacao_insumo_id_key UNIQUE (inventario_id, apresentacao_insumo_id);

--
-- Name: inventarios_itens inventarios_itens_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.inventarios_itens
    ADD CONSTRAINT inventarios_itens_pkey PRIMARY KEY (id);

--
-- Name: inventarios inventarios_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.inventarios
    ADD CONSTRAINT inventarios_pkey PRIMARY KEY (id);

--
-- Name: justificativas_ausencia justificativas_ausencia_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.justificativas_ausencia
    ADD CONSTRAINT justificativas_ausencia_pkey PRIMARY KEY (id);

--
-- Name: lotes_montagem_ajustes_itens lotes_montagem_ajustes_itens_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem_ajustes_itens
    ADD CONSTRAINT lotes_montagem_ajustes_itens_pkey PRIMARY KEY (id);

--
-- Name: lotes_montagem_ajustes lotes_montagem_ajustes_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem_ajustes
    ADD CONSTRAINT lotes_montagem_ajustes_pkey PRIMARY KEY (id);

--
-- Name: lotes_montagem_itens lotes_montagem_itens_lote_montagem_id_apresentacao_insumo_i_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem_itens
    ADD CONSTRAINT lotes_montagem_itens_lote_montagem_id_apresentacao_insumo_i_key UNIQUE (lote_montagem_id, apresentacao_insumo_id);

--
-- Name: lotes_montagem_itens lotes_montagem_itens_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem_itens
    ADD CONSTRAINT lotes_montagem_itens_pkey PRIMARY KEY (id);

--
-- Name: lotes_montagem lotes_montagem_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem
    ADD CONSTRAINT lotes_montagem_pkey PRIMARY KEY (id);

--
-- Name: modelos_cesta modelos_cesta_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.modelos_cesta
    ADD CONSTRAINT modelos_cesta_pkey PRIMARY KEY (id);

--
-- Name: modelos_cesta_versoes_itens modelos_cesta_versoes_itens_modelo_cesta_versao_id_apresent_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.modelos_cesta_versoes_itens
    ADD CONSTRAINT modelos_cesta_versoes_itens_modelo_cesta_versao_id_apresent_key UNIQUE (modelo_cesta_versao_id, apresentacao_insumo_id);

--
-- Name: modelos_cesta_versoes_itens modelos_cesta_versoes_itens_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.modelos_cesta_versoes_itens
    ADD CONSTRAINT modelos_cesta_versoes_itens_pkey PRIMARY KEY (id);

--
-- Name: modelos_cesta_versoes modelos_cesta_versoes_modelo_cesta_id_numero_versao_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.modelos_cesta_versoes
    ADD CONSTRAINT modelos_cesta_versoes_modelo_cesta_id_numero_versao_key UNIQUE (modelo_cesta_id, numero_versao);

--
-- Name: modelos_cesta_versoes modelos_cesta_versoes_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.modelos_cesta_versoes
    ADD CONSTRAINT modelos_cesta_versoes_pkey PRIMARY KEY (id);

--
-- Name: motivos_desligamento motivos_desligamento_codigo_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.motivos_desligamento
    ADD CONSTRAINT motivos_desligamento_codigo_key UNIQUE (codigo);

--
-- Name: motivos_desligamento motivos_desligamento_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.motivos_desligamento
    ADD CONSTRAINT motivos_desligamento_pkey PRIMARY KEY (id);

--
-- Name: motivos_perda_estoque motivos_perda_estoque_codigo_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.motivos_perda_estoque
    ADD CONSTRAINT motivos_perda_estoque_codigo_key UNIQUE (codigo);

--
-- Name: motivos_perda_estoque motivos_perda_estoque_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.motivos_perda_estoque
    ADD CONSTRAINT motivos_perda_estoque_pkey PRIMARY KEY (id);

--
-- Name: movimentacoes_cestas movimentacoes_cestas_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.movimentacoes_cestas
    ADD CONSTRAINT movimentacoes_cestas_pkey PRIMARY KEY (id);

--
-- Name: movimentacoes_insumos movimentacoes_insumos_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.movimentacoes_insumos
    ADD CONSTRAINT movimentacoes_insumos_pkey PRIMARY KEY (id);

--
-- Name: perdas_estoque perdas_estoque_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.perdas_estoque
    ADD CONSTRAINT perdas_estoque_pkey PRIMARY KEY (id);

--
-- Name: perfis perfis_codigo_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.perfis
    ADD CONSTRAINT perfis_codigo_key UNIQUE (codigo);

--
-- Name: perfis_permissoes perfis_permissoes_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.perfis_permissoes
    ADD CONSTRAINT perfis_permissoes_pkey PRIMARY KEY (perfil_id, permissao_id);

--
-- Name: perfis perfis_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.perfis
    ADD CONSTRAINT perfis_pkey PRIMARY KEY (id);

--
-- Name: permissoes permissoes_codigo_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.permissoes
    ADD CONSTRAINT permissoes_codigo_key UNIQUE (codigo);

--
-- Name: permissoes permissoes_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.permissoes
    ADD CONSTRAINT permissoes_pkey PRIMARY KEY (id);

--
-- Name: pessoas_arquivos pessoas_arquivos_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.pessoas_arquivos
    ADD CONSTRAINT pessoas_arquivos_pkey PRIMARY KEY (id);

--
-- Name: pessoas_documentos pessoas_documentos_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.pessoas_documentos
    ADD CONSTRAINT pessoas_documentos_pkey PRIMARY KEY (id);

--
-- Name: pessoas_documentos pessoas_documentos_tipo_documento_id_numero_normalizado_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.pessoas_documentos
    ADD CONSTRAINT pessoas_documentos_tipo_documento_id_numero_normalizado_key UNIQUE (tipo_documento_id, numero_normalizado);

--
-- Name: pessoas_enderecos pessoas_enderecos_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.pessoas_enderecos
    ADD CONSTRAINT pessoas_enderecos_pkey PRIMARY KEY (id);

--
-- Name: pessoas pessoas_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.pessoas
    ADD CONSTRAINT pessoas_pkey PRIMARY KEY (id);

--
-- Name: planejamentos_cesta planejamentos_cesta_competencia_id_modelo_cesta_id_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.planejamentos_cesta
    ADD CONSTRAINT planejamentos_cesta_competencia_id_modelo_cesta_id_key UNIQUE (competencia_id, modelo_cesta_id);

--
-- Name: planejamentos_cesta planejamentos_cesta_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.planejamentos_cesta
    ADD CONSTRAINT planejamentos_cesta_pkey PRIMARY KEY (id);

--
-- Name: planejamentos_cesta_versoes_itens planejamentos_cesta_versoes_i_planejamento_versao_id_aprese_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.planejamentos_cesta_versoes_itens
    ADD CONSTRAINT planejamentos_cesta_versoes_i_planejamento_versao_id_aprese_key UNIQUE (planejamento_versao_id, apresentacao_insumo_id);

--
-- Name: planejamentos_cesta_versoes_itens planejamentos_cesta_versoes_itens_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.planejamentos_cesta_versoes_itens
    ADD CONSTRAINT planejamentos_cesta_versoes_itens_pkey PRIMARY KEY (id);

--
-- Name: planejamentos_cesta_versoes planejamentos_cesta_versoes_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.planejamentos_cesta_versoes
    ADD CONSTRAINT planejamentos_cesta_versoes_pkey PRIMARY KEY (id);

--
-- Name: planejamentos_cesta_versoes planejamentos_cesta_versoes_planejamento_cesta_id_numero_ve_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.planejamentos_cesta_versoes
    ADD CONSTRAINT planejamentos_cesta_versoes_planejamento_cesta_id_numero_ve_key UNIQUE (planejamento_cesta_id, numero_versao);

--
-- Name: reservas_insumos reservas_insumos_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.reservas_insumos
    ADD CONSTRAINT reservas_insumos_pkey PRIMARY KEY (id);

--
-- Name: reservas_insumos reservas_insumos_planejamento_versao_id_apresentacao_insumo_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.reservas_insumos
    ADD CONSTRAINT reservas_insumos_planejamento_versao_id_apresentacao_insumo_key UNIQUE (planejamento_versao_id, apresentacao_insumo_id);

--
-- Name: retiradas_estornos retiradas_estornos_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.retiradas_estornos
    ADD CONSTRAINT retiradas_estornos_pkey PRIMARY KEY (id);

--
-- Name: retiradas retiradas_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.retiradas
    ADD CONSTRAINT retiradas_pkey PRIMARY KEY (id);

--
-- Name: retiradas_representantes retiradas_representantes_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.retiradas_representantes
    ADD CONSTRAINT retiradas_representantes_pkey PRIMARY KEY (id);

--
-- Name: retiradas_representantes retiradas_representantes_retirada_id_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.retiradas_representantes
    ADD CONSTRAINT retiradas_representantes_retirada_id_key UNIQUE (retirada_id);

--
-- Name: tipos_documento tipos_documento_codigo_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.tipos_documento
    ADD CONSTRAINT tipos_documento_codigo_key UNIQUE (codigo);

--
-- Name: tipos_documento tipos_documento_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.tipos_documento
    ADD CONSTRAINT tipos_documento_pkey PRIMARY KEY (id);

--
-- Name: usuarios usuarios_login_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.usuarios
    ADD CONSTRAINT usuarios_login_key UNIQUE (login);

--
-- Name: usuarios_perfis usuarios_perfis_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.usuarios_perfis
    ADD CONSTRAINT usuarios_perfis_pkey PRIMARY KEY (usuario_id, perfil_id);

--
-- Name: usuarios usuarios_pessoa_id_key; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.usuarios
    ADD CONSTRAINT usuarios_pessoa_id_key UNIQUE (pessoa_id);

--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);

--
-- Name: idx_auditoria_data; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_auditoria_data ON pastoral.auditoria USING btree (ocorrido_em);

--
-- Name: idx_auditoria_entidade; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_auditoria_entidade ON pastoral.auditoria USING btree (entidade, entidade_id);

--
-- Name: idx_beneficiarios_ativos_grupo; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_beneficiarios_ativos_grupo ON pastoral.beneficiarios USING btree (grupo_distribuicao_id, id) WHERE ((status)::text = 'ATIVO'::text);

--
-- Name: idx_candidaturas_fila; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_candidaturas_fila ON pastoral.candidaturas USING btree (prioridade_excepcional DESC, data_entrada, id) WHERE ((status)::text = 'AGUARDANDO'::text);

--
-- Name: idx_capacidade_vigencia; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_capacidade_vigencia ON pastoral.configuracoes_capacidade USING btree (vigencia_inicio DESC);

--
-- Name: idx_checkins_fila; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_checkins_fila ON pastoral.distribuicoes_checkins USING btree (distribuicao_id, ocorrido_em, id);

--
-- Name: idx_direitos_disponiveis; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_direitos_disponiveis ON pastoral.direitos_beneficio USING btree (distribuicao_prevista_id, beneficiario_id) WHERE ((status)::text = 'DISPONIVEL'::text);

--
-- Name: idx_distribuicoes_data; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_distribuicoes_data ON pastoral.distribuicoes USING btree (data_prevista);

--
-- Name: idx_liberacoes_distribuicao; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_liberacoes_distribuicao ON pastoral.distribuicoes_liberacoes_cestas USING btree (distribuicao_id, liberado_em, id);

--
-- Name: idx_lotes_disponiveis; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_lotes_disponiveis ON pastoral.lotes_montagem USING btree (montado_em, id) WHERE ((quantidade_disponivel > 0) AND ((status)::text = 'ATIVO'::text));

--
-- Name: idx_mov_cestas_lote; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_mov_cestas_lote ON pastoral.movimentacoes_cestas USING btree (lote_montagem_id, ocorrido_em, id);

--
-- Name: idx_mov_insumo; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_mov_insumo ON pastoral.movimentacoes_insumos USING btree (apresentacao_insumo_id, ocorrido_em, id);

--
-- Name: idx_pessoas_arquivos_pessoa; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_pessoas_arquivos_pessoa ON pastoral.pessoas_arquivos USING btree (pessoa_id);

--
-- Name: idx_pessoas_documentos_numero; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_pessoas_documentos_numero ON pastoral.pessoas_documentos USING btree (numero_normalizado);

--
-- Name: idx_pessoas_documentos_pessoa; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_pessoas_documentos_pessoa ON pastoral.pessoas_documentos USING btree (pessoa_id);

--
-- Name: idx_pessoas_enderecos_pessoa; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_pessoas_enderecos_pessoa ON pastoral.pessoas_enderecos USING btree (pessoa_id);

--
-- Name: idx_pessoas_nome_trgm; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_pessoas_nome_trgm ON pastoral.pessoas USING gin (nome_normalizado pastoral.gin_trgm_ops);

--
-- Name: idx_retiradas_distribuicao; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE INDEX idx_retiradas_distribuicao ON pastoral.retiradas USING btree (distribuicao_id, ocorrido_em, id);

--
-- Name: uq_candidatura_aberta_pessoa; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE UNIQUE INDEX uq_candidatura_aberta_pessoa ON pastoral.candidaturas USING btree (pessoa_id) WHERE ((status)::text = ANY ((ARRAY['AGUARDANDO'::character varying, 'CONVOCADO'::character varying])::text[]));

--
-- Name: uq_insumo_nome_ativo; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE UNIQUE INDEX uq_insumo_nome_ativo ON pastoral.insumos USING btree (lower((nome)::text)) WHERE ativo;

--
-- Name: uq_pessoa_foto_principal; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE UNIQUE INDEX uq_pessoa_foto_principal ON pastoral.pessoas_arquivos USING btree (pessoa_id) WHERE (principal AND ((tipo)::text = 'FOTO_PERFIL'::text));

--
-- Name: uq_planejamento_versao_aprovada; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE UNIQUE INDEX uq_planejamento_versao_aprovada ON pastoral.planejamentos_cesta_versoes USING btree (planejamento_cesta_id) WHERE ((status)::text = 'APROVADA'::text);

--
-- Name: uq_retirada_valida_direito; Type: INDEX; Schema: pastoral; Owner: -
--

CREATE UNIQUE INDEX uq_retirada_valida_direito ON pastoral.retiradas USING btree (direito_beneficio_id) WHERE ((status)::text = 'VALIDA'::text);

--
-- Name: pessoas_documentos tg_documentos_normalizacao; Type: TRIGGER; Schema: pastoral; Owner: -
--

CREATE TRIGGER tg_documentos_normalizacao BEFORE INSERT OR UPDATE OF numero ON pastoral.pessoas_documentos FOR EACH ROW EXECUTE FUNCTION pastoral.trg_documentos_normalizacao();

--
-- Name: pessoas tg_pessoas_normalizacao; Type: TRIGGER; Schema: pastoral; Owner: -
--

CREATE TRIGGER tg_pessoas_normalizacao BEFORE INSERT OR UPDATE OF nome_completo ON pastoral.pessoas FOR EACH ROW EXECUTE FUNCTION pastoral.trg_pessoas_normalizacao();

--
-- Name: auditoria auditoria_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.auditoria
    ADD CONSTRAINT auditoria_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: ausencias ausencias_direito_beneficio_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.ausencias
    ADD CONSTRAINT ausencias_direito_beneficio_id_fkey FOREIGN KEY (direito_beneficio_id) REFERENCES pastoral.direitos_beneficio(id);

--
-- Name: beneficiarios_desligamentos beneficiarios_desligamentos_beneficiario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios_desligamentos
    ADD CONSTRAINT beneficiarios_desligamentos_beneficiario_id_fkey FOREIGN KEY (beneficiario_id) REFERENCES pastoral.beneficiarios(id);

--
-- Name: beneficiarios_desligamentos beneficiarios_desligamentos_motivo_desligamento_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios_desligamentos
    ADD CONSTRAINT beneficiarios_desligamentos_motivo_desligamento_id_fkey FOREIGN KEY (motivo_desligamento_id) REFERENCES pastoral.motivos_desligamento(id);

--
-- Name: beneficiarios_desligamentos beneficiarios_desligamentos_usuario_responsavel_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios_desligamentos
    ADD CONSTRAINT beneficiarios_desligamentos_usuario_responsavel_id_fkey FOREIGN KEY (usuario_responsavel_id) REFERENCES pastoral.usuarios(id);

--
-- Name: beneficiarios beneficiarios_grupo_distribuicao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios
    ADD CONSTRAINT beneficiarios_grupo_distribuicao_id_fkey FOREIGN KEY (grupo_distribuicao_id) REFERENCES pastoral.grupos_distribuicao(id);

--
-- Name: beneficiarios_grupos_historico beneficiarios_grupos_historico_beneficiario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios_grupos_historico
    ADD CONSTRAINT beneficiarios_grupos_historico_beneficiario_id_fkey FOREIGN KEY (beneficiario_id) REFERENCES pastoral.beneficiarios(id);

--
-- Name: beneficiarios_grupos_historico beneficiarios_grupos_historico_grupo_destino_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios_grupos_historico
    ADD CONSTRAINT beneficiarios_grupos_historico_grupo_destino_id_fkey FOREIGN KEY (grupo_destino_id) REFERENCES pastoral.grupos_distribuicao(id);

--
-- Name: beneficiarios_grupos_historico beneficiarios_grupos_historico_grupo_origem_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios_grupos_historico
    ADD CONSTRAINT beneficiarios_grupos_historico_grupo_origem_id_fkey FOREIGN KEY (grupo_origem_id) REFERENCES pastoral.grupos_distribuicao(id);

--
-- Name: beneficiarios_grupos_historico beneficiarios_grupos_historico_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios_grupos_historico
    ADD CONSTRAINT beneficiarios_grupos_historico_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: beneficiarios beneficiarios_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.beneficiarios
    ADD CONSTRAINT beneficiarios_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES pastoral.pessoas(id);

--
-- Name: candidaturas candidaturas_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.candidaturas
    ADD CONSTRAINT candidaturas_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES pastoral.pessoas(id);

--
-- Name: candidaturas_tentativas_contato candidaturas_tentativas_contato_candidatura_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.candidaturas_tentativas_contato
    ADD CONSTRAINT candidaturas_tentativas_contato_candidatura_id_fkey FOREIGN KEY (candidatura_id) REFERENCES pastoral.candidaturas(id);

--
-- Name: candidaturas_tentativas_contato candidaturas_tentativas_contato_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.candidaturas_tentativas_contato
    ADD CONSTRAINT candidaturas_tentativas_contato_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: candidaturas candidaturas_usuario_priorizacao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.candidaturas
    ADD CONSTRAINT candidaturas_usuario_priorizacao_id_fkey FOREIGN KEY (usuario_priorizacao_id) REFERENCES pastoral.usuarios(id);

--
-- Name: cestas_adicionais cestas_adicionais_beneficiario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.cestas_adicionais
    ADD CONSTRAINT cestas_adicionais_beneficiario_id_fkey FOREIGN KEY (beneficiario_id) REFERENCES pastoral.beneficiarios(id);

--
-- Name: cestas_adicionais cestas_adicionais_distribuicao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.cestas_adicionais
    ADD CONSTRAINT cestas_adicionais_distribuicao_id_fkey FOREIGN KEY (distribuicao_id) REFERENCES pastoral.distribuicoes(id);

--
-- Name: cestas_adicionais cestas_adicionais_modelo_cesta_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.cestas_adicionais
    ADD CONSTRAINT cestas_adicionais_modelo_cesta_id_fkey FOREIGN KEY (modelo_cesta_id) REFERENCES pastoral.modelos_cesta(id);

--
-- Name: cestas_adicionais cestas_adicionais_usuario_autorizador_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.cestas_adicionais
    ADD CONSTRAINT cestas_adicionais_usuario_autorizador_id_fkey FOREIGN KEY (usuario_autorizador_id) REFERENCES pastoral.usuarios(id);

--
-- Name: cestas_adicionais cestas_adicionais_usuario_entrega_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.cestas_adicionais
    ADD CONSTRAINT cestas_adicionais_usuario_entrega_id_fkey FOREIGN KEY (usuario_entrega_id) REFERENCES pastoral.usuarios(id);

--
-- Name: configuracoes_capacidade configuracoes_capacidade_usuario_responsavel_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.configuracoes_capacidade
    ADD CONSTRAINT configuracoes_capacidade_usuario_responsavel_id_fkey FOREIGN KEY (usuario_responsavel_id) REFERENCES pastoral.usuarios(id);

--
-- Name: direitos_beneficio direitos_beneficio_beneficiario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.direitos_beneficio
    ADD CONSTRAINT direitos_beneficio_beneficiario_id_fkey FOREIGN KEY (beneficiario_id) REFERENCES pastoral.beneficiarios(id);

--
-- Name: direitos_beneficio direitos_beneficio_competencia_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.direitos_beneficio
    ADD CONSTRAINT direitos_beneficio_competencia_id_fkey FOREIGN KEY (competencia_id) REFERENCES pastoral.competencias(id);

--
-- Name: direitos_beneficio direitos_beneficio_distribuicao_prevista_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.direitos_beneficio
    ADD CONSTRAINT direitos_beneficio_distribuicao_prevista_id_fkey FOREIGN KEY (distribuicao_prevista_id) REFERENCES pastoral.distribuicoes(id);

--
-- Name: distribuicoes_checkins distribuicoes_checkins_beneficiario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes_checkins
    ADD CONSTRAINT distribuicoes_checkins_beneficiario_id_fkey FOREIGN KEY (beneficiario_id) REFERENCES pastoral.beneficiarios(id);

--
-- Name: distribuicoes_checkins distribuicoes_checkins_distribuicao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes_checkins
    ADD CONSTRAINT distribuicoes_checkins_distribuicao_id_fkey FOREIGN KEY (distribuicao_id) REFERENCES pastoral.distribuicoes(id);

--
-- Name: distribuicoes_checkins distribuicoes_checkins_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes_checkins
    ADD CONSTRAINT distribuicoes_checkins_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: distribuicoes distribuicoes_competencia_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes
    ADD CONSTRAINT distribuicoes_competencia_id_fkey FOREIGN KEY (competencia_id) REFERENCES pastoral.competencias(id);

--
-- Name: distribuicoes distribuicoes_grupo_distribuicao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes
    ADD CONSTRAINT distribuicoes_grupo_distribuicao_id_fkey FOREIGN KEY (grupo_distribuicao_id) REFERENCES pastoral.grupos_distribuicao(id);

--
-- Name: distribuicoes_historico distribuicoes_historico_distribuicao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes_historico
    ADD CONSTRAINT distribuicoes_historico_distribuicao_id_fkey FOREIGN KEY (distribuicao_id) REFERENCES pastoral.distribuicoes(id);

--
-- Name: distribuicoes_historico distribuicoes_historico_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes_historico
    ADD CONSTRAINT distribuicoes_historico_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: distribuicoes_liberacoes_cestas distribuicoes_liberacoes_cestas_distribuicao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes_liberacoes_cestas
    ADD CONSTRAINT distribuicoes_liberacoes_cestas_distribuicao_id_fkey FOREIGN KEY (distribuicao_id) REFERENCES pastoral.distribuicoes(id);

--
-- Name: distribuicoes_liberacoes_cestas distribuicoes_liberacoes_cestas_lote_montagem_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes_liberacoes_cestas
    ADD CONSTRAINT distribuicoes_liberacoes_cestas_lote_montagem_id_fkey FOREIGN KEY (lote_montagem_id) REFERENCES pastoral.lotes_montagem(id);

--
-- Name: distribuicoes_liberacoes_cestas distribuicoes_liberacoes_cestas_usuario_estoque_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes_liberacoes_cestas
    ADD CONSTRAINT distribuicoes_liberacoes_cestas_usuario_estoque_id_fkey FOREIGN KEY (usuario_estoque_id) REFERENCES pastoral.usuarios(id);

--
-- Name: distribuicoes distribuicoes_usuario_abertura_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes
    ADD CONSTRAINT distribuicoes_usuario_abertura_id_fkey FOREIGN KEY (usuario_abertura_id) REFERENCES pastoral.usuarios(id);

--
-- Name: distribuicoes distribuicoes_usuario_encerramento_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.distribuicoes
    ADD CONSTRAINT distribuicoes_usuario_encerramento_id_fkey FOREIGN KEY (usuario_encerramento_id) REFERENCES pastoral.usuarios(id);

--
-- Name: entradas_estoque entradas_estoque_doador_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entradas_estoque
    ADD CONSTRAINT entradas_estoque_doador_id_fkey FOREIGN KEY (doador_id) REFERENCES pastoral.doadores(id);

--
-- Name: entradas_estoque_itens entradas_estoque_itens_apresentacao_insumo_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entradas_estoque_itens
    ADD CONSTRAINT entradas_estoque_itens_apresentacao_insumo_id_fkey FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id);

--
-- Name: entradas_estoque_itens entradas_estoque_itens_entrada_estoque_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entradas_estoque_itens
    ADD CONSTRAINT entradas_estoque_itens_entrada_estoque_id_fkey FOREIGN KEY (entrada_estoque_id) REFERENCES pastoral.entradas_estoque(id);

--
-- Name: entradas_estoque entradas_estoque_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entradas_estoque
    ADD CONSTRAINT entradas_estoque_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: entregas_cestas entregas_cestas_cesta_adicional_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entregas_cestas
    ADD CONSTRAINT entregas_cestas_cesta_adicional_id_fkey FOREIGN KEY (cesta_adicional_id) REFERENCES pastoral.cestas_adicionais(id);

--
-- Name: entregas_cestas entregas_cestas_distribuicao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entregas_cestas
    ADD CONSTRAINT entregas_cestas_distribuicao_id_fkey FOREIGN KEY (distribuicao_id) REFERENCES pastoral.distribuicoes(id);

--
-- Name: entregas_cestas_lotes entregas_cestas_lotes_entrega_cesta_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entregas_cestas_lotes
    ADD CONSTRAINT entregas_cestas_lotes_entrega_cesta_id_fkey FOREIGN KEY (entrega_cesta_id) REFERENCES pastoral.entregas_cestas(id);

--
-- Name: entregas_cestas_lotes entregas_cestas_lotes_liberacao_cesta_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entregas_cestas_lotes
    ADD CONSTRAINT entregas_cestas_lotes_liberacao_cesta_id_fkey FOREIGN KEY (liberacao_cesta_id) REFERENCES pastoral.distribuicoes_liberacoes_cestas(id);

--
-- Name: entregas_cestas_lotes entregas_cestas_lotes_lote_montagem_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entregas_cestas_lotes
    ADD CONSTRAINT entregas_cestas_lotes_lote_montagem_id_fkey FOREIGN KEY (lote_montagem_id) REFERENCES pastoral.lotes_montagem(id);

--
-- Name: entregas_cestas entregas_cestas_retirada_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entregas_cestas
    ADD CONSTRAINT entregas_cestas_retirada_id_fkey FOREIGN KEY (retirada_id) REFERENCES pastoral.retiradas(id);

--
-- Name: entregas_cestas entregas_cestas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.entregas_cestas
    ADD CONSTRAINT entregas_cestas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: insumos_apresentacoes insumos_apresentacoes_insumo_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.insumos_apresentacoes
    ADD CONSTRAINT insumos_apresentacoes_insumo_id_fkey FOREIGN KEY (insumo_id) REFERENCES pastoral.insumos(id);

--
-- Name: insumos insumos_categoria_prioridade_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.insumos
    ADD CONSTRAINT insumos_categoria_prioridade_id_fkey FOREIGN KEY (categoria_prioridade_id) REFERENCES pastoral.categorias_prioridade_insumo(id);

--
-- Name: inventarios_itens inventarios_itens_apresentacao_insumo_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.inventarios_itens
    ADD CONSTRAINT inventarios_itens_apresentacao_insumo_id_fkey FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id);

--
-- Name: inventarios_itens inventarios_itens_inventario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.inventarios_itens
    ADD CONSTRAINT inventarios_itens_inventario_id_fkey FOREIGN KEY (inventario_id) REFERENCES pastoral.inventarios(id);

--
-- Name: inventarios inventarios_usuario_responsavel_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.inventarios
    ADD CONSTRAINT inventarios_usuario_responsavel_id_fkey FOREIGN KEY (usuario_responsavel_id) REFERENCES pastoral.usuarios(id);

--
-- Name: justificativas_ausencia justificativas_ausencia_ausencia_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.justificativas_ausencia
    ADD CONSTRAINT justificativas_ausencia_ausencia_id_fkey FOREIGN KEY (ausencia_id) REFERENCES pastoral.ausencias(id);

--
-- Name: justificativas_ausencia justificativas_ausencia_usuario_decisao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.justificativas_ausencia
    ADD CONSTRAINT justificativas_ausencia_usuario_decisao_id_fkey FOREIGN KEY (usuario_decisao_id) REFERENCES pastoral.usuarios(id);

--
-- Name: justificativas_ausencia justificativas_ausencia_usuario_registro_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.justificativas_ausencia
    ADD CONSTRAINT justificativas_ausencia_usuario_registro_id_fkey FOREIGN KEY (usuario_registro_id) REFERENCES pastoral.usuarios(id);

--
-- Name: lotes_montagem_ajustes_itens lotes_montagem_ajustes_itens_ajuste_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem_ajustes_itens
    ADD CONSTRAINT lotes_montagem_ajustes_itens_ajuste_id_fkey FOREIGN KEY (ajuste_id) REFERENCES pastoral.lotes_montagem_ajustes(id);

--
-- Name: lotes_montagem_ajustes_itens lotes_montagem_ajustes_itens_apresentacao_insumo_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem_ajustes_itens
    ADD CONSTRAINT lotes_montagem_ajustes_itens_apresentacao_insumo_id_fkey FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id);

--
-- Name: lotes_montagem_ajustes lotes_montagem_ajustes_lote_montagem_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem_ajustes
    ADD CONSTRAINT lotes_montagem_ajustes_lote_montagem_id_fkey FOREIGN KEY (lote_montagem_id) REFERENCES pastoral.lotes_montagem(id);

--
-- Name: lotes_montagem_ajustes lotes_montagem_ajustes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem_ajustes
    ADD CONSTRAINT lotes_montagem_ajustes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: lotes_montagem_itens lotes_montagem_itens_apresentacao_insumo_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem_itens
    ADD CONSTRAINT lotes_montagem_itens_apresentacao_insumo_id_fkey FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id);

--
-- Name: lotes_montagem_itens lotes_montagem_itens_lote_montagem_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem_itens
    ADD CONSTRAINT lotes_montagem_itens_lote_montagem_id_fkey FOREIGN KEY (lote_montagem_id) REFERENCES pastoral.lotes_montagem(id);

--
-- Name: lotes_montagem lotes_montagem_planejamento_versao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem
    ADD CONSTRAINT lotes_montagem_planejamento_versao_id_fkey FOREIGN KEY (planejamento_versao_id) REFERENCES pastoral.planejamentos_cesta_versoes(id);

--
-- Name: lotes_montagem lotes_montagem_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.lotes_montagem
    ADD CONSTRAINT lotes_montagem_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: modelos_cesta_versoes_itens modelos_cesta_versoes_itens_apresentacao_insumo_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.modelos_cesta_versoes_itens
    ADD CONSTRAINT modelos_cesta_versoes_itens_apresentacao_insumo_id_fkey FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id);

--
-- Name: modelos_cesta_versoes_itens modelos_cesta_versoes_itens_modelo_cesta_versao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.modelos_cesta_versoes_itens
    ADD CONSTRAINT modelos_cesta_versoes_itens_modelo_cesta_versao_id_fkey FOREIGN KEY (modelo_cesta_versao_id) REFERENCES pastoral.modelos_cesta_versoes(id);

--
-- Name: modelos_cesta_versoes modelos_cesta_versoes_modelo_cesta_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.modelos_cesta_versoes
    ADD CONSTRAINT modelos_cesta_versoes_modelo_cesta_id_fkey FOREIGN KEY (modelo_cesta_id) REFERENCES pastoral.modelos_cesta(id);

--
-- Name: modelos_cesta_versoes modelos_cesta_versoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.modelos_cesta_versoes
    ADD CONSTRAINT modelos_cesta_versoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: movimentacoes_cestas movimentacoes_cestas_lote_montagem_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.movimentacoes_cestas
    ADD CONSTRAINT movimentacoes_cestas_lote_montagem_id_fkey FOREIGN KEY (lote_montagem_id) REFERENCES pastoral.lotes_montagem(id);

--
-- Name: movimentacoes_cestas movimentacoes_cestas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.movimentacoes_cestas
    ADD CONSTRAINT movimentacoes_cestas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: movimentacoes_insumos movimentacoes_insumos_apresentacao_insumo_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.movimentacoes_insumos
    ADD CONSTRAINT movimentacoes_insumos_apresentacao_insumo_id_fkey FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id);

--
-- Name: movimentacoes_insumos movimentacoes_insumos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.movimentacoes_insumos
    ADD CONSTRAINT movimentacoes_insumos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: perdas_estoque perdas_estoque_apresentacao_insumo_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.perdas_estoque
    ADD CONSTRAINT perdas_estoque_apresentacao_insumo_id_fkey FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id);

--
-- Name: perdas_estoque perdas_estoque_motivo_perda_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.perdas_estoque
    ADD CONSTRAINT perdas_estoque_motivo_perda_id_fkey FOREIGN KEY (motivo_perda_id) REFERENCES pastoral.motivos_perda_estoque(id);

--
-- Name: perdas_estoque perdas_estoque_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.perdas_estoque
    ADD CONSTRAINT perdas_estoque_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: perfis_permissoes perfis_permissoes_perfil_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.perfis_permissoes
    ADD CONSTRAINT perfis_permissoes_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES pastoral.perfis(id);

--
-- Name: perfis_permissoes perfis_permissoes_permissao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.perfis_permissoes
    ADD CONSTRAINT perfis_permissoes_permissao_id_fkey FOREIGN KEY (permissao_id) REFERENCES pastoral.permissoes(id);

--
-- Name: pessoas_arquivos pessoas_arquivos_arquivo_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.pessoas_arquivos
    ADD CONSTRAINT pessoas_arquivos_arquivo_id_fkey FOREIGN KEY (arquivo_id) REFERENCES pastoral.arquivos(id);

--
-- Name: pessoas_arquivos pessoas_arquivos_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.pessoas_arquivos
    ADD CONSTRAINT pessoas_arquivos_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES pastoral.pessoas(id);

--
-- Name: pessoas_arquivos pessoas_arquivos_usuario_cadastro_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.pessoas_arquivos
    ADD CONSTRAINT pessoas_arquivos_usuario_cadastro_id_fkey FOREIGN KEY (usuario_cadastro_id) REFERENCES pastoral.usuarios(id);

--
-- Name: pessoas_documentos pessoas_documentos_arquivo_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.pessoas_documentos
    ADD CONSTRAINT pessoas_documentos_arquivo_id_fkey FOREIGN KEY (arquivo_id) REFERENCES pastoral.arquivos(id);

--
-- Name: pessoas_documentos pessoas_documentos_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.pessoas_documentos
    ADD CONSTRAINT pessoas_documentos_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES pastoral.pessoas(id);

--
-- Name: pessoas_documentos pessoas_documentos_tipo_documento_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.pessoas_documentos
    ADD CONSTRAINT pessoas_documentos_tipo_documento_id_fkey FOREIGN KEY (tipo_documento_id) REFERENCES pastoral.tipos_documento(id);

--
-- Name: pessoas_enderecos pessoas_enderecos_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.pessoas_enderecos
    ADD CONSTRAINT pessoas_enderecos_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES pastoral.pessoas(id);

--
-- Name: planejamentos_cesta planejamentos_cesta_competencia_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.planejamentos_cesta
    ADD CONSTRAINT planejamentos_cesta_competencia_id_fkey FOREIGN KEY (competencia_id) REFERENCES pastoral.competencias(id);

--
-- Name: planejamentos_cesta planejamentos_cesta_modelo_cesta_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.planejamentos_cesta
    ADD CONSTRAINT planejamentos_cesta_modelo_cesta_id_fkey FOREIGN KEY (modelo_cesta_id) REFERENCES pastoral.modelos_cesta(id);

--
-- Name: planejamentos_cesta_versoes_itens planejamentos_cesta_versoes_itens_apresentacao_insumo_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.planejamentos_cesta_versoes_itens
    ADD CONSTRAINT planejamentos_cesta_versoes_itens_apresentacao_insumo_id_fkey FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id);

--
-- Name: planejamentos_cesta_versoes_itens planejamentos_cesta_versoes_itens_planejamento_versao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.planejamentos_cesta_versoes_itens
    ADD CONSTRAINT planejamentos_cesta_versoes_itens_planejamento_versao_id_fkey FOREIGN KEY (planejamento_versao_id) REFERENCES pastoral.planejamentos_cesta_versoes(id);

--
-- Name: planejamentos_cesta_versoes planejamentos_cesta_versoes_planejamento_cesta_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.planejamentos_cesta_versoes
    ADD CONSTRAINT planejamentos_cesta_versoes_planejamento_cesta_id_fkey FOREIGN KEY (planejamento_cesta_id) REFERENCES pastoral.planejamentos_cesta(id);

--
-- Name: planejamentos_cesta_versoes planejamentos_cesta_versoes_usuario_aprovador_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.planejamentos_cesta_versoes
    ADD CONSTRAINT planejamentos_cesta_versoes_usuario_aprovador_id_fkey FOREIGN KEY (usuario_aprovador_id) REFERENCES pastoral.usuarios(id);

--
-- Name: reservas_insumos reservas_insumos_apresentacao_insumo_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.reservas_insumos
    ADD CONSTRAINT reservas_insumos_apresentacao_insumo_id_fkey FOREIGN KEY (apresentacao_insumo_id) REFERENCES pastoral.insumos_apresentacoes(id);

--
-- Name: reservas_insumos reservas_insumos_planejamento_versao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.reservas_insumos
    ADD CONSTRAINT reservas_insumos_planejamento_versao_id_fkey FOREIGN KEY (planejamento_versao_id) REFERENCES pastoral.planejamentos_cesta_versoes(id);

--
-- Name: retiradas retiradas_beneficiario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.retiradas
    ADD CONSTRAINT retiradas_beneficiario_id_fkey FOREIGN KEY (beneficiario_id) REFERENCES pastoral.beneficiarios(id);

--
-- Name: retiradas retiradas_direito_beneficio_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.retiradas
    ADD CONSTRAINT retiradas_direito_beneficio_id_fkey FOREIGN KEY (direito_beneficio_id) REFERENCES pastoral.direitos_beneficio(id);

--
-- Name: retiradas retiradas_distribuicao_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.retiradas
    ADD CONSTRAINT retiradas_distribuicao_id_fkey FOREIGN KEY (distribuicao_id) REFERENCES pastoral.distribuicoes(id);

--
-- Name: retiradas_estornos retiradas_estornos_retirada_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.retiradas_estornos
    ADD CONSTRAINT retiradas_estornos_retirada_id_fkey FOREIGN KEY (retirada_id) REFERENCES pastoral.retiradas(id);

--
-- Name: retiradas_estornos retiradas_estornos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.retiradas_estornos
    ADD CONSTRAINT retiradas_estornos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: retiradas_representantes retiradas_representantes_pessoa_representante_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.retiradas_representantes
    ADD CONSTRAINT retiradas_representantes_pessoa_representante_id_fkey FOREIGN KEY (pessoa_representante_id) REFERENCES pastoral.pessoas(id);

--
-- Name: retiradas_representantes retiradas_representantes_retirada_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.retiradas_representantes
    ADD CONSTRAINT retiradas_representantes_retirada_id_fkey FOREIGN KEY (retirada_id) REFERENCES pastoral.retiradas(id);

--
-- Name: retiradas retiradas_usuario_operador_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.retiradas
    ADD CONSTRAINT retiradas_usuario_operador_id_fkey FOREIGN KEY (usuario_operador_id) REFERENCES pastoral.usuarios(id);

--
-- Name: usuarios_perfis usuarios_perfis_perfil_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.usuarios_perfis
    ADD CONSTRAINT usuarios_perfis_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES pastoral.perfis(id);

--
-- Name: usuarios_perfis usuarios_perfis_usuario_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.usuarios_perfis
    ADD CONSTRAINT usuarios_perfis_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES pastoral.usuarios(id);

--
-- Name: usuarios usuarios_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: pastoral; Owner: -
--

ALTER TABLE ONLY pastoral.usuarios
    ADD CONSTRAINT usuarios_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES pastoral.pessoas(id);

--
-- PostgreSQL database dump complete
--

