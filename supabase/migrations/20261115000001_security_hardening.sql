-- Security-Haertung 15.11.2026 (Audit). Ziel: Luecken schliessen, nichts Funktionierendes brechen.
-- Restore-Punkt: backups/restore-20261115/ (Policies, Funktionen, Views, Grants vorher).
-- Angewandt per supabase db query (nicht db push, da 2026-10-26..11-09 remote nicht verbucht sind).

-- 1) Interne/Cron/Admin-Funktionen: kein Aufruf mehr durch anon/authenticated.
--    Aufrufer sind ausschliesslich pg_cron (postgres), SECURITY-DEFINER-Funktionen und Edge Functions (service_role).
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname = any (array['_announce_coupon_to_city','admin_push_coupon','admin_list_feedback','admin_reset_verification','admin_update_feedback_status','announce_coupon','award_daily_game_winners','cleanup_old_notification_logs','create_notification','ensure_store_qr','expire_verifications','grant_pending_coins','increment_coupon_redemptions','notify_competition_ending','notify_competition_new_month','notify_competition_winners','notify_coupon_spotlight','notify_daily_quest_reminder','notify_rank_changes','notify_streak_risk','notify_user_email','notify_user_push','send_active_unverified_nudge','send_daily_coupon_reminders','send_daily_game_reminders','send_event_reminders','send_reactivation_emails','send_user_email','send_verify_reminders','send_weekly_digest','send_weekly_spotlight'])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- 2) profiles: Selbst-Admin ueber Loeschen+Neuanlegen verhindern; Verify-Spalten schuetzen.
alter table public.profiles add column if not exists uni_code_fail_count integer not null default 0;
alter table public.profiles add column if not exists uni_code_fail_for timestamptz;

create or replace function public.protect_privileged_profile_columns()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
    if auth.uid() is null or public.is_caller_admin() then
        return new;
    end if;
    if tg_op = 'INSERT' then
        -- Client legt Profil selbst an (regulaer macht das handle_new_user ohne auth.uid()):
        -- privilegierte Spalten auf sichere Werte.
        new.is_admin := false; new.is_partner := false; new.role := 'user';
        new.is_banned := false; new.banned_at := null;
        new.trusted_organizer := false; new.can_create_events := false;
        new.partner_can_jobs := false; new.partner_can_coupons := false; new.partner_can_events := false;
        new.coins := 0;
        new.is_verified := false; new.is_student_verified := false; new.uni_email_verified := false;
        new.verified_at := null; new.uni_email_verification_token := null;
        new.uni_code_fail_count := 0; new.uni_code_fail_for := null;
        return new;
    end if;
    new.is_admin := old.is_admin;
    new.is_partner := old.is_partner;
    new.is_banned := old.is_banned;
    new.banned_at := old.banned_at;
    new.role := old.role;
    new.trusted_organizer := old.trusted_organizer;
    new.can_create_events := old.can_create_events;
    new.partner_can_jobs := old.partner_can_jobs;
    new.partner_can_coupons := old.partner_can_coupons;
    new.partner_can_events := old.partner_can_events;
    if coalesce(current_setting('app.coins_write', true),'') <> 'on' then
        new.coins := old.coins;
    end if;
    if coalesce(current_setting('app.verify_write', true), '') <> 'on' then
        new.is_verified := old.is_verified;
        new.is_student_verified := old.is_student_verified;
        new.uni_email_verified := old.uni_email_verified;
        new.verified_at := old.verified_at;
        new.uni_email_verification_token := old.uni_email_verification_token;
        new.uni_email := old.uni_email;
        new.uni_email_token_created_at := old.uni_email_token_created_at;
        new.uni_code_window_start := old.uni_code_window_start;
        new.uni_code_window_count := old.uni_code_window_count;
        new.uni_code_fail_count := old.uni_code_fail_count;
        new.uni_code_fail_for := old.uni_code_fail_for;
    end if;
    return new;
end $function$;

drop trigger if exists trg_protect_privileged_profile_columns_ins on public.profiles;
create trigger trg_protect_privileged_profile_columns_ins
  before insert on public.profiles
  for each row execute function public.protect_privileged_profile_columns();

