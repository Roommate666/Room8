-- Wohnungs-Inserate nur INTERN (eingeloggte Studenten), nie oeffentlich/anon.
-- Schutz vor Untervermietungs-Risiko: ein Vermieter soll das Inserat seines
-- untervermietenden Studenten nicht oeffentlich finden koennen.
--
-- Umsetzung: RESTRICTIVE SELECT-Policy NUR fuer die anon-Rolle. Sie wird mit der
-- bestehenden permissiven SELECT-Policy UND-verknuepft -> anon sieht alles AUSSER
-- type='wohnung'. Die authenticated-Rolle (eingeloggte Studenten) ist NICHT
-- betroffen und sieht weiterhin alle aktiven Inserate inkl. Wohnungen.

drop policy if exists listings_anon_no_wohnung on public.listings;
create policy listings_anon_no_wohnung on public.listings
  as restrictive
  for select
  to anon
  using (type is distinct from 'wohnung');
