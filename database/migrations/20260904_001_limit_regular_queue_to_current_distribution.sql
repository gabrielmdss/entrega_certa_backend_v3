CREATE OR REPLACE FUNCTION pastoral.registrar_retirada(
    p_direito_id bigint,
    p_distribuicao_id bigint,
    p_tipo character varying,
    p_forma_identificacao character varying,
    p_usuario_id bigint
) RETURNS bigint
LANGUAGE plpgsql
AS $function$
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
$function$;
