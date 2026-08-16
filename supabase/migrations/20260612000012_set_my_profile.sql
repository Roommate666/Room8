-- set_my_profile: Onboarding-Speicherung ueber SECURITY DEFINER RPC.
--
-- Grund: die Rolle authenticated hat KEIN direktes UPDATE/INSERT-Recht auf
-- public.profiles (Writes laufen ueber SECURITY-DEFINER-RPCs wie set_my_avatar).
-- complete-profile.html versuchte bisher ein direktes profiles.update() -> schlug
-- immer mit "permission denied for table profiles" (42501) fehl. Damit war die
-- Onboarding-Speicherung generell defekt und die neue Uni-Pflicht nicht speicherbar.
--
-- Diese RPC setzt AUSSCHLIESSLICH die eigene Profilzeile (auth.uid()) und prueft die
-- Username-Eindeutigkeit serverseitig. Sie legt die Zeile an, falls sie fehlt.

create or replace function public.set_my_profile(
  p_username text,
  p_full_name text,
  p_city text,
  p_university text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  -- Username-Eindeutigkeit (case-insensitive), eigene Zeile ausgenommen
  if p_username is not null and length(trim(p_username)) > 0
     and exists (
       select 1 from public.profiles
       where lower(username) = lower(trim(p_username)) and id <> v_uid
     ) then
    return jsonb_build_object('ok', false, 'error', 'USERNAME_TAKEN');
  end if;

  update public.profiles set
    username   = coalesce(nullif(trim(p_username), ''),  username),
    full_name  = coalesce(nullif(trim(p_full_name), ''), full_name),
    city       = coalesce(nullif(trim(p_city), ''),      city),
    university = coalesce(nullif(trim(p_university), ''), university),
    updated_at = now()
  where id = v_uid;

  if not found then
    insert into public.profiles (id, username, full_name, city, university, updated_at)
    values (v_uid, nullif(trim(p_username), ''), nullif(trim(p_full_name), ''),
            nullif(trim(p_city), ''), nullif(trim(p_university), ''), now());
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.set_my_profile(text, text, text, text) to authenticated;

comment on function public.set_my_profile(text, text, text, text) is
  'Onboarding: setzt username/full_name/city/university der EIGENEN Profilzeile (auth.uid()). Ersetzt direkte profiles-Updates (die fuer authenticated verboten sind).';
