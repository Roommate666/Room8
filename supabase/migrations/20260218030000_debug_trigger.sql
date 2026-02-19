-- Temporary debug function to inspect listing triggers
CREATE OR REPLACE FUNCTION public.debug_listing_triggers()
RETURNS TABLE(trigger_name text, function_name text, function_source text)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    t.tgname::text as trigger_name,
    p.proname::text as function_name,
    pg_get_functiondef(p.oid)::text as function_source
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_proc p ON t.tgfoid = p.oid
  WHERE c.relname = 'listings'
  AND NOT t.tgisinternal;
$$;
