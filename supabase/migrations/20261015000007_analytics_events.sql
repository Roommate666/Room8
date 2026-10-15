-- Produkt-internes Analytics (15.10.2026): eigenes Event-Log in Supabase.
-- DSGVO-schlank: nur eingeloggte Nutzer (user_id), eigene DB (keine Drittpartei/kein Drittland),
-- keine Cookies/Cross-Site-Tracking, props groessenbegrenzt. SELECT nur fuer Admins.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  event      text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_event_time ON public.analytics_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_user_time  ON public.analytics_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_time       ON public.analytics_events (created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
-- Kein direktes INSERT/SELECT fuer Nutzer; Schreiben nur ueber track_event-RPC.
DROP POLICY IF EXISTS analytics_admin_read ON public.analytics_events;
CREATE POLICY analytics_admin_read ON public.analytics_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- track_event: ein Event fuer den eingeloggten Nutzer schreiben. Fire-and-forget, nie blockierend.
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
  IF p_props IS NULL OR length(p_props::text) > 2000 THEN p_props := '{}'::jsonb; END IF;  -- kein Daten-Dumping
  INSERT INTO public.analytics_events(user_id, event, props)
    VALUES (v_uid, left(btrim(p_event), 60), p_props);
END $$;
REVOKE ALL ON FUNCTION public.track_event(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.track_event(text, jsonb) TO authenticated;

-- Admin-Kennzahlen in EINEM Aufruf (fuer das Dashboard): aktive Nutzer, Events, Top-Seiten, Funnel.
CREATE OR REPLACE FUNCTION public.analytics_overview(p_days int DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_is_admin boolean; v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 90)));
        v_out jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT jsonb_build_object(
    'range_days', greatest(1, least(p_days, 90)),
    'dau_today',  (SELECT count(DISTINCT user_id) FROM analytics_events WHERE created_at >= date_trunc('day', now())),
    'wau',        (SELECT count(DISTINCT user_id) FROM analytics_events WHERE created_at >= now() - interval '7 days'),
    'active_total',(SELECT count(DISTINCT user_id) FROM analytics_events WHERE created_at >= v_since),
    'events_total',(SELECT count(*) FROM analytics_events WHERE created_at >= v_since),
    'by_day',     (SELECT coalesce(jsonb_agg(d ORDER BY d->>'tag'),'[]'::jsonb) FROM (
                     SELECT jsonb_build_object('tag', to_char(date_trunc('day', created_at),'DD.MM'),
                       'nutzer', count(DISTINCT user_id), 'events', count(*)) d
                     FROM analytics_events WHERE created_at >= v_since GROUP BY date_trunc('day', created_at)) s),
    'top_events', (SELECT coalesce(jsonb_agg(e ORDER BY (e->>'n')::int DESC),'[]'::jsonb) FROM (
                     SELECT jsonb_build_object('event', event, 'n', count(*)) e
                     FROM analytics_events WHERE created_at >= v_since GROUP BY event ORDER BY count(*) DESC LIMIT 15) s),
    'top_pages',  (SELECT coalesce(jsonb_agg(p ORDER BY (p->>'n')::int DESC),'[]'::jsonb) FROM (
                     SELECT jsonb_build_object('page', coalesce(props->>'page','?'), 'n', count(*)) p
                     FROM analytics_events WHERE event='pageview' AND created_at >= v_since
                     GROUP BY props->>'page' ORDER BY count(*) DESC LIMIT 15) s)
  ) INTO v_out;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.analytics_overview(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.analytics_overview(int) TO authenticated;
