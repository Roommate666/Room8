-- ============================================================================
-- 20260830000022_duel_hardening.sql
-- Additiv (kein DROP von Tabellen/Spalten, kein destruktives ALTER). Haertet die
-- PvP-Duelle (20260830000020_pvp_match_mvp.sql + 20260830000021_duel_wager.sql):
--   * public.pvp_rating          -> ELO + Bilanz (wins/losses/ties) pro Spieler
--   * public.pvp_leaderboard     -> View (elo + username) fuer Rangliste
--   * ELO-Trigger auf public.match (AFTER UPDATE, status -> 'finished')
--   * RPC spend_match_gadget()   -> Gadgets kosten Coins (fog=15, rush=20, Cap)
--   * RPC forfeit_match()        -> Sieg beanspruchen wenn Gegner weg (>25s)
--
-- Verifizierte Vertrag-Signaturen (per read-only SELECT gegen die Live-DB):
--   add_coins(p_user uuid, p_delta int, p_reason text, p_ref uuid) returns int
--     -> update profiles set coins = greatest(0, coins + p_delta) ...
--        insert into coin_transactions (user_id, delta, reason, ref_id) ...
--     WICHTIG: add_coins clamped auf greatest(0,...) und wirft KEINEN Fehler bei
--     zu wenig Coins. Daher IMMER Balance-Check VOR jedem Abbuchen (sonst haengt
--     der coin_transactions-Log-Delta nicht am realen Kontostand).
--   coin_transactions(user_id uuid, delta int, reason text, ref_id uuid, created_at)
--     -> Spalte heisst ref_id (NICHT ref). Gadget-Cap zaehlt hierueber:
--        where user_id = caller and reason = 'duel_gadget' and ref_id = match_id.
--   public.match(..., host_vscore, guest_vscore, winner_id, wager, paid, ...)
--   public.public_profiles(id, username, ...) -> Rangliste-Join.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. pvp_rating: ELO + Bilanz pro Spieler
-- ----------------------------------------------------------------------------
create table if not exists public.pvp_rating (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  elo        int not null default 1000,
  wins       int not null default 0,
  losses     int not null default 0,
  ties       int not null default 0,
  updated_at timestamptz default now()
);

alter table public.pvp_rating enable row level security;

-- Lesen fuer alle Eingeloggten (Bilanz + ELO). KEINE Client-Writes:
-- Schreiben passiert ausschliesslich ueber den SECURITY-DEFINER-Trigger.
drop policy if exists pvp_rating_select on public.pvp_rating;
create policy pvp_rating_select on public.pvp_rating for select to authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- 2. pvp_leaderboard: View fuer die Rangliste (elo + username)
-- ----------------------------------------------------------------------------
create or replace view public.pvp_leaderboard as
  select
    r.user_id,
    r.elo,
    r.wins,
    r.losses,
    pp.username
  from public.pvp_rating r
  join public.public_profiles pp on pp.id = r.user_id;

grant select on public.pvp_leaderboard to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. ELO-Trigger auf public.match (AFTER UPDATE, status -> 'finished')
--    Standard-ELO K=32. Erwartete Score E_a = 1/(1+10^((eloB-eloA)/400)).
--    winner_id null   -> Unentschieden (beide real=0.5, beide ties++)
--    winner_id gesetzt-> Sieger real=1 (wins++), Verlierer real=0 (losses++)
--    Nur echte Duelle (guest_id not null). Idempotent gegen Doppel-UPDATE via
--    OLD.status-Guard. SECURITY DEFINER (schreibt pvp_rating trotz RLS-No-Write).
-- ----------------------------------------------------------------------------
create or replace function public.apply_pvp_elo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_a       uuid := new.host_id;   -- Spieler A = Host
  v_b       uuid := new.guest_id;  -- Spieler B = Gast
  v_elo_a   int;
  v_elo_b   int;
  v_exp_a   numeric;               -- erwartete Score Host
  v_exp_b   numeric;               -- erwartete Score Gast
  v_real_a  numeric;               -- reale Score Host (1/0/0.5)
  v_real_b  numeric;               -- reale Score Gast
  v_new_a   int;
  v_new_b   int;
  v_win_a   boolean;
  v_win_b   boolean;
  v_tie     boolean;
