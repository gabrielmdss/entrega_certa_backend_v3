CREATE OR REPLACE FUNCTION pastoral.fn_beneficiario_tem_pendencia_anterior(p_beneficiario_id bigint,p_competencia_id bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pastoral,pg_catalog AS $function$
WITH atual AS (SELECT ano,mes FROM pastoral.competencias WHERE id=p_competencia_id), anterior AS (
 SELECT db.status,a.status ausencia_status FROM pastoral.direitos_beneficio db
 JOIN pastoral.competencias c ON c.id=db.competencia_id CROSS JOIN atual
 LEFT JOIN pastoral.ausencias a ON a.direito_beneficio_id=db.id
 WHERE db.beneficiario_id=p_beneficiario_id AND db.tipo='REGULAR'
 AND (c.ano*12+c.mes)<(atual.ano*12+atual.mes)
 ORDER BY c.ano DESC,c.mes DESC LIMIT 1)
SELECT COALESCE((SELECT status IN('AUSENTE','AUSENTE_NAO_JUSTIFICADO','NAO_ATENDIDO_IRREGULARIDADE')
 AND COALESCE(ausencia_status,'SEM_JUSTIFICATIVA')<>'JUSTIFICADA' FROM anterior),false);
$function$;
