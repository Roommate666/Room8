-- Temporaere Funktion um Trigger auf messages zu pruefen
CREATE OR REPLACE FUNCTION public.debug_message_triggers()
RETURNS TABLE(trigger_name text, event text, function_name text)
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        t.tgname::text as trigger_name,
        CASE
            WHEN t.tgtype & 4 > 0 THEN 'INSERT'
            WHEN t.tgtype & 8 > 0 THEN 'DELETE'
            WHEN t.tgtype & 16 > 0 THEN 'UPDATE'
            ELSE 'OTHER'
        END as event,
        p.proname::text as function_name
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE c.relname = 'messages'
    AND NOT t.tgisinternal;
$$;
