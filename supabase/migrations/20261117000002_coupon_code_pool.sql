-- 17.11.2026: Einmal-Code-Pool fuer Online-Deals (erster Partner: Padel Up, 500 Shopify-Einmalcodes).
-- Jeder verifizierte Student bekommt beim Einloesen genau einen eigenen Code aus dem Pool.
-- Der shop-webhook ordnet eine bezahlte Bestellung ueber diesen Code direkt dem Studenten zu (G-Coins).
begin;

create table if not exists public.coupon_code_pool (
  id            bigint generated always as identity primary key,
  coupon_id     uuid not null references public.coupons(id) on delete cascade,
  code          text not null,
  user_id       uuid references auth.users(id) on delete set null,
  redemption_id uuid,
  assigned_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (coupon_id, code)
);
create index if not exists coupon_code_pool_free_idx on public.coupon_code_pool (coupon_id, id) where user_id is null;
create index if not exists coupon_code_pool_user_idx on public.coupon_code_pool (user_id, coupon_id);
create index if not exists coupon_code_pool_code_idx on public.coupon_code_pool (upper(code));
-- Nur service_role / security-definer-Funktionen: keine Policies fuer anon/authenticated.
alter table public.coupon_code_pool enable row level security;
revoke all on public.coupon_code_pool from anon, authenticated;

-- Shop-Webhook: Shops mit Code-Pool ordnen Bestellungen ueber den Einmal-Code zu.
alter table public.partner_shops add column if not exists uses_code_pool boolean not null default false;

CREATE OR REPLACE FUNCTION public.self_redeem_qr(p_coupon_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  c_redeem_reward int := 250;
  v_reward int;
  v_has_pool boolean := false;
  v_pool_id bigint;
  v_pool_code text;
begin
  if v_user_id is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  if not exists (select 1 from public.profiles where id = v_user_id and (is_verified is true or is_student_verified is true)) then return jsonb_build_object('ok', false, 'error', 'NOT_VERIFIED'); end if;
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

  -- Einmal-Code-Pool: freien Code reservieren (vor dem Buchen, damit "leer" sauber abbricht).
  v_has_pool := exists (select 1 from public.coupon_code_pool where coupon_id = p_coupon_id);
  -- Alte App-Builds (vor 2.6.5) kennen keine Online-Deals und schicken einen gescannten QR mit:
  -- dann NICHT einloesen, sonst waere der Code verbraucht, ohne dass der Student ihn sieht.
  if v_coupon.venue_type = 'online' and v_tok <> '' then
    return jsonb_build_object('ok', false, 'error', 'ONLINE_ONLY'); end if;
  if v_has_pool then
    select id, code into v_pool_id, v_pool_code from public.coupon_code_pool
      where coupon_id = p_coupon_id and user_id is null
      order by id limit 1 for update skip locked;
    if v_pool_id is null then return jsonb_build_object('ok', false, 'error', 'CODES_EXHAUSTED'); end if;
  end if;

  -- Coins nur bei bestaetigtem Besuch (QR gescannt). Coupons ohne Laden-QR (z.B. Online-/Digital-Deals)
  -- bleiben einloesbar, geben aber keine Coins: Online-Kaeufe laufen ueber shop-webhook.
  v_reward := case when v_qr_ok is true then c_redeem_reward else 0 end;
  v_verification_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.coupon_redemptions (coupon_id, user_id, verification_code, redeemed_by_partner_id, redeemed_at, geo_verified)
    values (p_coupon_id, v_user_id, v_verification_code, null, now(), v_qr_ok)
    returning id into v_redemption_id;
  update public.coupons set current_redemptions=coalesce(current_redemptions,0)+1, updated_at=now() where id=p_coupon_id;
  if v_pool_id is not null then
    update public.coupon_code_pool set user_id = v_user_id, redemption_id = v_redemption_id, assigned_at = now() where id = v_pool_id;
  end if;
  if v_reward > 0 then
    v_coins := public.add_coins(v_user_id, v_reward, 'redeem', v_redemption_id);
  end if;

  return jsonb_build_object('ok', true, 'redemption_id', v_redemption_id, 'verification_code', v_verification_code,
    'coupon_title', v_coupon.title, 'business_name', v_coupon.business_name, 'discount_value', v_coupon.discount_value,
    'discount_code', coalesce(v_pool_code, v_coupon.discount_code),
    'coins', coalesce(v_coins,0), 'coins_earned', v_reward, 'qr_required', v_needs_qr, 'qr_verified', v_qr_ok);
end $function$;

-- Eigenen Code eines Online-Deals erneut anzeigen (nach dem Einloesen, z.B. App neu geoeffnet).
CREATE OR REPLACE FUNCTION public.my_coupon_code(p_coupon_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select p.code from public.coupon_code_pool p where p.coupon_id = p_coupon_id and p.user_id = auth.uid() order by p.assigned_at desc limit 1),
    (select c.discount_code from public.coupons c
      where c.id = p_coupon_id and c.venue_type = 'online'
        and not exists (select 1 from public.coupon_code_pool p2 where p2.coupon_id = c.id)
        and exists (select 1 from public.coupon_redemptions r where r.coupon_id = c.id and r.user_id = auth.uid()))
  )
$function$;
revoke execute on function public.my_coupon_code(uuid) from public, anon;
grant execute on function public.my_coupon_code(uuid) to authenticated;

commit;
