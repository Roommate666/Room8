-- Pending Coins + Auto-Gutschrift bei Verifizierung (19.10.2026)
--
-- Zweck: Bei Stand-/Flyer-Aktionen koennen G-Coins fuer NOCH-nicht-verifizierte Nutzer
-- "vorgemerkt" werden. Sobald der Nutzer sich mit Uni-Mail verifiziert, werden die Coins
-- automatisch gutgeschrieben (+ Push "deine Coins sind da"). Starker Verify-Anreiz:
-- "verifizier dich = deine Coins" statt Coins zu verschenken, die niemanden in die
-- verifizierte Nutzerbasis holen. (Yusuf-Wunsch 19.10. aus Drehrad-Aktion.)

CREATE TABLE IF NOT EXISTS public.pending_coins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount int NOT NULL,
  reason text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  granted_at timestamptz
);
ALTER TABLE public.pending_coins ENABLE ROW LEVEL SECURITY;
-- keine Policy fuer anon/authenticated -> nur service_role/postgres (Admin) sehen/schreiben.

-- Schreibt vorgemerkte Coins gut, sobald der Nutzer verifiziert ist. Idempotent ueber granted_at.
CREATE OR REPLACE FUNCTION public.grant_pending_coins()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pc.id, pc.user_id, pc.amount, pc.reason
    FROM public.pending_coins pc
    JOIN public.profiles p ON p.id = pc.user_id
    WHERE pc.granted_at IS NULL
      AND (p.is_verified IS TRUE OR p.is_student_verified IS TRUE)
  LOOP
    BEGIN
      PERFORM public.add_coins(r.user_id, r.amount, r.reason, NULL);
      UPDATE public.pending_coins SET granted_at = now() WHERE id = r.id;
      PERFORM public.notify_user_push(r.user_id, 'reward',
        'Deine ' || r.amount || ' G-Coins sind da! 🐐',
        'Danke fürs Verifizieren — deine Drehrad-Coins wurden gutgeschrieben.',
        jsonb_build_object('url','/challenge.html'));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'grant_pending_coins fail %: %', r.user_id, sqlerrm;
    END;
  END LOOP;
END;
$function$;

-- Taeglich 09:00 UTC prüfen + gutschreiben (max 1 Tag Verzoegerung nach Verifizierung).
SELECT cron.unschedule('grant-pending-coins')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'grant-pending-coins');
SELECT cron.schedule('grant-pending-coins', '0 9 * * *', $$SELECT public.grant_pending_coins();$$);
