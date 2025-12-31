-- supabase_migration.sql
-- Dieses Skript erweitert die Supabase‑Datenbank um benötigte Spalten, Tabellen
-- und Row‑Level‑Security‑Policies für die neue Roommate‑Version. Es ist
-- idempotent – eine erneute Ausführung führt zu keinem Fehler.

-- === Spalten‑Erweiterungen in existing tables ===
alter table if exists public.profiles
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_student boolean not null default false,
  add column if not exists role text not null default 'user' check (role in ('user','admin')),
  add column if not exists enrollment_certificate_url text;

alter table if exists public.listings
  add column if not exists only_students boolean not null default false;

-- === Neue Tabelle für hochgeladene Bilder ===
create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

-- === Indexe zur Verbesserung der Performance ===
create index if not exists listings_type_active_idx on public.listings (type, is_active);
create index if not exists listings_city_idx on public.listings (city);
create index if not exists profiles_verified_idx on public.profiles (is_verified);
create index if not exists listing_images_listing_idx on public.listing_images (listing_id);

-- === RLS aktivieren ===
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.wohnung_details enable row level security;
alter table public.gegenstand_details enable row level security;
alter table public.listing_images enable row level security;

-- === Policies für PROFILES ===
drop policy if exists p_profiles_select_self on public.profiles;
create policy p_profiles_select_self on public.profiles for select using (
  auth.uid() = id
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists p_profiles_update_self on public.profiles;
create policy p_profiles_update_self on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists p_profiles_update_admin on public.profiles;
create policy p_profiles_update_admin on public.profiles for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- === Policies für LISTINGS ===
drop policy if exists p_listings_select on public.listings;
create policy p_listings_select on public.listings for select using (
  is_active = true or owner_id = auth.uid()
);

drop policy if exists p_listings_ins on public.listings;
create policy p_listings_ins on public.listings for insert with check (owner_id = auth.uid());

drop policy if exists p_listings_upd on public.listings;
create policy p_listings_upd on public.listings for update using (owner_id = auth.uid());

drop policy if exists p_listings_del on public.listings;
create policy p_listings_del on public.listings for delete using (owner_id = auth.uid());

-- === Policies für wohnung_details ===
drop policy if exists p_wd_select on public.wohnung_details;
create policy p_wd_select on public.wohnung_details for select using (
  exists (select 1 from public.listings l where l.id = wohnung_details.listing_id and (l.is_active = true or l.owner_id = auth.uid()))
);

drop policy if exists p_wd_cud on public.wohnung_details;
create policy p_wd_cud on public.wohnung_details for all using (
  exists (select 1 from public.listings l where l.id = wohnung_details.listing_id and l.owner_id = auth.uid())
) with check (
  exists (select 1 from public.listings l where l.id = wohnung_details.listing_id and l.owner_id = auth.uid())
);

-- === Policies für gegenstand_details ===
drop policy if exists p_gd_select on public.gegenstand_details;
create policy p_gd_select on public.gegenstand_details for select using (
  exists (select 1 from public.listings l where l.id = gegenstand_details.listing_id and (l.is_active = true or l.owner_id = auth.uid()))
);

drop policy if exists p_gd_cud on public.gegenstand_details;
create policy p_gd_cud on public.gegenstand_details for all using (
  exists (select 1 from public.listings l where l.id = gegenstand_details.listing_id and l.owner_id = auth.uid())
) with check (
  exists (select 1 from public.listings l where l.id = gegenstand_details.listing_id and l.owner_id = auth.uid())
);

-- === Policies für listing_images ===
drop policy if exists p_li_select on public.listing_images;
create policy p_li_select on public.listing_images for select using (
  exists (select 1 from public.listings l where l.id = listing_images.listing_id and (l.is_active = true or l.owner_id = auth.uid()))
);

drop policy if exists p_li_cud on public.listing_images;
create policy p_li_cud on public.listing_images for all using (
  exists (select 1 from public.listings l where l.id = listing_images.listing_id and l.owner_id = auth.uid())
) with check (
  exists (select 1 from public.listings l where l.id = listing_images.listing_id and l.owner_id = auth.uid())
);

-- === Storage Policies ===
-- Privat: enrollment-certificates
create policy if not exists s_select_cert on storage.objects for select to authenticated using (
  bucket_id = 'enrollment-certificates'
  and (owner = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
);

create policy if not exists s_insert_cert on storage.objects for insert to authenticated with check (
  bucket_id = 'enrollment-certificates' and owner = auth.uid()
);

create policy if not exists s_upd_cert on storage.objects for update to authenticated using (
  bucket_id = 'enrollment-certificates' and (owner = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
) with check (bucket_id = 'enrollment-certificates');

create policy if not exists s_del_cert on storage.objects for delete to authenticated using (
  bucket_id = 'enrollment-certificates' and (owner = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
);

-- Öffentlich lesbar: listing-images
create policy if not exists s_select_images_public on storage.objects for select to anon using (
  bucket_id = 'listing-images'
);

create policy if not exists s_cud_images_owner on storage.objects for all to authenticated using (
  bucket_id = 'listing-images' and owner = auth.uid()
) with check (
  bucket_id = 'listing-images' and owner = auth.uid()
);