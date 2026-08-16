-- my_profile-View erneut neu bauen fuer die in 0016 hinzugefuegten Spalten
-- (streak_days, last_active_date). Bekannte select-*-Einfrier-Falle (vgl. 0010/0014).
drop view if exists public.my_profile;
create view public.my_profile as
  select * from public.profiles where id = auth.uid();
grant select on public.my_profile to authenticated;
