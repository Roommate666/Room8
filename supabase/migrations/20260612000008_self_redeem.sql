-- Self-Redeem: Student loest seinen Coupon SELBST ein (kein Partner-Scan noetig).
-- Spec: specs/coupon-redemption.md (Self-Redeem-Erweiterung)
--
-- Hintergrund: Das urspruengliche Modell (redeem_coupon) verlangt, dass ein Partner
-- den QR des Users scannt. Fuer den UniGoat-Launch loest der Student selbst ein und
-- zeigt der Kasse den Erfolgs-Screen (Vertrauens-/Honor-Modell wie Too-Good-To-Go).
--
-- self_redeem(p_coupon_id) laeuft komplett ueber auth.uid() (= der Student):
--   - KEIN Partner-Check (jeder eingeloggte User darf einen aktiven Coupon einloesen)
--   - gleiche Schutzwaelle wie redeem_coupon: Advisory-Lock, status/is_active,
--     valid_until, max_redemptions (global), usage_limit_per_user (pro User)
--   - INSERT via security definer (RLS hat bewusst keine INSERT-Policy)
--   - Limit-Trigger trg_enforce_coupon_redemption_limit bleibt zweiter Wall
--   - redeemed_by_partner_id = NULL kennzeichnet Self-Redeem
--
-- redeem_coupon (AI-LOCK) bleibt unangetastet -> Partner-Scan-Pfad weiter nutzbar.

create or replace function public.self_redeem(
  p_coupon_id uuid
)
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
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  -- Advisory Lock: pro Coupon+User serialisieren (race-Schutz gegen Doppel-Tap)
  perform pg_advisory_xact_lock(
    hashtextextended(p_coupon_id::text || ':' || v_user_id::text, 0)
  );

  select * into v_coupon
  from public.coupons
  where id = p_coupon_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'COUPON_NOT_FOUND');
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

  -- Per-User-Limit pruefen (Trigger faengt es auch ab, aber saubere Fehlermeldung)
  if v_coupon.usage_limit_per_user is not null then
    select count(*) into v_count_before
    from public.coupon_redemptions
    where coupon_id = p_coupon_id and user_id = v_user_id;

    if v_count_before >= v_coupon.usage_limit_per_user then
      return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED');
    end if;
  end if;

  -- Verification-Code generieren (Audit + Anzeige fuer die Kasse)
  v_verification_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  -- Redemption einfuegen (Self-Redeem -> redeemed_by_partner_id bleibt NULL)
  insert into public.coupon_redemptions (
    coupon_id, user_id, verification_code, redeemed_by_partner_id, redeemed_at
  ) values (
    p_coupon_id, v_user_id, v_verification_code, null, now()
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

grant execute on function public.self_redeem(uuid) to authenticated;

comment on function public.self_redeem(uuid) is
  'Self-Redeem: eingeloggter Student loest eigenen Coupon ein (kein Partner). Gleiche Schutzwaelle wie redeem_coupon.';
