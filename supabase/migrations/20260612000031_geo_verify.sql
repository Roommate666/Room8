-- GPS-Verifizierung beim Einloesen (privacy-by-design):
-- - Koordinaten werden NUR zur Distanzberechnung benutzt, NICHT gespeichert.
-- - Gespeichert wird ausschliesslich das Ergebnis (coupon_redemptions.geo_verified = true/false/null).
-- - Nur wenn der Coupon Koordinaten hat, ist GPS Pflicht fuer die Punkte. Sonst wie bisher.

alter table public.coupons add column if not exists lat double precision;
alter table public.coupons add column if not exists lng double precision;
alter table public.coupon_redemptions add column if not exists geo_verified boolean;

-- self_redeem NEU mit optionalem Standort. Alte 1-arg-Version droppen (sonst Overload-Ambiguitaet).
drop function if exists public.self_redeem(uuid);
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
  v_count_before int;
  v_today_same int;
  v_coins int;
  v_has_geo boolean := false;
  v_geo_ok boolean := null;
  v_dist double precision;
  v_radius double precision := 250;   -- Meter Toleranz (GPS-Drift)
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

  if v_coupon.usage_limit_per_user is not null then
    select count(*) into v_count_before from public.coupon_redemptions
      where coupon_id = p_coupon_id and user_id = v_user_id;
    if v_count_before >= v_coupon.usage_limit_per_user then
      return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED'); end if;
  end if;

  select count(*) into v_today_same from public.coupon_redemptions
    where coupon_id = p_coupon_id and user_id = v_user_id and redeemed_at::date = current_date;
  if v_today_same >= 1 then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED_TODAY'); end if;

  -- Standort-Check (nur wenn Coupon Koordinaten hat). Koordinaten werden NICHT gespeichert.
  v_has_geo := (v_coupon.lat is not null and v_coupon.lng is not null);
  if v_has_geo then
    if p_lat is not null and p_lng is not null then
      v_dist := 2 * 6371000 * asin(sqrt(
        power(sin(radians(p_lat - v_coupon.lat)/2), 2) +
        cos(radians(v_coupon.lat)) * cos(radians(p_lat)) *
        power(sin(radians(p_lng - v_coupon.lng)/2), 2)));
      v_geo_ok := (v_dist <= v_radius);
    else
      v_geo_ok := false;   -- Coupon verlangt Standort, aber keiner geliefert
    end if;
    v_reward := case when v_geo_ok then c_redeem_reward else 0 end;
  else
    v_geo_ok := null;      -- kein Geo-Coupon -> wie bisher
    v_reward := c_redeem_reward;
  end if;

  v_verification_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.coupon_redemptions (coupon_id, user_id, verification_code, redeemed_by_partner_id, redeemed_at, geo_verified)
    values (p_coupon_id, v_user_id, v_verification_code, null, now(), v_geo_ok)
    returning id into v_redemption_id;
  update public.coupons set current_redemptions = coalesce(current_redemptions,0)+1, updated_at = now()
    where id = p_coupon_id;

  if v_reward > 0 then
    v_coins := public.add_coins(v_user_id, v_reward, 'redeem', v_redemption_id);
  else
    select coins into v_coins from public.profiles where id = v_user_id;
  end if;

  return jsonb_build_object('ok', true, 'redemption_id', v_redemption_id,
    'verification_code', v_verification_code, 'coupon_title', v_coupon.title,
    'business_name', v_coupon.business_name, 'discount_value', v_coupon.discount_value,
    'coins', coalesce(v_coins,0), 'coins_earned', v_reward,
    'geo_required', v_has_geo, 'geo_verified', v_geo_ok);
end;
$$;
grant execute on function public.self_redeem(uuid, double precision, double precision) to authenticated;
