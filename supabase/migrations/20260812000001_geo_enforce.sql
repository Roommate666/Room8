-- GPS-Enforcement beim Coupon-Einloesen (12.08.2026)
-- - Coupon mit Koordinaten: Standort ist PFLICHT. Zu weit weg -> Einloesen wird ABGELEHNT (nicht nur 0 Coins).
-- - Progressiver Radius gegen Spam: 1. Einloesung 100 m, jede weitere nur noch 10 m.
-- - Koordinaten werden NUR zur Distanzberechnung genutzt, NICHT gespeichert.

drop function if exists public.self_redeem(uuid, double precision, double precision);
create or replace function public.self_redeem(p_coupon_id uuid, p_lat double precision default null, p_lng double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons%rowtype;
  v_user_id uuid := auth.uid();
  v_redemption_id uuid;
  v_verification_code text;
  v_count_before int := 0;
  v_today_same int;
  v_coins int;
  v_has_geo boolean := false;
  v_geo_ok boolean := null;
  v_dist double precision;
  v_radius double precision;
  c_redeem_reward int := 100;
  v_reward int;
begin
  if v_user_id is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_coupon_id::text || ':' || v_user_id::text, 0));

  select * into v_coupon from public.coupons where id = p_coupon_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'COUPON_NOT_FOUND'); end if;
  if coalesce(v_coupon.status, 'active') <> 'active' or v_coupon.is_active = false then
    return jsonb_build_object('ok', false, 'error', 'COUPON_INACTIVE'); end if;
  if v_coupon.valid_until is not null and v_coupon.valid_until < current_date then
    return jsonb_build_object('ok', false, 'error', 'COUPON_EXPIRED'); end if;
  if v_coupon.max_redemptions is not null
     and coalesce(v_coupon.current_redemptions, 0) >= v_coupon.max_redemptions then
    return jsonb_build_object('ok', false, 'error', 'COUPON_MAX_REACHED'); end if;

  -- Bisherige Einloesungen dieses Nutzers fuer diesen Coupon (fuer Limit + progressiven Radius)
  select count(*) into v_count_before from public.coupon_redemptions
    where coupon_id = p_coupon_id and user_id = v_user_id;
  if v_coupon.usage_limit_per_user is not null and v_count_before >= v_coupon.usage_limit_per_user then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED'); end if;

  select count(*) into v_today_same from public.coupon_redemptions
    where coupon_id = p_coupon_id and user_id = v_user_id and redeemed_at::date = current_date;
  if v_today_same >= 1 then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED_TODAY'); end if;

  -- Progressiver Radius: 1. Einloesung grosszuegig (100 m), danach eng (10 m) -> Anti-Spam
  v_radius := case when v_count_before = 0 then 100 else 10 end;

  -- HARTES Standort-Gate (nur wenn Coupon Koordinaten hat)
  v_has_geo := (v_coupon.lat is not null and v_coupon.lng is not null);
  if v_has_geo then
    if p_lat is null or p_lng is null then
      return jsonb_build_object('ok', false, 'error', 'GEO_REQUIRED', 'radius', v_radius);
    end if;
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_coupon.lat)/2), 2) +
      cos(radians(v_coupon.lat)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - v_coupon.lng)/2), 2)));
    if v_dist > v_radius then
      return jsonb_build_object('ok', false, 'error', 'TOO_FAR',
        'distance_m', round(v_dist)::int, 'radius', v_radius::int);
    end if;
    v_geo_ok := true;
  else
    v_geo_ok := null;  -- Coupon ohne Koordinaten -> kein Geo-Zwang (wie bisher)
  end if;

  v_reward := c_redeem_reward;
  v_verification_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.coupon_redemptions (coupon_id, user_id, verification_code, redeemed_by_partner_id, redeemed_at, geo_verified)
    values (p_coupon_id, v_user_id, v_verification_code, null, now(), v_geo_ok)
    returning id into v_redemption_id;
  update public.coupons set current_redemptions = coalesce(current_redemptions,0)+1, updated_at = now()
    where id = p_coupon_id;

  v_coins := public.add_coins(v_user_id, v_reward, 'redeem', v_redemption_id);

  return jsonb_build_object('ok', true, 'redemption_id', v_redemption_id,
    'verification_code', v_verification_code, 'coupon_title', v_coupon.title,
    'business_name', v_coupon.business_name, 'discount_value', v_coupon.discount_value,
    'coins', coalesce(v_coins,0), 'coins_earned', v_reward,
    'geo_required', v_has_geo, 'geo_verified', v_geo_ok);
end;
$$;
grant execute on function public.self_redeem(uuid, double precision, double precision) to authenticated;

-- Koordinaten fuer die 5 echten Coupons (geocodet via OpenStreetMap, Ulm/Neu-Ulm)
UPDATE public.coupons SET lat=48.395762, lng=10.028799 WHERE id='28d3fda3-d4bf-493f-b819-3fd8f8bbfa6f'; -- Face Off Arena
UPDATE public.coupons SET lat=48.396810, lng=9.985328  WHERE id='300e13da-a854-4da6-b7f6-9e133078b43f'; -- Damaskus Mond
UPDATE public.coupons SET lat=48.375062, lng=10.006297 WHERE id='92786a95-c495-47cf-be26-bfb285c10261'; -- Super Smash
UPDATE public.coupons SET lat=48.394463, lng=9.967346  WHERE id='0f99d2cc-13a7-487d-88dc-01ac6ec8293d'; -- Delfo
UPDATE public.coupons SET lat=48.400700, lng=9.972885  WHERE id='d399fab9-78bc-4da8-bd78-c250f2048649'; -- Fleischgut Celik
