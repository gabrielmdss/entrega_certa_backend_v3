-- Corrige dependência implícita de search_path sem alterar a lógica do trigger.
CREATE OR REPLACE FUNCTION pastoral.trg_pessoas_normalizacao()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.nome_normalizado := pastoral.fn_normalizar_texto(NEW.nome_completo);
    NEW.atualizado_em := now();
    RETURN NEW;
END
$function$;
