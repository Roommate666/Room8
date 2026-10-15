-- Analytics-Funnel (15.10.2026): analytics_overview um Trichter-Kennzahlen erweitert.
-- Verify: geoeffnet -> Code angefordert -> verifiziert. Coupon: angesehen -> eingeloest.
-- (distinct Nutzer je Schritt, damit man Abbruchstellen sieht.)
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
                     GROUP BY props->>'page' ORDER BY count(*) DESC LIMIT 15) s),
    'funnel', jsonb_build_object(
      'verify_opened',    (SELECT count(DISTINCT user_id) FROM analytics_events WHERE event='pageview' AND props->>'page'='verify-options' AND created_at >= v_since),
      'verify_requested', (SELECT count(DISTINCT user_id) FROM analytics_events WHERE event='verify_code_requested' AND created_at >= v_since),
      'verify_success',   (SELECT count(DISTINCT user_id) FROM analytics_events WHERE event='verify_success' AND created_at >= v_since),
      'coupon_viewed',    (SELECT count(DISTINCT user_id) FROM analytics_events WHERE event='coupon_view' AND created_at >= v_since),
      'coupon_redeemed',  (SELECT count(DISTINCT user_id) FROM analytics_events WHERE event='coupon_redeemed' AND created_at >= v_since)
    )
  ) INTO v_out;
  RETURN v_out;
END $$;
