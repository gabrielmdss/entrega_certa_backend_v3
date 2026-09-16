BEGIN;

CREATE OR REPLACE FUNCTION pastoral.fn_consumir_cestas_liberadas(p_distribuicao_id bigint, p_quantidade integer, p_entrega_id bigint, p_usuario_id bigint) RETURNS void
    LANGUAGE plpgsql
    SET search_path = pastoral, pg_catalog
    AS $$
DECLARE r record; v_restante int:=p_quantidade; v_tomar int; v_modelo bigint;
BEGIN
 SELECT ca.modelo_cesta_id INTO v_modelo FROM entregas_cestas e
 JOIN cestas_adicionais ca ON ca.id=e.cesta_adicional_id WHERE e.id=p_entrega_id;
 FOR r IN SELECT * FROM distribuicoes_liberacoes_cestas lc
          WHERE distribuicao_id=p_distribuicao_id AND quantidade_liberada-quantidade_consumida-quantidade_retornada>0
          AND (v_modelo IS NULL OR EXISTS (
            SELECT 1 FROM lotes_montagem l
            JOIN planejamentos_cesta_versoes pv ON pv.id=l.planejamento_versao_id
            JOIN planejamentos_cesta pc ON pc.id=pv.planejamento_cesta_id
            WHERE l.id=lc.lote_montagem_id AND pc.modelo_cesta_id=v_modelo
          ))
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

CREATE OR REPLACE FUNCTION pastoral.entregar_cesta_adicional(p_cesta_adicional_id bigint, p_usuario_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path = pastoral, pg_catalog
    AS $$
DECLARE v_ca cestas_adicionais%ROWTYPE; v_entrega bigint;
BEGIN
 -- Distribui??o primeiro: mesma ordem de retirada e encerramento.
 PERFORM d.id FROM distribuicoes d JOIN cestas_adicionais ca ON ca.distribuicao_id=d.id
 WHERE ca.id=p_cesta_adicional_id FOR UPDATE OF d;
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

CREATE OR REPLACE FUNCTION pastoral.registrar_retirada(p_direito_id bigint, p_distribuicao_id bigint, p_tipo character varying, p_forma_identificacao character varying, p_usuario_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path = pastoral, pg_catalog
    AS $$
DECLARE
    v_direito pastoral.direitos_beneficio%ROWTYPE;
    v_retirada bigint;
    v_entrega bigint;
    v_competencia_distribuicao bigint;
    v_classificacao varchar(20);
BEGIN
    PERFORM d.id FROM pastoral.distribuicoes d WHERE d.id=p_distribuicao_id FOR UPDATE;
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

CREATE OR REPLACE FUNCTION pastoral.liberar_cestas(p_distribuicao_id bigint, p_lote_id bigint, p_quantidade integer, p_usuario_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path = pastoral, pg_catalog
    AS $$
DECLARE v_disp int; v_status text; v_id bigint;
BEGIN
 PERFORM id FROM distribuicoes WHERE id=p_distribuicao_id FOR UPDATE;
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
CREATE OR REPLACE FUNCTION pastoral.estornar_retirada(p_retirada_id bigint, p_usuario_id bigint, p_motivo text)
RETURNS void LANGUAGE plpgsql SET search_path = pastoral, pg_catalog AS $$
DECLARE
 v_r retiradas%ROWTYPE;
 v_e bigint;
 x record;
 v_status text;
BEGIN
 -- Evita inversão com encerramento, que bloqueia distribuição antes de direitos.
 SELECT d.status INTO v_status
 FROM distribuicoes d JOIN retiradas r ON r.distribuicao_id=d.id
 WHERE r.id=p_retirada_id FOR UPDATE OF d;
 SELECT * INTO v_r FROM retiradas WHERE id=p_retirada_id FOR UPDATE;
 IF NOT FOUND OR v_r.status<>'VALIDA' THEN
   RAISE EXCEPTION 'Retirada não encontrada ou já estornada';
 END IF;
 PERFORM id FROM direitos_beneficio WHERE id=v_r.direito_beneficio_id FOR UPDATE;
 SELECT id INTO v_e FROM entregas_cestas WHERE retirada_id=p_retirada_id FOR UPDATE;
 IF v_e IS NULL THEN RAISE EXCEPTION 'Entrega física não encontrada'; END IF;
 FOR x IN SELECT * FROM entregas_cestas_lotes WHERE entrega_cesta_id=v_e ORDER BY id FOR UPDATE LOOP
   UPDATE distribuicoes_liberacoes_cestas
   SET quantidade_consumida=quantidade_consumida-x.quantidade,
       quantidade_retornada=quantidade_retornada+CASE WHEN v_status='ENCERRADA' THEN x.quantidade ELSE 0 END
   WHERE id=x.liberacao_cesta_id;
   IF v_status='ENCERRADA' THEN
     UPDATE lotes_montagem SET quantidade_disponivel=quantidade_disponivel+x.quantidade,status='ATIVO'
     WHERE id=x.lote_montagem_id;
   END IF;
   INSERT INTO movimentacoes_cestas(lote_montagem_id,tipo,quantidade,sentido,referencia_tipo,referencia_id,usuario_id,observacao)
   VALUES(x.lote_montagem_id,'ESTORNO_ENTREGA',x.quantidade,1,'ESTORNO_RETIRADA',p_retirada_id,p_usuario_id,p_motivo);
 END LOOP;
 UPDATE retiradas SET status='ESTORNADA' WHERE id=p_retirada_id;
 INSERT INTO retiradas_estornos(retirada_id,motivo,usuario_id) VALUES(p_retirada_id,p_motivo,p_usuario_id);
 -- Preserva a regra existente de estorno; classificação assistencial após
 -- encerramento requer decisão explícita, especialmente para antecipadas.
 UPDATE direitos_beneficio SET status='DISPONIVEL',atualizado_em=now() WHERE id=v_r.direito_beneficio_id;
END$$;

COMMIT;
