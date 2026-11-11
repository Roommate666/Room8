-- Push-Nudge an aktive, aber NICHT verifizierte Spieler (18.10.2026)
--
-- Zielgruppe: User die diesen Monat Coins gesammelt haben (= spielen aktiv mit),
-- aber NICHT verifiziert sind. Seit dem Verify-Gate (20261018000001) zaehlen sie
-- nicht in der Wettkampf-Wertung und koennen keine Preise gewinnen -> gezielter
-- Push treibt die Verifizierungs-Conversion. Trifft nur User mit fcm_token (sonst
-- kein Push moeglich).
--
-- Komplementaer zum Email-verify-reminder (send_verify_reminders, d2/d7) -- anderer
-- Kanal (Push statt Mail), andere Zielgruppe (aktiv statt zeitbasiert-nach-Signup).
--
-- Frequenz-Cap = WOECHENTLICHER Cron (kein Custom-Dedup noetig). notify_user_push
-- bringt Opt-out (should_notify), QuietHours (22-8) und RateLimit (5/h/channel)
-- automatisch mit -- siehe specs/push-and-email.md 2b/2c. notify_user_push ist der
-- EINZIGE erlaubte Push-Weg.

CREATE OR REPLACE FUNCTION public.send_active_unverified_nudge()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT p.id
    FROM public.profiles p
    JOIN public.coin_transactions ct ON ct.user_id = p.id
    WHERE p.is_verified IS NOT TRUE
      AND p.is_student_verified IS NOT TRUE
      AND coalesce(p.is_test, false) = false
      AND p.fcm_token IS NOT NULL
      AND ct.created_at >= date_trunc('month', now())   -- aktiv im laufenden Wettkampf
    LIMIT 200
  LOOP
    BEGIN
      PERFORM public.notify_user_push(
        p_user_id := r.id,
        p_channel := 'verify_nudge',
        p_title   := 'Du sammelst Coins – zählst aber nicht 🏆',
        p_body    := 'Nur verifizierte Studenten gewinnen die Monatspreise. Verifizier dich mit deiner Uni-Mail – dauert 1 Minute.',
        p_data    := jsonb_build_object('url', '/verify-options.html')
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'active-unverified nudge failed for %: %', r.id, sqlerrm;
    END;
  END LOOP;
END;
$function$;

-- Woechentlich Mittwoch 16:00 UTC (= 17-18 Uhr Berlin, nach der Uni, ausserhalb QuietHours).
-- Idempotent: alten Job entfernen falls vorhanden, dann neu schedulen.
SELECT cron.unschedule('active-unverified-nudge')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'active-unverified-nudge');

SELECT cron.schedule('active-unverified-nudge', '0 16 * * 3',
  $$SELECT public.send_active_unverified_nudge();$$);
