-- 20260830000011_raffles_store.sql
-- Coin-Ausgabe-Loop: Verlosungen (raffles) + gekaufte Lose (raffle_tickets).
-- Coins werden ausgegeben via bestehendem public.add_coins(user_id, delta, reason, ref)
-- mit NEGATIVEM delta und reason 'raffle_ticket'. Additiv, kein DROP.

-- ============================================================
-- 1. Verlosungen
-- ============================================================
create table if not exists public.raffles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  prize text,
  ticket_cost int not null default 100 check (ticket_cost > 0),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_raffles_active on public.raffles (active, ends_at);

alter table public.raffles enable row level security;
drop policy if exists "raffles_select_active" on public.raffles;
create policy "raffles_select_active" on public.raffles
  for select to authenticated
  using (active = true and (ends_at is null or ends_at > now()));
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='is_admin'
  ) then
    drop policy if exists "raffles_admin_write" on public.raffles;
    create policy "raffles_admin_write" on public.raffles
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
  end if;
end $$;

-- ============================================================
-- 2. Gekaufte Lose
-- ============================================================
create table if not exists public.raffle_tickets (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_raffle_tickets_raffle on public.raffle_tickets (raffle_id);
create index if not exists idx_raffle_tickets_user on public.raffle_tickets (user_id, raffle_id);

alter table public.raffle_tickets enable row level security;
drop policy if exists "raffle_tickets_select_own" on public.raffle_tickets;
create policy "raffle_tickets_select_own" on public.raffle_tickets
  for select to authenticated using (user_id = auth.uid());

-- ============================================================
-- 3. RPC: aktive Verlosungen + eigene Lose-Anzahl (fuer Store-Seite)
-- ============================================================
create or replace function public.list_active_raffles()
returns table (
  id uuid,
  title text,
  description text,
  prize text,
  ticket_cost int,
  ends_at timestamptz,
  active boolean,
  my_tickets bigint
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.title, r.description, r.prize, r.ticket_cost, r.ends_at, r.active,
         coalesce((select count(*) from public.raffle_tickets t
                   where t.raffle_id = r.id and t.user_id = auth.uid()), 0) as my_tickets
  from public.raffles r
  where r.active = true and (r.ends_at is null or r.ends_at > now())
  order by r.ends_at asc nulls last, r.created_at desc;
$$;
grant execute on function public.list_active_raffles() to authenticated;

-- ============================================================
-- 4. RPC: Los kaufen (atomar, zieht Coins via add_coins mit negativem delta)
-- ============================================================
create or replace function public.buy_raffle_ticket(p_raffle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_raffle public.raffles%rowtype;
  v_coins int;
  v_ticket_id uuid;
  v_my_tickets bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_raffle_id::text || ':' || v_uid::text, 0));

  select * into v_raffle from public.raffles where id = p_raffle_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'RAFFLE_NOT_FOUND');
  end if;
  if v_raffle.active = false then
    return jsonb_build_object('ok', false, 'error', 'RAFFLE_INACTIVE');
  end if;
  if v_raffle.ends_at is not null and v_raffle.ends_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'RAFFLE_ENDED');
  end if;

  select coins into v_coins from public.profiles where id = v_uid;
  if coalesce(v_coins, 0) < v_raffle.ticket_cost then
    return jsonb_build_object('ok', false, 'error', 'NOT_ENOUGH_COINS',
      'needed', v_raffle.ticket_cost, 'coins', coalesce(v_coins, 0));
  end if;

  v_coins := public.add_coins(v_uid, -v_raffle.ticket_cost, 'raffle_ticket', p_raffle_id);

  insert into public.raffle_tickets (raffle_id, user_id)
    values (p_raffle_id, v_uid)
    returning id into v_ticket_id;

  select count(*) into v_my_tickets from public.raffle_tickets
    where raffle_id = p_raffle_id and user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'ticket_id', v_ticket_id,
    'raffle_id', p_raffle_id,
    'raffle_title', v_raffle.title,
    'ticket_cost', v_raffle.ticket_cost,
    'coins', v_coins,
    'my_tickets', v_my_tickets
  );
end;
$$;
grant execute on function public.buy_raffle_ticket(uuid) to authenticated;