begin
  -- Nur echtes 2-Spieler-Duell werten
  if v_b is null then
    return new;
  end if;

  -- Ausgang bestimmen
  v_tie   := (new.winner_id is null);
  v_win_a := (new.winner_id is not null and new.winner_id = v_a);
  v_win_b := (new.winner_id is not null and new.winner_id = v_b);

  if v_tie then
    v_real_a := 0.5; v_real_b := 0.5;
  elsif v_win_a then
    v_real_a := 1;   v_real_b := 0;
  elsif v_win_b then
    v_real_a := 0;   v_real_b := 1;
  else
    -- winner_id gesetzt, aber weder Host noch Gast -> Datenanomalie, nicht werten
    return new;
  end if;

  -- Beide Spieler sicher anlegen (Default-ELO 1000), damit die Reads greifen.
  insert into public.pvp_rating (user_id) values (v_a)
    on conflict (user_id) do nothing;
  insert into public.pvp_rating (user_id) values (v_b)
    on conflict (user_id) do nothing;

  -- Deterministische Lock-Reihenfolge gegen Deadlocks (kleinere UUID zuerst).
  if v_a < v_b then
    select elo into v_elo_a from public.pvp_rating where user_id = v_a for update;
    select elo into v_elo_b from public.pvp_rating where user_id = v_b for update;
  else
    select elo into v_elo_b from public.pvp_rating where user_id = v_b for update;
    select elo into v_elo_a from public.pvp_rating where user_id = v_a for update;
  end if;

  -- Erwartete Scores
  v_exp_a := 1.0 / (1.0 + power(10.0, (v_elo_b - v_elo_a) / 400.0));
  v_exp_b := 1.0 / (1.0 + power(10.0, (v_elo_a - v_elo_b) / 400.0));

  -- Neue ELO (K=32), auf ganze Zahl gerundet, nie negativ.
  v_new_a := greatest(0, round(v_elo_a + 32.0 * (v_real_a - v_exp_a))::int);
  v_new_b := greatest(0, round(v_elo_b + 32.0 * (v_real_b - v_exp_b))::int);

  -- Host aktualisieren
  update public.pvp_rating set
    elo    = v_new_a,
    wins   = wins   + (case when v_win_a then 1 else 0 end),
    losses = losses + (case when (not v_tie and not v_win_a) then 1 else 0 end),
    ties   = ties   + (case when v_tie then 1 else 0 end),
    updated_at = now()
  where user_id = v_a;

  -- Gast aktualisieren
  update public.pvp_rating set
    elo    = v_new_b,
    wins   = wins   + (case when v_win_b then 1 else 0 end),
    losses = losses + (case when (not v_tie and not v_win_b) then 1 else 0 end),
    ties   = ties   + (case when v_tie then 1 else 0 end),
    updated_at = now()
  where user_id = v_b;

  return new;
exception when others then
  -- ELO ist Nebeneffekt: darf ein 'finished'-UPDATE nie zurueckrollen.
  raise warning 'apply_pvp_elo failed for match %: %', new.id, sqlerrm;
  return new;
end $$;

-- Trigger: nur beim Uebergang -> 'finished' (OLD.status-Guard = idempotent).
drop trigger if exists trg_apply_pvp_elo on public.match;
create trigger trg_apply_pvp_elo
  after update on public.match
  for each row
  when (
    new.status = 'finished'
    and old.status is distinct from 'finished'
    and new.guest_id is not null
  )
  execute function public.apply_pvp_elo();

