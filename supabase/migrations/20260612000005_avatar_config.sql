-- UniGoat Avatar: parametrisierte Ziege je Nutzer (profiles.avatar_config jsonb)
-- Schreiben via RPC set_my_avatar (umgeht Spalten-Grant/RLS-Feinheiten),
-- Lesen via public_profiles (security_invoker=false -> laeuft als Owner) + goat_leaderboard.

alter table public.profiles add column if not exists avatar_config jsonb not null default '{}'::jsonb;

-- Schreib-RPC: nur eigenes Profil, nur ein JSON-Objekt.
create or replace function public.set_my_avatar(p_config jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'invalid config';
  end if;
  update public.profiles set avatar_config = p_config where id = auth.uid();
end;
$$;
revoke all on function public.set_my_avatar(jsonb) from public;
grant execute on function public.set_my_avatar(jsonb) to authenticated;

-- public_profiles um avatar_config erweitern (Definition originalgetreu + neue Spalte)
-- goat_leaderboard haengt an public_profiles -> zuerst droppen, danach neu bauen
drop view if exists public.goat_leaderboard;
drop view if exists public.public_profiles;
create view public.public_profiles
with (security_invoker = false) as
select
  id, username, full_name, avatar_url, avatar_config, bio, city, university,
  study_field, semester, age, languages, interests, instagram_handle,
  is_verified, is_student, is_student_verified, is_partner,
  partner_business_name, created_at
from public.profiles;
grant select on public.public_profiles to authenticated;

-- goat_leaderboard um avatar_config erweitern
create or replace view public.goat_leaderboard as
select
  gs.id, gs.user_id, gs.mode, gs.score, gs.created_at,
  pp.username, pp.university, pp.avatar_config
from public.goat_scores gs
join public.public_profiles pp on pp.id = gs.user_id
where gs.verified = true;
grant select on public.goat_leaderboard to anon, authenticated;
