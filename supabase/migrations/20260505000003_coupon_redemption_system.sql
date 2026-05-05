-- Coupon-Einloese-System
-- usage_limit_per_user + redeem_coupon RPC + Trigger gegen Mehrfach-Einloesung
-- Spec: specs/coupon-redemption.md

-- ============================================
-- 1. coupons.usage_limit_per_user Spalte
-- ============================================
alter table public.coupons
  add column if not exists usage_limit_per_user int default null;

comment on column public.coupons.usage_limit_per_user is
  'NULL = unlimited (User kann beliebig oft einloesen). 1 = nur 1x pro User. 2,3,... entsprechend.';

-- ============================================
-- 2. coupon_redemptions Erweiterungen
-- ============================================
-- Tabelle existiert bereits (id, user_id, coupon_id, verification_code, redeemed_at, created_at)
-- Wir ergaenzen Partner-Tracking + RLS

alter table public.coupon_redemptions
  add column if not exists redeemed_by_partner_id uuid references auth.users(id) on delete set null;

create index if not exists idx_coupon_redemptions_coupon_user
  on public.coupon_redemptions (coupon_id, user_id);

create index if not exists idx_coupon_redemptions_partner
  on public.coupon_redemptions (redeemed_by_partner_id, redeemed_at desc)
  where redeemed_by_partner_id is not null;

-- ============================================
-- 3. Trigger: Per-User-Limit erzwingen
-- ============================================
create or replace function public.enforce_coupon_redemption_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_existing_count int;
begin
  select usage_limit_per_user into v_limit
  from public.coupons where id = NEW.coupon_id;

  if v_limit is null then
    return NEW;
  end if;

  select count(*) into v_existing_count
  from public.coupon_redemptions
  where coupon_id = NEW.coupon_id
    and user_id = NEW.user_id;

  if v_existing_count >= v_limit then
    raise exception 'COUPON_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_coupon_redemption_limit on public.coupon_redemptions;
create trigger trg_enforce_coupon_redemption_limit
  before insert on public.coupon_redemptions
  for each row execute function public.enforce_coupon_redemption_limit();

-- ============================================
-- 4. RPC redeem_coupon (Partner ruft auf, Advisory Lock + Voll-Check)
-- ============================================
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

  if not coalesce(v_coupon.is_active, true) then
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

grant execute on function public.redeem_coupon(uuid, uuid) to authenticated;

-- ============================================
-- 5. RLS auf coupon_redemptions
-- ============================================
alter table public.coupon_redemptions enable row level security;

-- SELECT: User sieht eigene, Partner sieht Redemptions seiner Coupons
drop policy if exists "redemptions_select_own_or_partner" on public.coupon_redemptions;
create policy "redemptions_select_own_or_partner"
  on public.coupon_redemptions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or coupon_id in (
      select id from public.coupons
      where user_id = auth.uid() or partner_user_id = auth.uid()
    )
  );

-- INSERT: nur via redeem_coupon RPC (security definer) — kein direkter INSERT erlaubt
drop policy if exists "redemptions_no_direct_insert" on public.coupon_redemptions;
-- Bewusst KEINE INSERT-Policy: ohne Policy ist INSERT fuer authenticated dicht.
-- security definer RPC bypassed RLS.

-- UPDATE/DELETE: niemand (audit log soll immutable sein)
drop policy if exists "redemptions_no_update" on public.coupon_redemptions;
drop policy if exists "redemptions_no_delete" on public.coupon_redemptions;

-- ============================================
-- 6. Helper-View fuer Partner-Dashboard
-- ============================================
create or replace view public.v_partner_redemptions_today as
select
  cr.coupon_id,
  c.title as coupon_title,
  c.business_name,
  count(*) filter (where cr.redeemed_at::date = current_date) as redeemed_today,
  count(*) as redeemed_total
from public.coupon_redemptions cr
join public.coupons c on c.id = cr.coupon_id
where c.user_id = auth.uid() or c.partner_user_id = auth.uid()
group by cr.coupon_id, c.title, c.business_name;

grant select on public.v_partner_redemptions_today to authenticated;

-- ============================================
-- 7. increment_coupon_redemptions REVERTEN
-- ============================================
-- Der alte RPC zaehlte beim Code-Kopieren hoch (falsch).
-- Wir lassen ihn als no-op stehen (Frontend ruft ihn ggf. noch auf), damit nichts crasht.
-- Alter Return-Type war ggf. anders (z.B. integer) → drop first.
drop function if exists public.increment_coupon_redemptions(uuid);

create function public.increment_coupon_redemptions(p_coupon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Deprecated: Counter wird jetzt nur noch von redeem_coupon hochgezaehlt.
  -- Frontend-Aufrufe bleiben no-op, bis sie entfernt sind.
  return;
end;
$$;

grant execute on function public.increment_coupon_redemptions(uuid) to authenticated;

comment on function public.increment_coupon_redemptions(uuid) is
  'DEPRECATED no-op. Counter wird jetzt von redeem_coupon hochgezaehlt. Frontend-Calls entfernen.';
