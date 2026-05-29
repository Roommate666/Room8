-- Coupon-Aktiv-Status: status als Single Source of Truth in redeem_coupon.
--
-- Drift (per Analyse 29.05.): redeem_coupon pruefte coalesce(is_active, true),
-- aber NIRGENDS wird is_active gesetzt -- coupon-create.html und der Admin-Approve
-- schreiben nur status ('active'/'inactive'), und coupons.html filtert auf
-- status='active'. Folge: ein auf status='inactive' gesetzter Coupon blieb
-- einloesbar (is_active war weiter true/null). Coupons liessen sich also nicht
-- zuverlaessig deaktivieren.
--
-- Fix: redeem_coupon blockt jetzt wenn status <> 'active' ODER is_active = false.
-- Damit ist status die primaere Wahrheit (deaktivieren via status='inactive' wirkt
-- sofort ueberall), is_active bleibt als expliziter Kill-Switch erhalten
-- (Rueckwaerts-Kompatibilitaet fuer evtl. bestehende is_active=false Coupons).
-- Nur die Aktiv-Pruefung geaendert; restliche Logik (Locks, Limits, Counter) identisch.

create or replace function public.redeem_coupon(
  p_coupon_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;
