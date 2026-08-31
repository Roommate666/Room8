-- Promo-/Kampagnen-Codes (Flyer-QR): EIN Code, pro Account 1x einloesbar -> G-Coins-Bonus.
-- Additiv, keine Aenderung an Bestehendem.

create table if not exists public.promo_codes (
  code        text primary key,
  coins       int  not null default 0,
  label       text,
  active      boolean not null default true,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
-- Kein Public-Zugriff: Einloesung laeuft ausschliesslich ueber die SECURITY-DEFINER-RPC.

create table if not exists public.promo_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null references public.promo_codes(code) on delete cascade,
  user_id     uuid not null,
  redeemed_at timestamptz not null default now(),
  unique (code, user_id)     -- HART: pro Account nur 1x
);
alter table public.promo_redemptions enable row level security;

-- Einloesen: gated (eingeloggt, aktiv, nicht abgelaufen, noch nicht eingeloest) -> add_coins
create or replace function public.redeem_promo(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid; v_pc public.promo_codes%rowtype; v_total int;
begin
  v_uid := auth.uid();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_logged_in'); end if;

  select * into v_pc from public.promo_codes where lower(code) = lower(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_code'); end if;
  if not v_pc.active then return jsonb_build_object('ok', false, 'error', 'inactive'); end if;
  if v_pc.expires_at is not null and v_pc.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired'); end if;

  if exists (select 1 from public.promo_redemptions where code = v_pc.code and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'already_redeemed');
  end if;

  insert into public.promo_redemptions (code, user_id) values (v_pc.code, v_uid);
  v_total := public.add_coins(v_uid, v_pc.coins, 'promo:' || v_pc.code, null);
  return jsonb_build_object('ok', true, 'coins', v_pc.coins, 'total', v_total, 'label', v_pc.label);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'already_redeemed');
end;
$$;
revoke all on function public.redeem_promo(text) from public, anon;
grant execute on function public.redeem_promo(text) to authenticated;

-- Ersti-Code (Welcome-Bonus 500 G-Coins)
insert into public.promo_codes (code, coins, label)
values ('ERSTI2026', 500, 'Ersti-Willkommensbonus')
on conflict (code) do update set coins = excluded.coins, label = excluded.label, active = true;