-- ============================================================================
-- 4. spend_match_gadget: Gadgets kosten Coins (fog=15, rush=20)
--    - caller muss host_id oder guest_id sein, match.status='active'
--    - Cap 5 pro Art pro Spieler pro Match (Zaehlung: coin_transactions mit
--      reason='duel_gadget' + ref_id=match_id des Callers). Da coin_transactions
--      KEINE kind-Info hat, unterscheiden wir Art ueber den Kosten-Betrag
--      (delta = -15 = fog, delta = -20 = rush) -> exakter Per-Art-Cap moeglich.
--    - Balance IMMER vor add_coins pruefen (add_coins clamped ohne Fehler).
--    - Atomar: advisory lock pro (user + match).
-- ============================================================================
create or replace function public.spend_match_gadget(p_match_id uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_m     public.match%rowtype;
  v_cost  int;
  v_coins int;
  v_used  int;
  v_new   int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  -- Kosten je Art
  if p_kind = 'fog' then      v_cost := 15;
  elsif p_kind = 'rush' then  v_cost := 20;
  else
    return jsonb_build_object('ok', false, 'error', 'BAD_KIND');
  end if;

  -- Atomar pro (User + Match): verhindert Doppel-Abbuchung bei parallelen Klicks.
  -- Nur die 1-arg-Form pg_advisory_xact_lock(bigint) ist implizit nutzbar
  -- (die 2-arg-Form ist (int,int); hashtextextended liefert bigint -> kein impliziter
  -- Cast). Daher User+Match in EINEN bigint-Key kombinieren.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_match_id::text, 77));

  select * into v_m from public.match where id = p_match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'MATCH_NOT_FOUND');
  end if;

  if v_uid <> v_m.host_id
     and v_uid <> coalesce(v_m.guest_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    return jsonb_build_object('ok', false, 'error', 'NOT_A_PLAYER');
  end if;

  -- Vertrag sagt status='active'. ABER: In der LIVE-DB (submit-duel/index.ts:114-115)
  -- wird der Status erst beim ERSTEN Score-Submit von 'ready' auf 'active' gehoben.
  -- Waehrend des laufenden Spiels (wenn Gadgets tatsaechlich benutzt werden) steht der
  -- Status also noch auf 'ready'. Wuerde man hier strikt nur 'active' zulassen, waeren
  -- Gadgets im gesamten Live-Spiel unbenutzbar. forfeit_match akzeptiert im selben Vertrag
  -- explizit ('active','ready') fuer laufende Spiele -> wir spiegeln das hier konsistent.
  -- (Als reiner 'active'-Check waere das Feature funktional tot.)
  if v_m.status not in ('active','ready') then
    return jsonb_build_object('ok', false, 'error', 'MATCH_NOT_ACTIVE');
  end if;

  -- Cap 5 pro Art pro Spieler pro Match. Art ueber Kosten-Betrag (delta) erkannt.
  select count(*) into v_used
  from public.coin_transactions
  where user_id = v_uid
    and reason  = 'duel_gadget'
    and ref_id  = p_match_id
    and delta   = -v_cost;
  if coalesce(v_used, 0) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'GADGET_CAP_REACHED',
      'cost', v_cost);
  end if;

  -- Balance pruefen VOR add_coins (add_coins clamped ohne Fehler auf 0).
  select coins into v_coins from public.profiles where id = v_uid;
  if coalesce(v_coins, 0) < v_cost then
    return jsonb_build_object('ok', false, 'error', 'NOT_ENOUGH_COINS',
      'cost', v_cost, 'coins', coalesce(v_coins, 0));
  end if;

  v_new := public.add_coins(v_uid, -v_cost, 'duel_gadget', p_match_id);

  return jsonb_build_object('ok', true, 'coins', v_new, 'cost', v_cost, 'kind', p_kind);
end $$;
grant execute on function public.spend_match_gadget(uuid, text) to authenticated;

-- ============================================================================
-- 5. forfeit_match: Sieg beanspruchen, wenn Gegner weg ist
--    - caller ist Spieler (host_id oder guest_id)
--    - status in ('active','ready')
--    - Gegner hat NICHT submitted (Gegner-vscore IS NULL)
--    - match.created_at < now() - interval '25 seconds' (Anti-Instant-Abuse)
--    -> caller gewinnt: status='finished', finished_at=now(), winner_id=caller,
--       und wenn wager>0 and paid=false: caller +2*wager ('duel_win'), paid=true.
--    Der ELO-Trigger greift automatisch beim status->'finished'.
-- ============================================================================
create or replace function public.forfeit_match(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_m         public.match%rowtype;
  v_opp_vscore int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  select * into v_m from public.match where id = p_match_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'MATCH_NOT_FOUND');
  end if;

  -- caller muss Spieler sein
  if v_uid <> v_m.host_id
     and v_uid <> coalesce(v_m.guest_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    return jsonb_build_object('ok', false, 'error', 'NOT_A_PLAYER');
  end if;

  -- bereits beendet -> idempotent
  if v_m.status = 'finished' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_FINISHED',
      'status', v_m.status, 'winner_id', v_m.winner_id);
  end if;

  if v_m.status not in ('active','ready') then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_FINISHED',
      'status', v_m.status);
  end if;

  -- Anti-Instant-Abuse: mind. 25s seit Erstellung
  if v_m.created_at >= now() - interval '25 seconds' then
    return jsonb_build_object('ok', false, 'error', 'TOO_EARLY');
  end if;

  -- Gegner-vscore bestimmen (der ANDERE Spieler darf nicht submitted haben)
  if v_uid = v_m.host_id then
    v_opp_vscore := v_m.guest_vscore;
  else
    v_opp_vscore := v_m.host_vscore;
  end if;
  if v_opp_vscore is not null then
    return jsonb_build_object('ok', false, 'error', 'OPPONENT_STILL_PLAYING');
  end if;

  -- caller gewinnt: Pot auszahlen (nur wenn wager>0 und noch nicht ausgezahlt)
  if v_m.wager > 0 and v_m.paid = false then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 42));
    perform public.add_coins(v_uid, 2 * v_m.wager, 'duel_win', v_m.id);
    update public.match
      set status = 'finished', finished_at = now(), winner_id = v_uid, paid = true
      where id = v_m.id;
  else
    update public.match
      set status = 'finished', finished_at = now(), winner_id = v_uid
      where id = v_m.id;
  end if;

  return jsonb_build_object(
    'ok', true, 'status', 'finished', 'winner_id', v_uid, 'wager', v_m.wager
  );
end $$;
grant execute on function public.forfeit_match(uuid) to authenticated;