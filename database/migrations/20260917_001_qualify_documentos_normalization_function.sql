-- Corrige dependência implícita de search_path sem alterar a lógica do trigger.
-- Mesma classe de bug já corrigida em 20260830_001 para pastoral.trg_pessoas_normalizacao():
-- a chamada não qualificada a fn_normalizar_documento falha quando o role de conexão
-- não tem "pastoral" no search_path padrão (ex.: Postgres gerenciado/Supabase).
CREATE OR REPLACE FUNCTION pastoral.trg_documentos_normalizacao()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.numero_normalizado := pastoral.fn_normalizar_documento(NEW.numero);
    RETURN NEW;
END
$function$;
