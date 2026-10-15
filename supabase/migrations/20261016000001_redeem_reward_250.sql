-- Einloese-Reward 100 -> 250 G-Coins (16.10.): Coupon-Einloesen attraktiver als Spiel-Grind machen.
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
end $function$

