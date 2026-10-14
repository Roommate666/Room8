-- Events-Reaktivierung (14.10.2026)
-- 1. is_test-Spalte fuer events: events.html filtert .eq('is_test', false), die Spalte fehlte
--    -> Query waere gebrochen. Additiv, Default false (bestehende Events bleiben sichtbar).
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- 2. App-Config-Tabelle fuer globale Feature-Schalter (Yusufs Events-An/Aus-Schalter)
CREATE TABLE IF NOT EXISTS public.app_config (
  key        text PRIMARY KEY,
  value      boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Default: Events-Tab zunaechst AUS (sichtbare Aenderung erst wenn Yusuf anschaltet)
INSERT INTO public.app_config(key, value) VALUES ('events_enabled', false)
  ON CONFLICT (key) DO NOTHING;

-- RLS: jeder (anon + eingeloggt) darf das Flag LESEN (fuer Tab-Sichtbarkeit),
-- schreiben nur ueber die Admin-RPC unten (kein breites UPDATE-Grant).
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_config_read ON public.app_config;
CREATE POLICY app_config_read ON public.app_config FOR SELECT USING (true);

-- Admin-Toggle: SECURITY DEFINER mit hartem is_admin-Check (search_path gehaertet)
CREATE OR REPLACE FUNCTION public.set_app_flag(p_key text, p_value boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.app_config(key, value, updated_at)
    VALUES (p_key, p_value, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN p_value;
END $$;

REVOKE ALL ON FUNCTION public.set_app_flag(text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_app_flag(text, boolean) TO authenticated;
