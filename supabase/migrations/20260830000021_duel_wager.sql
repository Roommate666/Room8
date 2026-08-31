-- ============================================================================
-- 20260830000021_duel_wager.sql
-- Additiv (kein DROP von Tabellen/Spalten). Erweitert den PvP-Match-MVP
-- (20260830000020_pvp_match_mvp.sql) um:
--   * Wett-Duelle mit Coin-Escrow (Einsatz -> Auszahlung/Rueckerstattung)
--   * Herausforderungs-Flow (challenged_id, status 'invited', accept/decline)
--   * Server-Replay-Felder (host_moves/guest_moves/host_vscore/guest_vscore/paid)
--     die die Edge Function 'submit-duel' fuellt.
--
-- Escrow atomar: pg_advisory_xact_lock pro User (add_coins() hat KEINEN eigenen
-- Lock). Balance-Check IMMER vor add_coins(); add_coins clamped ohnehin auf
-- greatest(0, ...), aber wir verhindern negatives Abbuchen bereits davor.
--
-- Vertrag-Signaturen (verifiziert an bestehenden Migrationen):
--   add_coins(p_user uuid, p_delta int, p_reason text, p_ref uuid) returns int
--     -> 20260612000013_goat_coins.sql (revoked from authenticated, nur via
--        SECURITY DEFINER aufrufbar; genau das tun wir hier)
--   notify_user_push(p_user_id uuid, p_channel text, p_title text, p_body text,
--                    p_data jsonb default '{}', p_ref_id text default null) returns void
--     -> 20260428000015_push_safeguards.sql (AI-LOCK: NICHT veraendern, nur aufrufen)
--   public_profiles(id, username, ...) -> 20260612000005_avatar_config.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Neue Spalten auf public.match (alle additiv, if not exists)
-- ----------------------------------------------------------------------------
alter table public.match add column if not exists wager        int not null default 0;
alter table public.match add column if not exists challenged_id uuid references auth.users(id) on delete set null;
alter table public.match add column if not exists host_moves   jsonb;
alter table public.match add column if not exists guest_moves  jsonb;
alter table public.match add column if not exists host_vscore  int;
alter table public.match add column if not exists guest_vscore int;
alter table public.match add column if not exists paid         boolean not null default false;

-- Sicherheit gegen manipulierte RPC-Argumente: Einsatz nie negativ.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'match_wager_nonneg' and conrelid = 'public.match'::regclass
  ) then
    alter table public.match add constraint match_wager_nonneg check (wager >= 0);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. status-CHECK um 'invited' erweitern.
--    Die Ursprungs-Migration definiert den Check inline (unbenannt) -> Postgres
--    vergibt automatisch 'match_status_check'. Wir droppen genau diesen und
--    legen ihn benannt + erweitert neu an. Reines WIDENING der erlaubten Werte
--    => kann keine bestehende Zeile verletzen (kein Datenverlust, additiv im Sinn).
-- ----------------------------------------------------------------------------
do $$
declare v_conname text;
begin
  -- vorhandenen status-CHECK finden (egal ob auto- oder bereits umbenannt)
  select c.conname into v_conname
  from pg_constraint c
  where c.conrelid = 'public.match'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%'
    and pg_get_constraintdef(c.oid) ilike '%lobby%'
  limit 1;

  if v_conname is not null then
    execute format('alter table public.match drop constraint %I', v_conname);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'match_status_check2' and conrelid = 'public.match'::regclass
  ) then
    alter table public.match
      add constraint match_status_check2
      check (status in ('invited','lobby','ready','active','finished','aborted'));
  end if;
end $$;

-- Index fuer schnelle Challenge-Inbox-Lookups (list_my_challenges)
create index if not exists match_challenged_idx on public.match (challenged_id, status);

