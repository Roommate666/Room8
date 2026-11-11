-- Referral-Rangliste fuer die monatliche Einlade-Verlosung (Red Bull + Bier).
-- Zaehlt nur ERFOLGREICHE Werbungen = geworbener Nutzer hat sich mit Uni-Mail verifiziert
-- (farming-sicher: Fake-Accounts ohne Uni-Mail zaehlen nicht).
-- p_since = Monats-/Zeitraum-Filter (NULL = alles). Basis: profiles.referred_by (seit Bugfix 26.10. wieder sauber).
create or replace function public.get_referral_leaderboard(p_since timestamptz default null, p_limit int default 20)
returns table(rang bigint, werber uuid, username text, geworbene_verifiziert int)
language sql stable security definer set search_path = public as $function$
  select row_number() over (order by count(*) desc, min(au.created_at)) as rang,
         ref.referred_by as werber,
         pw.username,
         count(*)::int as geworbene_verifiziert
  from public.profiles ref
  join auth.users au on au.id = ref.id
  join public.profiles pw on pw.id = ref.referred_by
  where ref.referred_by is not null
    and (ref.is_verified is true or ref.is_student_verified is true)
    and (p_since is null or au.created_at >= p_since)
  group by ref.referred_by, pw.username
  order by count(*) desc, min(au.created_at)
  limit greatest(1, least(p_limit, 100));
$function$;

revoke all on function public.get_referral_leaderboard(timestamptz,int) from public, anon;
grant execute on function public.get_referral_leaderboard(timestamptz,int) to authenticated, service_role;
