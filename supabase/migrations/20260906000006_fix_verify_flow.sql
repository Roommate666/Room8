-- ============================================================================
-- 20260906000006_fix_verify_flow.sql
-- KRITISCHER LAUNCH-FIX: Die gesamte Uni-Code-Verifizierung war durch den
-- BEFORE-Trigger protect_privileged_profile_columns() blockiert:
--   * request_uni_code schreibt uni_email_verification_token (geschuetzt -> revertiert)
--     -> Code-Mail enthaelt einen Code, der NICHT in der DB steht.
--   * verify_uni_code schreibt is_verified/uni_email_verified (geschuetzt -> revertiert)
--     -> selbst bei richtigem Code bleibt der User unverifiziert.
-- Symptom: keine erfolgreiche Verifizierung seit ~03.06.2026.
--
-- Fix: EIN gemeinsamer transaktionslokaler Flag app.verify_write='on'. Die drei
-- Verify-RPCs (SECURITY DEFINER) setzen ihn; der Trigger laesst bei gesetztem Flag
-- die Verify-Felder durch. Harte Privilegien (is_admin/is_partner/is_banned/role/
-- trusted/can_create/partner_can_*) bleiben IMMER geschuetzt, auch mit Flag. Ein
-- normaler User kann den Flag nicht setzen (nur diese RPCs), und die RPCs machen nur
-- kontrollierte Schreibvorgaenge (verify_uni_code setzt is_verified NUR nach Code-Match).
-- Loest den self_verify_reset-Flag aus 20260906000005 durch den generellen ab.
-- ============================================================================

-- 1) Trigger
create or replace function public.protect_privileged_profile_columns()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
BEGIN
    IF auth.uid() IS NULL OR public.is_caller_admin() THEN
        RETURN NEW;
    END IF;
    -- Harte Privilegien: IMMER Altwert (kein Self-Upgrade, auch nicht im Verify-Flow)
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
    -- Verify-Felder: geschuetzt, AUSSER eine Verify-RPC hat den Flag gesetzt.
    IF coalesce(current_setting('app.verify_write', true), '') <> 'on' THEN
        NEW.is_verified         := OLD.is_verified;
        NEW.is_student_verified := OLD.is_student_verified;
        NEW.uni_email_verified  := OLD.uni_email_verified;
        NEW.verified_at         := OLD.verified_at;
        NEW.uni_email_verification_token := OLD.uni_email_verification_token;
    END IF;
    RETURN NEW;
END $function$;