-- ----------------------------------------------------------------------------
-- 3. RLS: der herausgeforderte Nutzer muss sein eingehendes (invited) Match
--    lesen koennen (SELECT-Policy der Ursprungs-Migration deckt nur host/guest).
--    Additive zusaetzliche Policy (OR-verknuepft mit bestehender).
-- ----------------------------------------------------------------------------
drop policy if exists match_select_challenged on public.match;
create policy match_select_challenged on public.match for select to authenticated
  using (challenged_id = auth.uid());

-- ============================================================================
-- 4. create_match (ERWEITERT): Wett-Einsatz + optionale Herausforderung
--    - p_wager > 0  -> Coins pruefen (NOT_ENOUGH_COINS) + abbuchen ('duel_stake')
--    - p_challenged_id gesetzt -> status 'invited' (KEIN join_code) + Push
--    - sonst -> status 'lobby' + 6-stelliger join_code
-- ============================================================================
create or replace function public.create_match(
  p_mode         text default 'high',
  p_wager        int  default 0,
  p_challenged_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_seed   bigint;
  v_code   text;
  v_id     uuid;
  v_try    int := 0;
  v_wager  int := greatest(0, coalesce(p_wager, 0));
  v_mode   text := coalesce(p_mode, 'high');
  v_status text;
  v_coins  int;
  v_hostname text;
  v_body   text;
  v_old    record;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  if v_mode not in ('high','daily') then v_mode := 'high'; end if;
  if p_challenged_id is not null and p_challenged_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'CANNOT_CHALLENGE_SELF');
  end if;

  -- offene Alt-Lobbys/Einladungen des Hosts aufraeumen (nur eine aktive Einladung pro Host);
  -- nicht ausgezahlte Einsaetze dabei sauber zurueckerstatten (FOR-Loop statt RETURNING).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 42));
  for v_old in
    select id, wager from public.match
    where host_id = v_uid and status in ('invited','lobby','ready') and paid = false
  loop
    if v_old.wager > 0 then
      perform public.add_coins(v_uid, v_old.wager, 'duel_refund', v_old.id);
    end if;
    update public.match
      set status = 'aborted', finished_at = coalesce(finished_at, now()), paid = (v_old.wager > 0)
      where id = v_old.id;
  end loop;

  -- Einsatz pruefen + abbuchen
  if v_wager > 0 then
    select coins into v_coins from public.profiles where id = v_uid;
    if coalesce(v_coins, 0) < v_wager then
      return jsonb_build_object('ok', false, 'error', 'NOT_ENOUGH_COINS',
        'needed', v_wager, 'coins', coalesce(v_coins, 0));
    end if;
    perform public.add_coins(v_uid, -v_wager, 'duel_stake', null);
  end if;

  v_seed := (floor(random() * 2000000000))::bigint;

  if p_challenged_id is not null then
    v_status := 'invited';
    v_code := null;
  else
    v_status := 'lobby';
    loop
      v_code := upper(substr(md5(random()::text), 1, 6));
      exit when not exists (
        select 1 from public.match where join_code = v_code and status in ('lobby','ready','active')
      );
      v_try := v_try + 1; if v_try > 12 then exit; end if;
    end loop;
  end if;

  insert into public.match (seed, mode, status, host_id, join_code, wager, challenged_id)
    values (v_seed, v_mode, v_status, v_uid, v_code, v_wager, p_challenged_id)
    returning id into v_id;

  -- Push an den Herausgeforderten (best-effort, nie blockierend)
  if p_challenged_id is not null then
    select username into v_hostname from public.public_profiles where id = v_uid;
    v_hostname := coalesce(v_hostname, 'Ein Spieler');
    v_body := v_hostname || ' fordert dich heraus'
              || case when v_wager > 0 then ' — um ' || v_wager || ' G-Coins' else '' end;
    begin
      perform public.notify_user_push(
        p_challenged_id,
        'duel_challenge',
        'Duell-Herausforderung! 🐐',
        v_body,
        jsonb_build_object('url', 'game/duel.html?match=' || v_id::text),
        'duel:' || v_id::text
      );
    exception when others then
      raise warning 'create_match push failed for %: %', p_challenged_id, sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'ok', true, 'match_id', v_id, 'join_code', v_code,
    'seed', v_seed, 'mode', v_mode, 'wager', v_wager, 'status', v_status
  );
