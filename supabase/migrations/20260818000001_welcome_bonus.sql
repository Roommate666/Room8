-- Oeffentlicher Willkommensbonus: +50 G-Coins bei Uni-Mail-Verifizierung (einmalig/Account).
-- GETRENNT vom Ersti-500er (der laeuft nur ueber redeem_promo / Code ERSTI2026 vom QR).
-- Verifizierungs-gated (NICHT bei roher Registrierung) -> Fake-Accounts koennen nicht farmen.
-- Idempotent: prueft coin_transactions reason='welcome'.

create or replace function public.grant_welcome_bonus(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  if exists (select 1 from public.coin_transactions where user_id = p_user and reason = 'welcome') then
    return; -- schon vergeben
  end if;
  perform public.add_coins(p_user, 50, 'welcome', null);
  begin
    perform public.notify_user_push(p_user, 'welcome',
      'Willkommen bei UniGoat! 🐐',
      'Du hast +50 G-Coins zum Start bekommen. Spiel, sammel mehr und komm in die Monats-Rangliste!',
      jsonb_build_object('url','/game/'), 'welcome_' || p_user::text);
  exception when others then null; end;
end; $$;
revoke all on function public.grant_welcome_bonus(uuid) from public, authenticated;
grant execute on function public.grant_welcome_bonus(uuid) to service_role;

-- verify_uni_code erweitern: Willkommensbonus ZUSAETZLICH zum Referral ausloesen.
-- (Body identisch zu 20260612000033, nur eine Zeile ergaenzt.)
create or replace function public.verify_uni_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_code text; v_ts timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
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
