-- Referral-System: Freund einladen -> beide bekommen Coins, ABER erst wenn der
-- geworbene Freund als Student VERIFIZIERT ist (verhindert Fake-Account-Farming).
--
-- Ablauf:
--   1) Werber holt seinen Code (ensure_referral_code) -> Link unigoat.de/r/<CODE>
--   2) Neuer User registriert ueber den Link; nach dem ersten Login ruft das Frontend
--      claim_referral(<CODE>) -> setzt profiles.referred_by (nur wenn noch leer, nicht self)
--   3) Sobald der neue User den KI-Immatrikulations-Scan besteht, ruft verify-enrollment
--      (Service Role) reward_pending_referral(user) -> +100 Coins fuer BEIDE, einmalig.

-- ============================================================
-- 1. Schema
-- ============================================================
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists referral_rewarded boolean not null default false;

-- ============================================================
-- 2. Eigenen Referral-Code sichern/erzeugen (idempotent)
-- ============================================================
create or replace function public.ensure_referral_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  select referral_code into v_code from public.profiles where id = v_uid;
  if v_code is not null then return jsonb_build_object('ok', true, 'code', v_code); end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;
  update public.profiles set referral_code = v_code where id = v_uid;
  return jsonb_build_object('ok', true, 'code', v_code);
end;
$$;
grant execute on function public.ensure_referral_code() to authenticated;

-- ============================================================
-- 3. Einladung einloesen (setzt referred_by, KEINE Belohnung hier)
-- ============================================================
create or replace function public.claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_referrer uuid;
  v_existing uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  if p_code is null or length(trim(p_code)) = 0 then return jsonb_build_object('ok', false, 'error', 'NO_CODE'); end if;

  select referred_by into v_existing from public.profiles where id = v_uid;
  if v_existing is not null then return jsonb_build_object('ok', true, 'already', true); end if;

  select id into v_referrer from public.profiles where referral_code = upper(trim(p_code));
  if v_referrer is null then return jsonb_build_object('ok', false, 'error', 'INVALID_CODE'); end if;
  if v_referrer = v_uid then return jsonb_build_object('ok', false, 'error', 'SELF'); end if;

  update public.profiles set referred_by = v_referrer where id = v_uid and referred_by is null;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.claim_referral(text) to authenticated;

-- ============================================================
-- 4. Belohnung ausschuetten (NUR Service Role -> verify-enrollment ruft es nach
--    erfolgreicher Verifizierung; NICHT an authenticated, sonst Selbst-Farming).
-- ============================================================
create or replace function public.reward_pending_referral(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref uuid;
  v_rewarded boolean;
begin
  select referred_by, referral_rewarded into v_ref, v_rewarded
    from public.profiles where id = p_user;
  if v_ref is null or coalesce(v_rewarded, false) = true then
    return jsonb_build_object('ok', true, 'rewarded', false);
  end if;
  perform public.add_coins(v_ref, 100, 'referral', p_user);
  perform public.add_coins(p_user, 100, 'referral_welcome', v_ref);
  update public.profiles set referral_rewarded = true where id = p_user;
  return jsonb_build_object('ok', true, 'rewarded', true);
end;
$$;
revoke all on function public.reward_pending_referral(uuid) from public, authenticated;
grant execute on function public.reward_pending_referral(uuid) to service_role;

-- ============================================================
-- 5. my_profile-View neu bauen (neue Spalten referral_* -> select * einfrieren-Falle)
-- ============================================================
drop view if exists public.my_profile;
create view public.my_profile as
  select * from public.profiles where id = auth.uid();
grant select on public.my_profile to authenticated;