-- 3) Admin-Policies nicht mehr ueber die (vom Nutzer aenderbare) E-Mail.
alter policy "Admins manage coupon photos" on public.coupon_photos
  using (public.is_caller_admin() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
alter policy "Admins manage coupons" on public.coupons
  using (public.is_caller_admin() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
alter policy "Admins can manage reports" on public.reports
  using (public.is_caller_admin() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
alter policy "Admin can delete all listings" on public.listings
  using (public.is_caller_admin() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 4) Uni-Code nicht mehr ueber my_profile lesbar.
CREATE OR REPLACE VIEW public.my_profile AS SELECT id,
    username,
    avatar_url,
    created_at,
    date_of_birth,
    city,
    enrollment_certificate_url,
    is_verified,
    is_student,
    role,
    bio,
    updated_at,
    is_student_verified,
    full_name,
    edu_email,
    verification_status,
    university,
    study_field,
    semester,
    age,
    languages,
    interests,
    notification_settings,
    email_domain,
    verification_method,
    verification_document_url,
    verification_rejection_reason,
    verified_at,
    consent_given,
    consent_given_at,
    email,
    uni_email,
    NULL::text AS uni_email_verification_token,
    uni_email_verified,
    is_admin,
    is_banned,
    banned_at,
    student_id_image_url,
    fcm_token,
    instagram_handle,
    uni_email_token_created_at,
    is_partner,
    partner_business_name,
    trusted_organizer,
    can_create_events,
    is_test,
    partner_can_jobs,
    partner_can_coupons,
    partner_can_events,
    current_chat_listing_id,
    avatar_config,
    enrollment_verified_at,
    enrollment_valid_until,
    coins,
    referral_code,
    referred_by,
    referral_rewarded,
    streak_days,
    last_active_date,
    last_challenge_rank,
    email_marketing,
    unsubscribe_token,
    is_champion,
    streak_freezes,
    last_freeze_grant,
    streak_best
   FROM profiles
  WHERE (id = auth.uid());

-- 5) verify_uni_code: hoechstens 5 Fehlversuche je Code, danach gilt der Code als abgelaufen
--    (Client zeigt dann den bekannten Text "Code abgelaufen, fordere einen neuen an").
create or replace function public.verify_uni_code(p_code text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_email text; v_code text; v_ts timestamptz; v_fails int; v_fail_for timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  perform set_config('app.verify_write','on',true);
  select uni_email, uni_email_verification_token, uni_email_token_created_at, uni_code_fail_count, uni_code_fail_for
    into v_email, v_code, v_ts, v_fails, v_fail_for
    from public.profiles where id=v_uid;
  if v_code is null or v_email is null then return jsonb_build_object('ok',false,'error','NO_CODE'); end if;
  if v_ts is null or v_ts < now() - interval '30 minutes' then
    update public.profiles set uni_email_verification_token=null, uni_code_fail_count=0, uni_code_fail_for=null where id=v_uid;
    return jsonb_build_object('ok',false,'error','CODE_EXPIRED'); end if;
  -- Zaehler gehoert immer zum aktuellen Code (neuer Code = neuer Zaehler)
  if v_fail_for is distinct from v_ts then v_fails := 0; end if;
  if regexp_replace(coalesce(p_code,''),'[^0-9]','','g') <> v_code then
    v_fails := coalesce(v_fails,0) + 1;
    if v_fails >= 5 then
      update public.profiles set uni_email_verification_token=null, uni_code_fail_count=0, uni_code_fail_for=null where id=v_uid;
      return jsonb_build_object('ok',false,'error','CODE_EXPIRED');
    end if;
    update public.profiles set uni_code_fail_count=v_fails, uni_code_fail_for=v_ts where id=v_uid;
    return jsonb_build_object('ok',false,'error','CODE_WRONG'); end if;
  if exists (select 1 from public.profiles where lower(uni_email)=lower(v_email) and uni_email_verified=true and id<>v_uid) then
    return jsonb_build_object('ok',false,'error','EMAIL_IN_USE'); end if;
  update public.profiles set is_verified=true, is_student=true, uni_email_verified=true,
    verification_status='approved', verified_at=now(), uni_email_verification_token=null,
    uni_code_fail_count=0, uni_code_fail_for=null where id=v_uid;
  begin perform public.reward_pending_referral(v_uid); exception when others then null; end;
  begin perform public.grant_welcome_bonus(v_uid); exception when others then null; end;
  return jsonb_build_object('ok',true);
end; $function$;

-- 6) Storage: Bescheinigungen und Verifizierungs-Dokumente nur fuer Besitzer und Admin.
drop policy if exists "Admin can view enrollment certificates" on storage.objects;
drop policy if exists "Users can view verification docs" on storage.objects;
drop policy if exists "Anyone authenticated can read verification docs" on storage.objects;
drop policy if exists "Anyone authenticated can delete verification docs" on storage.objects;
drop policy if exists verification_docs_owner_or_admin_read on storage.objects;
create policy verification_docs_owner_or_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'verification-documents' and (owner = auth.uid() or (storage.foldername(name))[1] = auth.uid()::text or public.is_caller_admin()));
drop policy if exists verification_docs_owner_or_admin_delete on storage.objects;
create policy verification_docs_owner_or_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'verification-documents' and (owner = auth.uid() or public.is_caller_admin()));

-- Listing- und Chat-Bilder: Loeschen nur durch Besitzer (Upload/Lesen unveraendert).
drop policy if exists "Owner can delete own listing images" on storage.objects;
drop policy if exists "Owner can delete own chat images" on storage.objects;
drop policy if exists chat_images_owner_delete on storage.objects;
create policy chat_images_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-images' and (owner = auth.uid() or public.is_caller_admin()));

-- 7) Coupons anlegen nur Admin oder Partner mit Coupon-Recht (Admin-Seite + Partner unveraendert).
drop policy if exists "Admin can manage coupons" on public.coupons;  -- war FOR ALL mit auth.uid()=user_id; Lesen/Aendern/Loeschen eigener Coupons decken eigene Policies ab
alter policy "Authenticated users can create coupons" on public.coupons
  with check (auth.uid() = user_id and (public.is_caller_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and partner_can_coupons = true)));

-- 8) Einloesungen nur noch ueber die RPCs (redeem_coupon / self_redeem / self_redeem_qr).
drop policy if exists "Users can create own redemption" on public.coupon_redemptions;

-- 9) Bewertungen nur im eigenen Namen.
drop policy if exists "Eingeloggte Nutzer können Bewertungen erstellen." on public.reviews;

-- 10) Benachrichtigungen: Fremde duerfen keine Admin-Nachrichten und keine externen Links anlegen.
alter policy "Authenticated can create notifications" on public.notifications
  with check (user_id = auth.uid() or public.is_caller_admin()
    or (coalesce(type,'') <> 'admin_message' and (link is null or link !~* '^([a-z][a-z0-9+.-]*:|//)')));
alter policy allow_insert_notifications on public.notifications
  with check (user_id = auth.uid() or public.is_caller_admin()
    or (coalesce(type,'') <> 'admin_message' and (link is null or link !~* '^([a-z][a-z0-9+.-]*:|//)')));