end $$;

-- Alte 1-arg-Version wird durch die neue mit Defaults ersetzt; explizit droppen
-- damit keine ueberladene 1-arg-Variante zurueckbleibt (Signatur-Sauberkeit).
drop function if exists public.create_match(text);
grant execute on function public.create_match(text, int, uuid) to authenticated;

-- ============================================================================
-- 5. accept_challenge: der Herausgeforderte nimmt an
--    - caller MUSS challenged_id sein, status 'invited'
--    - wager > 0 -> Coins pruefen + abbuchen (guest stake)
--    - guest_id = caller, status 'ready'
-- ============================================================================
create or replace function public.accept_challenge(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_m     public.match%rowtype;
  v_coins int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;

  -- Escrow atomar pro annehmendem User
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 42));

  select * into v_m from public.match where id = p_match_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'MATCH_NOT_FOUND'); end if;
  if v_m.challenged_id is null or v_m.challenged_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'NOT_CHALLENGED');
  end if;
  if v_m.status <> 'invited' then
    return jsonb_build_object('ok', false, 'error', 'NOT_INVITED');
  end if;

  if v_m.wager > 0 then
    select coins into v_coins from public.profiles where id = v_uid;
    if coalesce(v_coins, 0) < v_m.wager then
      return jsonb_build_object('ok', false, 'error', 'NOT_ENOUGH_COINS',
        'needed', v_m.wager, 'coins', coalesce(v_coins, 0));
    end if;
    perform public.add_coins(v_uid, -v_m.wager, 'duel_stake', v_m.id);
  end if;

  update public.match set guest_id = v_uid, status = 'ready' where id = v_m.id;

  return jsonb_build_object(
    'ok', true, 'match_id', v_m.id, 'seed', v_m.seed, 'mode', v_m.mode,
    'wager', v_m.wager, 'host_id', v_m.host_id
  );
end $$;
grant execute on function public.accept_challenge(uuid) to authenticated;

-- ============================================================================
-- 6. decline_challenge: der Herausgeforderte lehnt ab
--    - caller = challenged_id, status 'invited'
--    - Host-Einsatz zurueck (add_coins(+wager,'duel_refund') an host_id, wenn wager>0)
--    - status 'aborted'
-- ============================================================================
create or replace function public.decline_challenge(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_m   public.match%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;

  select * into v_m from public.match where id = p_match_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'MATCH_NOT_FOUND'); end if;
  if v_m.challenged_id is null or v_m.challenged_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'NOT_CHALLENGED');
  end if;
  if v_m.status <> 'invited' then
    return jsonb_build_object('ok', false, 'error', 'NOT_INVITED');
  end if;

  -- Host-Einsatz zurueckerstatten (atomar pro Host-User), nur wenn noch nicht ausgezahlt
  if v_m.wager > 0 and v_m.paid = false then
    perform pg_advisory_xact_lock(hashtextextended(v_m.host_id::text, 42));
    perform public.add_coins(v_m.host_id, v_m.wager, 'duel_refund', v_m.id);
    update public.match set paid = true where id = v_m.id;
  end if;

  update public.match set status = 'aborted', finished_at = now() where id = v_m.id;

  return jsonb_build_object('ok', true, 'match_id', v_m.id, 'status', 'aborted');
end $$;
grant execute on function public.decline_challenge(uuid) to authenticated;

