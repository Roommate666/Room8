-- ============================================================================
-- 20260906000005_fix_reset_my_verification.sql
-- Bug: reset_my_verification() setzt uni_email/verification_status zurueck, ABER
-- is_verified/is_student_verified/uni_email_verified/verified_at/token werden vom
-- BEFORE-Trigger protect_privileged_profile_columns() auf den Altwert revertiert,
-- weil der aufrufende User kein Admin ist. Ergebnis: "Reset" laesst den User verifiziert.
--
-- Fix: reset_my_verification() setzt einen TRANSAKTIONS-LOKALEN Flag
-- (app.self_verify_reset = 'on'). Der Trigger laesst bei gesetztem Flag NUR die
-- Verify-Felder durch (reines Downgrade auf unverifiziert = kein Sicherheitsrisiko);
-- die harten Privilegien (is_admin/is_partner/is_banned/role/trusted/can_create/
-- partner_can_*) bleiben WEITERHIN hart geschuetzt. Ein normaler User kann den Flag
-- nicht selbst setzen (nur diese SECURITY-DEFINER-RPC, die ausschliesslich false/null
-- schreibt) -> kein Self-Upgrade-Vektor.
-- ============================================================================

-- 1) Trigger-Funktion: Verify-Felder nur schuetzen, wenn KEIN Reset-Flag gesetzt ist.
create or replace function public.protect_privileged_profile_columns()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
BEGIN
    -- service_role (kein auth.uid) + echte Admins duerfen alles
    IF auth.uid() IS NULL OR public.is_caller_admin() THEN
        RETURN NEW;
    END IF;
    -- Harte Privilegien: IMMER auf Altwert zwingen (kein Self-Upgrade, auch nicht beim Reset)
    NEW.is_admin            := OLD.is_admin;
    NEW.is_partner          := OLD.is_partner;
    NEW.is_banned           := OLD.is_banned;
    NEW.banned_at           := OLD.banned_at;
    NEW.role                := OLD.role;
    NEW.trusted_organizer   := OLD.trusted_organizer;
    NEW.can_create_events   := OLD.can_create_events;
    NEW.partner_can_jobs    := OLD.partner_can_jobs;
    NEW.partner_can_coupons := OLD.partner_can_coupons;
    NEW.partner_can_events  := OLD.partner_can_events;
    -- Verify-Felder: normalerweise geschuetzt. AUSNAHME: reset_my_verification() hat den
    -- Downgrade-Flag gesetzt -> eigener Self-Reset auf unverifiziert ist erlaubt.
    IF coalesce(current_setting('app.self_verify_reset', true), '') <> 'on' THEN
        NEW.is_verified         := OLD.is_verified;
        NEW.is_student_verified := OLD.is_student_verified;
        NEW.uni_email_verified  := OLD.uni_email_verified;
        NEW.verified_at         := OLD.verified_at;
        NEW.uni_email_verification_token := OLD.uni_email_verification_token;
    END IF;
    RETURN NEW;
END $function$;

-- 2) reset_my_verification(): Flag setzen, dann eigenen Status vollstaendig zuruecksetzen.
create or replace function public.reset_my_verification()
returns boolean language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null then return false; end if;
  perform set_config('app.self_verify_reset', 'on', true);  -- nur diese Transaktion
  update public.profiles set
    is_verified=false, is_student_verified=false, is_student=false,
    uni_email_verified=false, uni_email=null, uni_email_verification_token=null,
    uni_email_token_created_at=null, uni_code_window_start=null, uni_code_window_count=0,
    verification_status='none', verification_method=null, verified_at=null
  where id = auth.uid();
  return true;
end; $function$;
grant execute on function public.reset_my_verification() to authenticated;
