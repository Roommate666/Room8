-- Leaderboard-Funktion um Visitenkarten-Daten erweitern: Stadt, Champion-Status,
-- lebenslange Coins (fuer Tier). Return-Signatur aendert sich -> drop + create.

drop function if exists public.get_challenge_leaderboard(int);
create or replace function public.get_challenge_leaderboard(p_limit int default 50)
returns table(user_id uuid, username text, university text, avatar_config jsonb,
              city text, is_champion boolean, coins_total bigint, coins_month bigint, rank bigint)
language sql security definer set search_path = public as $$
  select ct.user_id, pp.username, pp.university, pp.avatar_config,
         p.city, coalesce(p.is_champion,false) as is_champion,
         coalesce(p.coins,0)::bigint as coins_total,
         sum(ct.delta)::bigint as coins_month,
         rank() over (order by sum(ct.delta) desc) as rank
  from public.coin_transactions ct
  join public.public_profiles pp on pp.id = ct.user_id
  join public.profiles p on p.id = ct.user_id
  where ct.created_at >= date_trunc('month', now())
  group by ct.user_id, pp.username, pp.university, pp.avatar_config, p.city, p.is_champion, p.coins
  having sum(ct.delta) > 0
  order by coins_month desc
  limit greatest(1, least(coalesce(p_limit,50), 200));
$$;
grant execute on function public.get_challenge_leaderboard(int) to anon, authenticated;
