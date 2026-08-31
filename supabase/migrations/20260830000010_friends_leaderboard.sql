-- Freunde-Leaderboard: rankt den Freundeskreis des eingeloggten Nutzers nach
-- G-Coins im laufenden Monat. Additiv (create or replace), kein drop bestehender Objekte.
--
-- Freundeskreis = {ich} + {mein referred_by (Werber)} + {alle die mich als referred_by haben}.
-- Strikt serverseitig aus auth.uid() gebildet (kein User-Input), SECURITY DEFINER.
-- Gleiche 9-Spalten-Signatur wie get_challenge_leaderboard, damit Frontend-Rendering
-- (Podium + Visitenkarte) unveraendert wiederverwendet werden kann.
-- Kein select('*') auf profiles: Anzeige-Felder aus public_profiles, nur city/is_champion/coins
-- gezielt aus profiles.

create or replace function public.get_friends_leaderboard()
returns table(user_id uuid, username text, university text, avatar_config jsonb,
              city text, is_champion boolean, coins_total bigint, coins_month bigint, rank bigint)
language sql security definer set search_path = public as $$
  with me as (
    select auth.uid() as uid
  ),
  circle as (
    -- ich selbst
    select uid as id from me where uid is not null
    union
    -- mein Werber (wer mich geworben hat)
    select p.referred_by as id
    from public.profiles p, me
    where p.id = me.uid and p.referred_by is not null
    union
    -- alle die ich geworben habe (die mich als referred_by haben)
    select p.id as id
    from public.profiles p, me
    where p.referred_by = me.uid
  )
  select ct.user_id, pp.username, pp.university, pp.avatar_config,
         p.city, coalesce(p.is_champion,false) as is_champion,
         coalesce(p.coins,0)::bigint as coins_total,
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
grant execute on function public.get_friends_leaderboard() to authenticated;
revoke all on function public.get_friends_leaderboard() from anon;
