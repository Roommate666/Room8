-- Coupon = Kern der App -> soll mit Abstand am meisten G-Coins geben.
-- Belohnung pro Einloesung 20 -> 100. (1x/Coupon/Tag-Limit bleibt = Anti-Farm.)
create or replace function public.self_redeem(p_coupon_id uuid)
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
  c_redeem_reward int := 100;   -- G-Coins pro Einloesung (Kern-Aktion)
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

  -- Anti-Missbrauch: dieser Coupon nur 1x pro Tag
  select count(*) into v_today_same from public.coupon_redemptions
    where coupon_id = p_coupon_id and user_id = v_user_id and redeemed_at::date = current_date;
  if v_today_same >= 1 then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED_TODAY'); end if;

  v_verification_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.coupon_redemptions (coupon_id, user_id, verification_code, redeemed_by_partner_id, redeemed_at)
    values (p_coupon_id, v_user_id, v_verification_code, null, now())
    returning id into v_redemption_id;
  update public.coupons set current_redemptions = coalesce(current_redemptions,0)+1, updated_at = now()
    where id = p_coupon_id;

  v_coins := public.add_coins(v_user_id, c_redeem_reward, 'redeem', v_redemption_id);

  return jsonb_build_object('ok', true, 'redemption_id', v_redemption_id,
    'verification_code', v_verification_code, 'coupon_title', v_coupon.title,
    'business_name', v_coupon.business_name, 'discount_value', v_coupon.discount_value,
    'coins', v_coins, 'coins_earned', c_redeem_reward);
end;
$$;
grant execute on function public.self_redeem(uuid) to authenticated;
