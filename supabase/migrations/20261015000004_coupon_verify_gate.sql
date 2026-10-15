-- Audit P3 (15.10.): serverseitiges Verifizierungs-Gate in allen Coupon-Einloese-RPCs
-- (clientseitiges verifyGate allein reicht nicht; Unverifizierte duerfen nicht einloesen).
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
  c_redeem_reward int := 100;
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
end $function$;

CREATE OR REPLACE FUNCTION public.self_redeem(p_coupon_id uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
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
  v_has_geo boolean := false;
  v_geo_ok boolean := null;
  v_dist double precision;
  v_radius double precision;
  c_redeem_reward int := 100;
  v_reward int;
begin
  if v_user_id is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  if not exists (select 1 from public.profiles where id = v_user_id and (is_verified is true or is_student_verified is true)) then return jsonb_build_object('ok', false, 'error', 'NOT_VERIFIED'); end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.redeem_coupon(p_coupon_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_coupon public.coupons%rowtype;
  v_partner_id uuid := auth.uid();
  v_redemption_id uuid;
  v_verification_code text;
  v_count_before int;
begin
  if v_partner_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id and (is_verified is true or is_student_verified is true)) then
    return jsonb_build_object('ok', false, 'error', 'NOT_VERIFIED');
  end if;

  -- Advisory Lock: pro Coupon+User serialisieren (race-Schutz)
  perform pg_advisory_xact_lock(
    hashtextextended(p_coupon_id::text || ':' || p_user_id::text, 0)
  );

  select * into v_coupon
  from public.coupons
  where id = p_coupon_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'COUPON_NOT_FOUND');
  end if;

  -- Partner-Auth: nur Owner oder zugewiesener Partner darf einloesen
  if v_coupon.user_id <> v_partner_id
     and coalesce(v_coupon.partner_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_partner_id then
    return jsonb_build_object('ok', false, 'error', 'NOT_PARTNER');
  end if;

  -- Aktiv-Pruefung: status ist die Wahrheit, is_active = expliziter Kill-Switch
  if coalesce(v_coupon.status, 'active') <> 'active' or v_coupon.is_active = false then
    return jsonb_build_object('ok', false, 'error', 'COUPON_INACTIVE');
  end if;

  if v_coupon.valid_until is not null and v_coupon.valid_until < current_date then
    return jsonb_build_object('ok', false, 'error', 'COUPON_EXPIRED');
  end if;

  if v_coupon.max_redemptions is not null
     and coalesce(v_coupon.current_redemptions, 0) >= v_coupon.max_redemptions then
    return jsonb_build_object('ok', false, 'error', 'COUPON_MAX_REACHED');
  end if;

  -- Per-User-Limit pruefen (Trigger faengt es auch ab, aber wir wollen sauberere Fehlermeldung)
  if v_coupon.usage_limit_per_user is not null then
    select count(*) into v_count_before
    from public.coupon_redemptions
    where coupon_id = p_coupon_id and user_id = p_user_id;

    if v_count_before >= v_coupon.usage_limit_per_user then
      return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED');
    end if;
  end if;

  -- Verification-Code generieren (kurzer Code fuer Partner-Anzeige + Audit)
  v_verification_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  -- Redemption einfuegen
  insert into public.coupon_redemptions (
    coupon_id, user_id, verification_code, redeemed_by_partner_id, redeemed_at
  ) values (
    p_coupon_id, p_user_id, v_verification_code, v_partner_id, now()
  )
  returning id into v_redemption_id;

  -- Counter hochzaehlen
  update public.coupons
  set current_redemptions = coalesce(current_redemptions, 0) + 1,
      updated_at = now()
  where id = p_coupon_id;

  return jsonb_build_object(
    'ok', true,
    'redemption_id', v_redemption_id,
    'verification_code', v_verification_code,
    'coupon_title', v_coupon.title,
    'business_name', v_coupon.business_name,
    'discount_value', v_coupon.discount_value
  );
end;
$function$;
