-- ============================================================
-- Duell ohne Einsatz (Apple-konform) + Elo-Ranking + Coin-Belohnung mit Anti-Farming
-- Verlosung: Los-Kauf deaktiviert (Lose nur noch gratis durch Werben)
-- Grund: Apple lehnt Wett-/Lotterie-Mechanik ab (simulated gambling).
--   Loesung: kein Einsatz (niemand verliert eigene Coins) -> kein Wetten;
--   Gewinner bekommt Elo (Skill-Score) + begrenzte Coin-Belohnung (kein Farming).
-- ============================================================

-- 1) Elo-/Statistik-Felder + Belohnungs-Flag
alter table public.profiles add column if not exists duel_elo    int not null default 1000;
alter table public.profiles add column if not exists duel_wins   int not null default 0;
alter table public.profiles add column if not exists duel_losses int not null default 0;
alter table public.match    add column if not exists reward_paid boolean not null default false;

-- 2) create_match: KEIN Einsatz mehr (v_wager fest 0)
CREATE OR REPLACE FUNCTION public.create_match(p_mode text DEFAULT 'high'::text, p_wager integer DEFAULT 0, p_challenged_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_seed   bigint;
  v_code   text;
  v_id     uuid;
  v_try    int := 0;
  v_wager  int := 0;   -- Einsatz entfernt: kein Wetten (Apple-konform)
  v_mode   text := coalesce(p_mode, 'high');
  v_status text;
  v_hostname text;
  v_body   text;
  v_old    record;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  if v_mode not in ('high','daily') then v_mode := 'high'; end if;
  if p_challenged_id is not null and p_challenged_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'CANNOT_CHALLENGE_SELF');
  end if;

  -- offene Alt-Lobbys/Einladungen des Hosts aufraeumen; alte Einsaetze (aus Vor-Umstellung) zurueckerstatten
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

  if p_challenged_id is not null then
    select username into v_hostname from public.public_profiles where id = v_uid;
    v_hostname := coalesce(v_hostname, 'Ein Spieler');
    v_body := v_hostname || ' fordert dich zum Duell heraus';
    begin
      perform public.notify_user_push(
        p_challenged_id, 'duel_challenge', 'Duell-Herausforderung! 🐐', v_body,
        jsonb_build_object('url', 'game/duel.html?match=' || v_id::text),
        'duel:' || v_id::text
      );
    exception when others then
      raise warning 'create_match push failed for %: %', p_challenged_id, sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'ok', true, 'match_id', v_id, 'join_code', v_code,
    'seed', v_seed, 'mode', v_mode, 'wager', 0, 'status', v_status
  );
end $function$;

-- 3) finish_match: Score entscheidet + Elo-Update + begrenzte Coin-Belohnung
CREATE OR REPLACE FUNCTION public.finish_match(p_match_id uuid, p_score integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_m public.match%rowtype;
  v_loser uuid;
  v_wel int; v_lel int; v_exp numeric; v_delta int;
  v_rewarded_today int; v_vs_today boolean;
  v_reward int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  -- Lock je Match: der Finished-Uebergang (Elo/Belohnung) darf nur EINMAL laufen
  perform pg_advisory_xact_lock(hashtextextended(p_match_id::text, 77));

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

    -- Elo + Belohnung (nur bei echtem Gewinner, nicht bei Unentschieden)
    if v_m.winner_id is not null then
      v_loser := case when v_m.winner_id = v_m.host_id then v_m.guest_id else v_m.host_id end;
      if v_loser is not null then
        select coalesce(duel_elo,1000) into v_wel from public.profiles where id = v_m.winner_id;
        select coalesce(duel_elo,1000) into v_lel from public.profiles where id = v_loser;
        v_exp   := 1.0 / (1.0 + power(10.0, (v_lel - v_wel)::numeric / 400.0));
        v_delta := greatest(1, round(32.0 * (1.0 - v_exp))::int);
        update public.profiles set duel_elo = coalesce(duel_elo,1000) + v_delta, duel_wins = coalesce(duel_wins,0) + 1 where id = v_m.winner_id;
        update public.profiles set duel_elo = greatest(100, coalesce(duel_elo,1000) - v_delta), duel_losses = coalesce(duel_losses,0) + 1 where id = v_loser;

        -- Coin-Belohnung nur begrenzt: max 3 belohnte Siege/Tag + max 1x pro Gegner/Tag (Anti-Farming)
        select count(*) into v_rewarded_today from public.match
          where winner_id = v_m.winner_id and reward_paid = true and finished_at::date = current_date;
        select exists(select 1 from public.match
          where winner_id = v_m.winner_id and reward_paid = true and finished_at::date = current_date
            and (host_id = v_loser or guest_id = v_loser)) into v_vs_today;
        if v_rewarded_today < 3 and not v_vs_today then
          v_reward := 75;   -- nur der Gewinner; > Daily(50), macht Duelle attraktiver als Solo
          perform public.add_coins(v_m.winner_id, v_reward, 'duel_win', p_match_id);
          update public.match set reward_paid = true where id = p_match_id;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'status', v_m.status,
    'host_score', v_m.host_score, 'guest_score', v_m.guest_score,
    'winner_id', v_m.winner_id,
    'reward', case when v_m.winner_id = v_uid then v_reward else 0 end,
    'elo_delta', v_delta);
end $function$;

-- 4) Verlosung: Los-Kauf mit Coins deaktiviert (Lose nur noch gratis durch Werben = kein Einsatz)
revoke execute on function public.buy_raffle_ticket(uuid) from authenticated, anon;

-- 5) Die 2 offenen Alt-Matches mit Einsatz sauber zurueckerstatten + schliessen
do $$
declare r record;
begin
  for r in select id, host_id, guest_id, wager from public.match
           where wager > 0 and status in ('invited','lobby','ready','active') and paid = false loop
    perform public.add_coins(r.host_id, r.wager, 'duel_refund', r.id);
    if r.guest_id is not null then perform public.add_coins(r.guest_id, r.wager, 'duel_refund', r.id); end if;
    update public.match set status='aborted', finished_at=coalesce(finished_at,now()), paid=true where id=r.id;
  end loop;
end $$;
