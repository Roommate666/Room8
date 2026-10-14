-- ============================================================================
-- 20260907000001_qr_redeem.sql
-- QR-Einloesung statt GPS: Presence-Proof per QR-Scan vor Ort (GPS ist fakebar).
-- Ein statischer QR-Token PRO LADEN (= coupons.partner_user_id). Der Student scannt
-- beim Einloesen den QR am Tresen; self_redeem_qr prueft den Token. Alle bisherigen
-- Limits (usage_limit_per_user, 1x/Tag, max_redemptions) bleiben = Hauptschutz gegen
-- Foto-Weitergabe. Die alte GPS-self_redeem bleibt bestehen (ungenutzt), kein Bruch.
-- ============================================================================

-- 1) store_qr: ein Token pro Laden
create table if not exists public.store_qr (
  partner_user_id uuid primary key references auth.users(id) on delete cascade,
  token           text not null unique,
  business_name   text,
  created_at      timestamptz not null default now()
);
alter table public.store_qr enable row level security;
-- KEINE Policy fuer authenticated/anon: Token nie direkt lesbar (nur via SECURITY-DEFINER-RPC
-- self_redeem_qr, das nur ok/error zurueckgibt, nie den Token). QR-Generierung laeuft ueber
-- service_role / Admin.

-- 2) ensure_store_qr: Token holen/erzeugen (fuer QR-Generierung + Partner-Onboarding).
--    Nur Admin/service (kein grant an authenticated) -> kein Fremdzugriff.
create or replace function public.ensure_store_qr(p_partner uuid, p_business text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_token text;
begin
  if p_partner is null then return jsonb_build_object('ok', false, 'error', 'NO_PARTNER'); end if;
  select token into v_token from public.store_qr where partner_user_id = p_partner;
  if v_token is null then
    v_token := upper(encode(gen_random_bytes(10), 'hex'));  -- 20 Hex-Zeichen, nicht erratbar
    insert into public.store_qr(partner_user_id, token, business_name)
      values (p_partner, v_token, p_business)
      on conflict (partner_user_id) do update set business_name = coalesce(excluded.business_name, store_qr.business_name)
      returning token into v_token;
  end if;
  return jsonb_build_object('ok', true, 'token', v_token, 'partner_user_id', p_partner, 'business_name', p_business);
end $$;

-- 3) Tokens fuer alle bestehenden Laeden (aus aktiven Coupons mit partner_user_id) anlegen
insert into public.store_qr(partner_user_id, token, business_name)
select distinct on (partner_user_id)
       partner_user_id, upper(encode(gen_random_bytes(10),'hex')), business_name
from public.coupons
where partner_user_id is not null
order by partner_user_id, business_name
on conflict (partner_user_id) do nothing;

-- 4) self_redeem_qr: wie self_redeem, aber Token-Gate statt Geo-Gate.
create or replace function public.self_redeem_qr(p_coupon_id uuid, p_token text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_coupon public.coupons%rowtype;
  v_user_id uuid := auth.uid();
  v_redemption_id uuid;
  v_verification_code text;
  v_count_before int := 0;
  v_today_same int;
  v_coins int;
  v_needs_qr boolean := false;
  v_qr_ok boolean := null;
  v_store_token text;
  v_tok text := upper(btrim(coalesce(p_token,'')));
  c_redeem_reward int := 100;
  v_reward int;
begin
  if v_user_id is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  -- Token darf ein optionales UGQR:-Praefix haben -> abschneiden
  if position(':' in v_tok) > 0 then v_tok := split_part(v_tok, ':', 2); end if;

  perform pg_advisory_xact_lock(hashtextextended(p_coupon_id::text || ':' || v_user_id::text, 0));

  select * into v_coupon from public.coupons where id = p_coupon_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'COUPON_NOT_FOUND'); end if;
  if coalesce(v_coupon.status,'active') <> 'active' or v_coupon.is_active = false then
    return jsonb_build_object('ok', false, 'error', 'COUPON_INACTIVE'); end if;
  if v_coupon.valid_until is not null and v_coupon.valid_until < current_date then
    return jsonb_build_object('ok', false, 'error', 'COUPON_EXPIRED'); end if;
  if v_coupon.max_redemptions is not null and coalesce(v_coupon.current_redemptions,0) >= v_coupon.max_redemptions then
    return jsonb_build_object('ok', false, 'error', 'COUPON_MAX_REACHED'); end if;

  select count(*) into v_count_before from public.coupon_redemptions where coupon_id=p_coupon_id and user_id=v_user_id;
  if v_coupon.usage_limit_per_user is not null and v_count_before >= v_coupon.usage_limit_per_user then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED'); end if;
  select count(*) into v_today_same from public.coupon_redemptions
    where coupon_id=p_coupon_id and user_id=v_user_id and redeemed_at::date=current_date;
  if v_today_same >= 1 then return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED_TODAY'); end if;

  -- QR-Gate: hat der Laden einen Token, muss der gescannte passen.
  if v_coupon.partner_user_id is not null then
    select token into v_store_token from public.store_qr where partner_user_id = v_coupon.partner_user_id;
    if v_store_token is not null then
      v_needs_qr := true;
      if v_tok = '' then return jsonb_build_object('ok', false, 'error', 'QR_REQUIRED'); end if;
      if v_tok <> upper(v_store_token) then return jsonb_build_object('ok', false, 'error', 'QR_INVALID'); end if;
      v_qr_ok := true;
    end if;
  end if;

  v_reward := c_redeem_reward;
  v_verification_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.coupon_redemptions (coupon_id, user_id, verification_code, redeemed_by_partner_id, redeemed_at, geo_verified)
    values (p_coupon_id, v_user_id, v_verification_code, null, now(), v_qr_ok)
    returning id into v_redemption_id;
  update public.coupons set current_redemptions=coalesce(current_redemptions,0)+1, updated_at=now() where id=p_coupon_id;
  v_coins := public.add_coins(v_user_id, v_reward, 'redeem', v_redemption_id);

  return jsonb_build_object('ok', true, 'redemption_id', v_redemption_id, 'verification_code', v_verification_code,
    'coupon_title', v_coupon.title, 'business_name', v_coupon.business_name, 'discount_value', v_coupon.discount_value,
    'coins', coalesce(v_coins,0), 'coins_earned', v_reward, 'qr_required', v_needs_qr, 'qr_verified', v_qr_ok);
end $function$;
grant execute on function public.self_redeem_qr(uuid, text) to authenticated;