-- ============================================================================
-- 7. join_match (ERWEITERT): per Code beitreten + guest-Escrow
--    - wager > 0 -> guest Coins pruefen + abbuchen ('duel_stake'), status 'ready'
--    - Rueckgabe zusaetzlich 'wager'
-- ============================================================================
create or replace function public.join_match(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_m     public.match%rowtype;
  v_coins int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 42));

  select * into v_m from public.match
    where join_code = upper(p_code) and status = 'lobby'
    order by created_at desc limit 1
    for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'MATCH_NOT_FOUND'); end if;
  if v_m.host_id = v_uid then return jsonb_build_object('ok', false, 'error', 'CANNOT_JOIN_OWN'); end if;

  if v_m.wager > 0 then
    select coins into v_coins from public.profiles where id = v_uid;
    if coalesce(v_coins, 0) < v_m.wager then
      return jsonb_build_object('ok', false, 'error', 'NOT_ENOUGH_COINS',
        'needed', v_m.wager, 'coins', coalesce(v_coins, 0));
    end if;
    perform public.add_coins(v_uid, -v_m.wager, 'duel_stake', v_m.id);
  end if;

  update public.match set guest_id = v_uid, status = 'ready' where id = v_m.id;

  return jsonb_build_object(
    'ok', true, 'match_id', v_m.id, 'seed', v_m.seed,
    'host_id', v_m.host_id, 'mode', v_m.mode, 'wager', v_m.wager
  );
end $$;
grant execute on function public.join_match(text) to authenticated;

-- ============================================================================
-- 8. list_my_challenges: offene eingehende Herausforderungen des Callers
--    (status = 'invited' AND challenged_id = auth.uid())
-- ============================================================================
create or replace function public.list_my_challenges()
returns table (
  match_id      uuid,
  host_id       uuid,
  host_username text,
  wager         int,
  seed          bigint,
  mode          text,
  created_at    timestamptz
)
language sql security definer set search_path = public as $$
  select
    m.id,
    m.host_id,
    coalesce(pp.username, 'Ein Spieler') as host_username,
    m.wager,
    m.seed,
    m.mode,
    m.created_at
  from public.match m
  left join public.public_profiles pp on pp.id = m.host_id
  where m.status = 'invited'
    and m.challenged_id = auth.uid()
  order by m.created_at desc;
$$;
grant execute on function public.list_my_challenges() to authenticated;

-- ============================================================================
-- 9. abort_match: laufendes/wartendes Match abbrechen + beide Einsaetze zurueck
--    (nur wenn paid = false). Fuer Reconnect-Timeout / Verlassen.
--    Caller muss host, guest oder challenged_id sein.
-- ============================================================================
create or replace function public.abort_match(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_m   public.match%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;

  select * into v_m from public.match where id = p_match_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'MATCH_NOT_FOUND'); end if;

  if v_uid <> v_m.host_id
     and v_uid <> coalesce(v_m.guest_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and v_uid <> coalesce(v_m.challenged_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    return jsonb_build_object('ok', false, 'error', 'NOT_A_PLAYER');
  end if;

  -- bereits beendet/ausgezahlt -> nichts tun (idempotent)
  if v_m.status in ('finished','aborted') then
    return jsonb_build_object('ok', true, 'status', v_m.status, 'already', true);
  end if;

  -- beide Einsaetze zurueckerstatten, solange noch nicht ausgezahlt (paid = false)
  if v_m.wager > 0 and v_m.paid = false then
    perform pg_advisory_xact_lock(hashtextextended(v_m.host_id::text, 42));
    perform public.add_coins(v_m.host_id, v_m.wager, 'duel_refund', v_m.id);
    -- Gast hat nur dann eingezahlt, wenn er tatsaechlich beigetreten/angenommen hat
    -- (guest_id gesetzt + status war ueber 'invited' hinaus). 'invited' = nur Host-Stake.
    if v_m.guest_id is not null and v_m.status in ('ready','active') then
      perform pg_advisory_xact_lock(hashtextextended(v_m.guest_id::text, 42));
      perform public.add_coins(v_m.guest_id, v_m.wager, 'duel_refund', v_m.id);
    end if;
    update public.match set paid = true where id = v_m.id;
  end if;

  update public.match set status = 'aborted', finished_at = now() where id = v_m.id;

  return jsonb_build_object('ok', true, 'match_id', v_m.id, 'status', 'aborted');
end $$;
grant execute on function public.abort_match(uuid) to authenticated;