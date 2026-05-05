-- Phase 2: Erweitert partner_submissions um Bild + strukturiertes Datum
-- damit Auto-Approve in admin.html eine vollstaendige App-Anzeige erstellen kann.

alter table public.partner_submissions
    add column if not exists cover_image_path text,
    add column if not exists start_at        timestamptz,
    add column if not exists end_at          timestamptz;

-- Public-Read Policy fuer event-images Bucket existiert bereits.
-- Schreibrechte (auch fuer anon, da partner-Forms ohne Login):
do $$
begin
    -- INSERT-Policy fuer event-images: anon darf hochladen
    if not exists (
        select 1 from pg_policies
        where schemaname='storage' and tablename='objects'
          and policyname='partner_uploads_anon_insert'
    ) then
        create policy partner_uploads_anon_insert on storage.objects
            for insert
            to anon, authenticated
            with check (
                bucket_id = 'event-images'
                and (storage.foldername(name))[1] = 'partner-uploads'
            );
    end if;
end $$;