-- 2) request_uni_code (Flag + Rate-Limit + Domain-Blocklist wie gehabt)
create or replace function public.request_uni_code(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_domain text; v_code text; v_url text; v_html text;
  v_win_start timestamptz; v_win_count int;
  v_blocked text[] := array['gmail.com','googlemail.com','gmx.de','gmx.net','web.de','yahoo.com','yahoo.de',
    'hotmail.com','hotmail.de','outlook.com','outlook.de','live.de','live.com','icloud.com','me.com',
    't-online.de','freenet.de','aol.com','proton.me','protonmail.com','mail.de'];
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  perform set_config('app.verify_write','on',true);   -- Trigger: Token-Schreibung erlauben
  v_email := lower(trim(p_email));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok',false,'error','INVALID_EMAIL'); end if;
  v_domain := split_part(v_email,'@',2);
  if v_domain = any(v_blocked) then return jsonb_build_object('ok',false,'error','NOT_UNI_EMAIL'); end if;
  if exists (select 1 from public.profiles where lower(uni_email)=v_email and uni_email_verified=true and id<>v_uid) then
    return jsonb_build_object('ok',false,'error','EMAIL_IN_USE'); end if;

  select uni_code_window_start, uni_code_window_count into v_win_start, v_win_count
    from public.profiles where id = v_uid;
  if v_win_start is null or v_win_start < now() - interval '10 minutes' then
    update public.profiles set uni_code_window_start = now(), uni_code_window_count = 1 where id = v_uid;
  elsif coalesce(v_win_count,0) >= 3 then
    return jsonb_build_object('ok',false,'error','RATE_LIMITED',
      'retry_after_sec', greatest(1, 600 - floor(extract(epoch from (now() - v_win_start)))::int));
  else
    update public.profiles set uni_code_window_count = coalesce(uni_code_window_count,0) + 1 where id = v_uid;
  end if;

  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');
  update public.profiles set uni_email=v_email, uni_email_verification_token=v_code, uni_email_token_created_at=now()
    where id=v_uid;

  v_url := coalesce(current_setting('app.supabase_url',true),'https://tvnvmogaqmduzcycmvby.supabase.co')||'/functions/v1/send-email';
  v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Dein UniGoat-Code</h2>'
    ||'<p style="margin:0 0 8px;">Gib diesen Code in der App ein, um deinen Studenten-Status zu bestätigen:</p>'
    ||'<div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f4f6f8;border-radius:12px;padding:16px;text-align:center;margin:12px 0;">'||v_code||'</div>'
    ||'<p style="margin:0;color:#6b7280;font-size:13px;">Der Code ist 15 Minuten gültig. Wenn du das nicht warst, ignoriere diese Mail.</p>';
  begin
    perform net.http_post(url:=v_url, headers:=public.app_internal_headers(),
      body:=jsonb_build_object('to',v_email,'subject','Dein UniGoat-Code: '||v_code,'html',v_html,'userId',v_uid));
  exception when others then raise warning 'uni code mail fail %: %',v_uid,sqlerrm; end;
  return jsonb_build_object('ok',true);
end; $$;
grant execute on function public.request_uni_code(text) to authenticated;

-- 3) verify_uni_code (Flag, damit is_verified/uni_email_verified gesetzt werden duerfen)
create or replace function public.verify_uni_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_code text; v_ts timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  perform set_config('app.verify_write','on',true);   -- Trigger: Verify-Felder erlauben
  select uni_email, uni_email_verification_token, uni_email_token_created_at into v_email, v_code, v_ts
    from public.profiles where id=v_uid;
  if v_code is null or v_email is null then return jsonb_build_object('ok',false,'error','NO_CODE'); end if;
  if v_ts is null or v_ts < now() - interval '15 minutes' then
    update public.profiles set uni_email_verification_token=null where id=v_uid;
    return jsonb_build_object('ok',false,'error','CODE_EXPIRED'); end if;
  if regexp_replace(coalesce(p_code,''),'[^0-9]','','g') <> v_code then
    return jsonb_build_object('ok',false,'error','CODE_WRONG'); end if;
  if exists (select 1 from public.profiles where lower(uni_email)=lower(v_email) and uni_email_verified=true and id<>v_uid) then
    return jsonb_build_object('ok',false,'error','EMAIL_IN_USE'); end if;
  update public.profiles set is_verified=true, is_student=true, uni_email_verified=true,
    verification_status='approved', verified_at=now(), uni_email_verification_token=null where id=v_uid;
  begin perform public.reward_pending_referral(v_uid); exception when others then null; end;
  begin perform public.grant_welcome_bonus(v_uid); exception when others then null; end;
  return jsonb_build_object('ok',true);
end; $$;
grant execute on function public.verify_uni_code(text) to authenticated;

-- 4) reset_my_verification (auf gemeinsamen Flag umgestellt)
create or replace function public.reset_my_verification()
returns boolean language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null then return false; end if;
  perform set_config('app.verify_write', 'on', true);
  update public.profiles set
    is_verified=false, is_student_verified=false, is_student=false,
    uni_email_verified=false, uni_email=null, uni_email_verification_token=null,
    uni_email_token_created_at=null, uni_code_window_start=null, uni_code_window_count=0,
    verification_status='none', verification_method=null, verified_at=null
  where id = auth.uid();
  return true;
end; $function$;
grant execute on function public.reset_my_verification() to authenticated;
