-- Listings: Apply-Klick-Counter (Job-Bewerbungs-Klicks auf "Bewerben"-Button)
-- Korrigiert Mig 20260505000005 — Jobs liegen in `listings` (type='job'), nicht in `jobs`.
-- jobs.view_count/apply_clicks aus Mig 5 bleiben als no-op-Spalten stehen.

alter table public.listings
  add column if not exists apply_clicks int not null default 0;

comment on column public.listings.apply_clicks is
  'Klicks auf "Bewerben"-Button bei type=job (oeffnet mailto: oder application_url).';

create or replace function public.increment_listing_apply(p_listing_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.listings
  set apply_clicks = coalesce(apply_clicks, 0) + 1
  where id = p_listing_id;
$$;

grant execute on function public.increment_listing_apply(uuid) to authenticated, anon;
