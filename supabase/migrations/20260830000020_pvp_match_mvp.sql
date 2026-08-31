-- PvP-MVP: Freunde-Duell (gleicher Seed, Live-Sync ueber Supabase Realtime Broadcast).
-- Additiv, kein DROP. MVP-Zuschnitt: KEIN Server-Replay (Score client-berichtet, unter Freunden
-- ok, keine Preise am Duell), KEIN ELO/Quick-Match/Bot. Anti-Cheat-Haertung = spaetere Phase.

create table if not exists public.match (
  id          uuid primary key default gen_random_uuid(),
  seed        bigint not null,
  mode        text not null default 'high' check (mode in ('high','daily')),
  status      text not null default 'lobby'
              check (status in ('lobby','ready','active','finished','aborted')),
  host_id     uuid not null references auth.users(id) on delete cascade,
  guest_id    uuid references auth.users(id) on delete set null,
  join_code   text,
  host_score  integer,
  guest_score integer,
  winner_id   uuid references auth.users(id) on delete set null,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists match_code_idx on public.match (join_code, status);
create index if not exists match_players_idx on public.match (host_id, guest_id);

alter table public.match enable row level security;
-- Nur eigene Matches lesen (Host oder Gast). Writes ausschliesslich ueber SECURITY-DEFINER-RPCs.
drop policy if exists match_select_own on public.match;
create policy match_select_own on public.match for select to authenticated
  using (host_id = auth.uid() or guest_id = auth.uid());

-- ============================================================
-- create_match: Match anlegen, zufaelliger Seed + 6-stelliger Join-Code
-- ============================================================
create or replace function public.create_match(p_mode text default 'high')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_seed bigint; v_code text; v_id uuid; v_try int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  -- offene Alt-Lobbys des Hosts aufraeumen (nur eine aktive Einladung pro Host)
  update public.match set status = 'aborted'
    where host_id = v_uid and status in ('lobby','ready');
  v_seed := (floor(random() * 2000000000))::bigint;
  loop
    v_code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from public.match where join_code = v_code and status in ('lobby','ready','active'));
    v_try := v_try + 1; if v_try > 12 then exit; end if;
  end loop;
  insert into public.match (seed, mode, status, host_id, join_code)
    values (v_seed, coalesce(p_mode,'high'), 'lobby', v_uid, v_code)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'match_id', v_id, 'join_code', v_code, 'seed', v_seed, 'mode', coalesce(p_mode,'high'));
end $$;
grant execute on function public.create_match(text) to authenticated;

-- ============================================================
-- join_match: per Code beitreten -> guest setzen, status ready
-- ============================================================
create or replace function public.join_match(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m public.match%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  select * into v_m from public.match
    where join_code = upper(p_code) and status = 'lobby'
    order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'MATCH_NOT_FOUND'); end if;
  if v_m.host_id = v_uid then return jsonb_build_object('ok', false, 'error', 'CANNOT_JOIN_OWN'); end if;
  update public.match set guest_id = v_uid, status = 'ready' where id = v_m.id;
  return jsonb_build_object('ok', true, 'match_id', v_m.id, 'seed', v_m.seed, 'host_id', v_m.host_id, 'mode', v_m.mode);
end $$;
grant execute on function public.join_match(text) to authenticated;

-- ============================================================
-- finish_match: eigenen End-Score melden; wenn beide da -> Gewinner setzen
-- ============================================================
create or replace function public.finish_match(p_match_id uuid, p_score int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m public.match%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  select * into v_m from public.match where id = p_match_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'MATCH_NOT_FOUND'); end if;
  if v_uid <> v_m.host_id and v_uid <> coalesce(v_m.guest_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    return jsonb_build_object('ok', false, 'error', 'NOT_A_PLAYER');
  end if;
  if v_uid = v_m.host_id then
    update public.match set host_score = greatest(coalesce(host_score,0), p_score), status = case when status='ready' then 'active' else status end where id = p_match_id;
  else
    update public.match set guest_score = greatest(coalesce(guest_score,0), p_score), status = case when status='ready' then 'active' else status end where id = p_match_id;
  end if;
  select * into v_m from public.match where id = p_match_id;
  if v_m.host_score is not null and v_m.guest_score is not null and v_m.status <> 'finished' then
    update public.match set status = 'finished', finished_at = now(),
      winner_id = case when v_m.host_score > v_m.guest_score then v_m.host_id
                       when v_m.guest_score > v_m.host_score then v_m.guest_id
                       else null end
      where id = p_match_id;
    select * into v_m from public.match where id = p_match_id;
  end if;
  return jsonb_build_object('ok', true, 'status', v_m.status,
    'host_score', v_m.host_score, 'guest_score', v_m.guest_score, 'winner_id', v_m.winner_id);
end $$;
grant execute on function public.finish_match(uuid, int) to authenticated;
