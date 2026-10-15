-- Analytics-Haertung (15.10.2026): Retention + RLS + Overflow-Transparenz.
-- Umsetzung der bestaetigten Review-Befunde (DSGVO-Retention + Datenminimierung).

-- 1. Daten-Retention: Nutzungs-Events nach 90 Tagen loeschen (passt zur Datenschutzerklaerung).
--    pg_cron ist im Projekt etabliert (daily-game-winners, coupon-reminders etc.).
do $$
begin
  perform cron.unschedule('delete-old-analytics') where exists (select 1 from cron.job where jobname='delete-old-analytics');
  perform cron.schedule('delete-old-analytics','17 3 * * *',
    $c$ delete from public.analytics_events where created_at < now() - interval '90 days'; $c$);
exception when others then raise warning 'analytics retention cron failed (pg_cron?): %', sqlerrm;
end $$;

-- 2. FORCE RLS: auch Tabelleneigentuemer unterliegt den Policies (Schreiben bleibt nur ueber track_event).
--    service_role (Supabase-Admin / Edge Functions) umgeht RLS weiterhin by design.
ALTER TABLE public.analytics_events FORCE ROW LEVEL SECURITY;

-- 3. track_event: Props-Ueberschreitung sichtbar machen statt still auf {} zu nullen.
--    Das Event bleibt erhalten (ohne Payload), aber der Verlust ist im Supabase-Log nachvollziehbar.
CREATE OR REPLACE FUNCTION public.track_event(p_event text, p_props jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;                                  -- nur eingeloggt
  IF p_event IS NULL OR btrim(p_event) = '' THEN RETURN; END IF;
  IF p_props IS NULL OR length(p_props::text) > 2000 THEN                 -- kein Daten-Dumping
    RAISE WARNING 'track_event: props too large, stripped for event %', p_event;
    p_props := '{}'::jsonb;
  END IF;
  INSERT INTO public.analytics_events(user_id, event, props)
    VALUES (v_uid, left(btrim(p_event), 60), p_props);
END $$;
REVOKE ALL ON FUNCTION public.track_event(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.track_event(text, jsonb) TO authenticated;

-- 4. analytics_overview wurde in Migration ...008 ohne REVOKE/GRANT neu definiert -> Rechte nachziehen.
REVOKE ALL ON FUNCTION public.analytics_overview(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.analytics_overview(int) TO authenticated;
