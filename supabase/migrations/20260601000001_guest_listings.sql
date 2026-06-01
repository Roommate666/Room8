-- Gast-Inserate (Wohnung) ohne Account: oeffentlicher Schnell-Link.
-- Isolierte Staging-Tabelle: anon darf NUR einfuegen (status=pending), NICHT lesen
-- -> kein Datenleck. Admin moderiert -> bei Freigabe wird ein echtes listing erzeugt.

create table if not exists public.guest_listings (
    id              uuid primary key default gen_random_uuid(),
    data            jsonb not null,            -- kompletter listings-Insert-Payload (ohne owner_id)
    title           text not null,             -- fuer die Admin-Uebersicht
    city            text,                      -- fuer Anzeige/Filter
    contact_email   text not null,             -- Benachrichtigung des Vermieters
    contact_phone   text,                      -- optional (WhatsApp)
    status          text not null default 'pending',  -- pending | approved | rejected
    created_listing_id uuid,                   -- gesetzt nach Freigabe
    admin_notes     text,
    reviewed_at     timestamptz,
    reviewed_by     uuid,
    created_at      timestamptz not null default now()
);

alter table public.guest_listings enable row level security;

-- anon + eingeloggte duerfen NUR eine pending-Einreichung mit Pflicht-Kontakt anlegen.
-- Laengen-Limits gegen Muell. Kein owner noetig (oeffentliche Akquise).
drop policy if exists guest_listings_public_insert on public.guest_listings;
create policy guest_listings_public_insert on public.guest_listings
    for insert to anon, authenticated
    with check (
        status = 'pending'
        and contact_email is not null
        and char_length(contact_email) between 5 and 200
        and char_length(title) between 3 and 200
        and char_length(coalesce(city, '')) <= 80
    );

-- Lesen/Aendern nur fuer Admins (anon kann NICHT lesen -> Kontaktdaten sind geschuetzt).
drop policy if exists guest_listings_admin_read on public.guest_listings;
create policy guest_listings_admin_read on public.guest_listings
    for select to authenticated
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

drop policy if exists guest_listings_admin_update on public.guest_listings;
create policy guest_listings_admin_update on public.guest_listings
    for update to authenticated
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

create index if not exists guest_listings_status_idx on public.guest_listings (status, created_at desc);

-- Admin-Alert bei neuer Einreichung (nutzt bestehende send_admin_alert-Infrastruktur, falls vorhanden)
create or replace function public.notify_guest_listing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    begin
        perform public.send_admin_alert(
            'Neues Gast-Inserat: ' || coalesce(NEW.title, '?'),
            '<p><b>Stadt:</b> ' || coalesce(NEW.city, '?') || '</p>' ||
            '<p><b>Kontakt:</b> ' || coalesce(NEW.contact_email, '?') ||
            coalesce(' / ' || NEW.contact_phone, '') || '</p>' ||
            '<p>Freigeben im Admin-Panel.</p>'
        );
    exception when others then
        -- Alert-Fehler darf die Einreichung nie blockieren
        null;
    end;
    return NEW;
end; $$;

drop trigger if exists trg_notify_guest_listing on public.guest_listings;
create trigger trg_notify_guest_listing
    after insert on public.guest_listings
    for each row execute function public.notify_guest_listing();
