-- ============================================================================
-- 20260908000001_push_new_features.sql
-- Push-Notifications fuer die neuen Features nachziehen. notify_user_push ist
-- AI-LOCK -> wird NUR aufgerufen (nicht veraendert). Aufrufe sind best-effort
-- (begin/exception when others -> null), damit ein Push-Fehler die Kernaktion
-- (Freundschaft/Duell) NIE bricht. Channels landen im else-Zweig von
-- notify_user_push (v_toggle_ok:=true) -> Push aktiv, wie 'duel_challenge'.
--   * send_friend_request  -> Push an Empfaenger (neue Anfrage) bzw. an
--     urspruenglichen Anfragesteller (Auto-Accept bei Gegenanfrage)
--   * respond_friend_request (accept) -> Push an Anfragesteller (angenommen)
--   * accept_challenge -> Push an Host (Duell angenommen)
-- Funktionskoerper 1:1 aus der Live-DB reproduziert + Push ergaenzt.
-- ============================================================================

create or replace function public.send_friend_request(p_target text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_existing public.friendships;
  v_uname text;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if p_target is null or length(trim(p_target)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_input');
  end if;

  select id into v_target from public.profiles
    where lower(username) = lower(trim(p_target))
       or upper(referral_code) = upper(trim(p_target))
    limit 1;

  if v_target is null then return jsonb_build_object('ok', false, 'error', 'user_not_found'); end if;
  if v_target = v_me then return jsonb_build_object('ok', false, 'error', 'cannot_add_self'); end if;

  select username into v_uname from public.public_profiles where id = v_me;
  v_uname := coalesce(v_uname, 'Jemand');

  select * into v_existing from public.friendships
    where (requester_id = v_me and addressee_id = v_target)
       or (requester_id = v_target and addressee_id = v_me)
    limit 1;

  if found then
    if v_existing.status = 'accepted' then
      return jsonb_build_object('ok', false, 'error', 'already_friends');
    end if;
    -- Gegenseite hat MIR bereits angefragt -> annehmen = sofort Freunde
    if v_existing.addressee_id = v_me then
      update public.friendships set status = 'accepted', responded_at = now() where id = v_existing.id;
      begin
        perform public.notify_user_push(v_target, 'friend_accept', 'Neuer Freund 🐐',
          v_uname || ' hat deine Freundschaftsanfrage angenommen.',
          jsonb_build_object('url','friends.html'), 'friend:'||v_me::text);
      exception when others then null; end;
      return jsonb_build_object('ok', true, 'status', 'accepted');
    end if;
    return jsonb_build_object('ok', false, 'error', 'request_already_sent');
  end if;

  insert into public.friendships(requester_id, addressee_id) values (v_me, v_target);
  begin
    perform public.notify_user_push(v_target, 'friend_request', 'Neue Freundschaftsanfrage 🐐',
      v_uname || ' möchte dein Freund sein.',
      jsonb_build_object('url','friends.html'), 'friendreq:'||v_me::text);
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'status', 'pending');
end $function$;

create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_me uuid := auth.uid(); v_row public.friendships; v_uname text;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  select * into v_row from public.friendships
    where id = p_request_id and addressee_id = v_me and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'error', 'request_not_found'); end if;

  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now() where id = p_request_id;
    select username into v_uname from public.public_profiles where id = v_me;
    v_uname := coalesce(v_uname, 'Jemand');
    begin
      perform public.notify_user_push(v_row.requester_id, 'friend_accept', 'Neuer Freund 🐐',
        v_uname || ' hat deine Freundschaftsanfrage angenommen.',
        jsonb_build_object('url','friends.html'), 'friend:'||v_me::text);
    exception when others then null; end;
    return jsonb_build_object('ok', true, 'status', 'accepted');
  else
    delete from public.friendships where id = p_request_id;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
end $function$;

create or replace function public.accept_challenge(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid   uuid := auth.uid();
  v_m     public.match%rowtype;
  v_coins int;
  v_uname text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
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

  select username into v_uname from public.public_profiles where id = v_uid;
  v_uname := coalesce(v_uname, 'Dein Gegner');
  begin
    perform public.notify_user_push(v_m.host_id, 'duel_accept', 'Duell angenommen! 🎮',
      v_uname || ' nimmt dein Duell an — los geht''s!',
      jsonb_build_object('url','game/duel.html?match='||v_m.id::text), 'duel:'||v_m.id::text);
  exception when others then null; end;

  return jsonb_build_object(
    'ok', true, 'match_id', v_m.id, 'seed', v_m.seed, 'mode', v_m.mode,
    'wager', v_m.wager, 'host_id', v_m.host_id
  );
end $function$;

grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.accept_challenge(uuid) to authenticated;
