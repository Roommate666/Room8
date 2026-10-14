-- ============================================================================
-- Friendships / Freunde-Verwaltung (UniGoat)
-- Neu 05.09.2026. Bisher war "Freunde" nur der Referral-Kreis (referred_by).
-- Diese Migration fuegt echte, beidseitige Freundschaften hinzu:
--   friendships-Tabelle (pending/accepted) + RPCs zum Anfragen/Annehmen/Entfernen.
-- RLS: Nutzer sieht nur eigene Zeilen. Schreiben NUR ueber SECURITY DEFINER RPCs.
-- get_friends_leaderboard wird additiv erweitert (Referral-Kreis + echte Freunde).
-- Spec: specs/friends-system.md
-- ============================================================================

create table if not exists public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users(id) on delete cascade,
  addressee_id  uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','accepted')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint friendships_no_self check (requester_id <> addressee_id),
  constraint friendships_unique_pair unique (requester_id, addressee_id)
);

create index if not exists idx_friendships_addressee on public.friendships(addressee_id, status);
create index if not exists idx_friendships_requester on public.friendships(requester_id, status);

alter table public.friendships enable row level security;

-- Nur Beteiligte duerfen ihre Zeilen sehen. Kein direktes insert/update/delete (nur RPCs).
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ── RPC 1: Freund anfragen (per Username ODER Referral-Code) ────────────────
create or replace function public.send_friend_request(p_target text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_existing public.friendships;
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
      return jsonb_build_object('ok', true, 'status', 'accepted');
    end if;
    return jsonb_build_object('ok', false, 'error', 'request_already_sent');
  end if;

  insert into public.friendships(requester_id, addressee_id) values (v_me, v_target);
  return jsonb_build_object('ok', true, 'status', 'pending');
end $$;

-- ── RPC 2: Auf Anfrage antworten (annehmen/ablehnen) ────────────────────────
create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid(); v_row public.friendships;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  select * into v_row from public.friendships
    where id = p_request_id and addressee_id = v_me and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'error', 'request_not_found'); end if;

  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now() where id = p_request_id;
    return jsonb_build_object('ok', true, 'status', 'accepted');
  else
    delete from public.friendships where id = p_request_id;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
end $$;

-- ── RPC 3: Freund entfernen (beide Richtungen) ──────────────────────────────
create or replace function public.remove_friend(p_friend uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  delete from public.friendships
    where (requester_id = v_me and addressee_id = p_friend)
       or (requester_id = p_friend and addressee_id = v_me);
  return jsonb_build_object('ok', true);
end $$;

-- ── RPC 4: Meine Freunde (accepted) ─────────────────────────────────────────
create or replace function public.list_friends()
returns table(id uuid, username text, avatar_config jsonb, city text, university text, coins bigint, since timestamptz)
language sql security definer set search_path to 'public' as $$
  select pp.id, pp.username, pp.avatar_config, pp.city, pp.university,
         coalesce(p.coins, 0)::bigint, f.responded_at
  from public.friendships f
  join public.public_profiles pp
    on pp.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  join public.profiles p on p.id = pp.id
  where f.status = 'accepted' and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by pp.username;
$$;

-- ── RPC 5: Eingehende Anfragen ──────────────────────────────────────────────
create or replace function public.list_friend_requests()
returns table(request_id uuid, from_id uuid, username text, avatar_config jsonb, created_at timestamptz)
language sql security definer set search_path to 'public' as $$
  select f.id, f.requester_id, pp.username, pp.avatar_config, f.created_at
  from public.friendships f
  join public.public_profiles pp on pp.id = f.requester_id
  where f.addressee_id = auth.uid() and f.status = 'pending'
  order by f.created_at desc;
$$;

-- ── RPC 6: Ausgehende (offene) Anfragen ─────────────────────────────────────
create or replace function public.list_sent_requests()
returns table(request_id uuid, to_id uuid, username text, created_at timestamptz)
language sql security definer set search_path to 'public' as $$
  select f.id, f.addressee_id, pp.username, f.created_at
  from public.friendships f
  join public.public_profiles pp on pp.id = f.addressee_id
  where f.requester_id = auth.uid() and f.status = 'pending'
  order by f.created_at desc;
$$;

-- ── get_friends_leaderboard: Kreis additiv um echte Freunde erweitern ───────
create or replace function public.get_friends_leaderboard()
returns table(user_id uuid, username text, university text, avatar_config jsonb, city text, is_champion boolean, coins_total bigint, coins_month bigint, rank bigint)
language sql security definer set search_path to 'public' as $$
  with me as (select auth.uid() as uid),
  circle as (
    select uid as id from me where uid is not null
    union
    select p.referred_by as id from public.profiles p, me
      where p.id = me.uid and p.referred_by is not null
    union
    select p.id as id from public.profiles p, me where p.referred_by = me.uid
    union
    -- echte Freundschaften (beide Richtungen)
    select case when f.requester_id = me.uid then f.addressee_id else f.requester_id end as id
      from public.friendships f, me
      where f.status = 'accepted' and (f.requester_id = me.uid or f.addressee_id = me.uid)
  )
  select ct.user_id, pp.username, pp.university, pp.avatar_config,
         p.city, coalesce(p.is_champion, false) as is_champion,
         coalesce(p.coins, 0)::bigint as coins_total,
         sum(ct.delta)::bigint as coins_month,
         rank() over (order by sum(ct.delta) desc) as rank
  from public.coin_transactions ct
  join circle c on c.id = ct.user_id
  join public.public_profiles pp on pp.id = ct.user_id
  join public.profiles p on p.id = ct.user_id
  where ct.created_at >= date_trunc('month', now())
  group by ct.user_id, pp.username, pp.university, pp.avatar_config, p.city, p.is_champion, p.coins
  having sum(ct.delta) > 0
  order by coins_month desc
  limit 200;
$$;

grant execute on function public.send_friend_request(text)          to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid)                to authenticated;
grant execute on function public.list_friends()                     to authenticated;
grant execute on function public.list_friend_requests()             to authenticated;
grant execute on function public.list_sent_requests()               to authenticated;
grant execute on function public.get_friends_leaderboard()          to authenticated;
