-- Jobs-Tab-Toggle (16.10.): analog events_enabled. Admin schaltet den Jobs-Tab an/aus;
-- jobs-tab.js zeigt ihn nur bei Flag an UND >=1 aktivem Job. set_app_flag-Allowlist erweitert.
CREATE OR REPLACE FUNCTION public.set_app_flag(p_key text, p_value boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_key NOT IN ('events_enabled', 'jobs_enabled') THEN
    RAISE EXCEPTION 'unknown config key: %', p_key;
  END IF;
  INSERT INTO public.app_config(key, value, updated_at)
    VALUES (p_key, p_value, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN p_value;
END $function$;

-- Flag anlegen (default aus)
INSERT INTO public.app_config(key, value) VALUES ('jobs_enabled', false)
  ON CONFLICT (key) DO NOTHING;
