-- Migration: enrollment-certificates Bucket haerten.
--
-- Vorher: Migration 20260221030000 hat
--   "Authenticated users can read enrollment certificates"
-- erstellt mit USING (bucket_id = 'enrollment-certificates') ohne weitere
-- Einschraenkung — d.h. JEDER eingeloggte Room8-User konnte ALLE
-- Immatrikulationsbescheinigungen aller anderen User runterladen.
-- Sensibelste Daten (Klarname, Uni, Matrikelnummer, oft Geburtsdatum) →
-- DSGVO-Risiko + Vertrauens-GAU.
--
-- Nachher:
--   - Owner darf seine eigene(n) Datei(en) lesen (beide Pfad-Muster)
--   - Admins (profiles.is_admin = true) duerfen alles lesen (fuer Verifizierung)
--   - Sonst niemand
--
-- Pfad-Muster im Bucket (zwei Wege existieren historisch):
--   1. {uid}/{timestamp}_{filename}             (upload.html)
--   2. {uid}_verification.{ext}                  (verify-options.html)
-- Beide werden in der USING-Clause matched.

drop policy if exists "Authenticated users can read enrollment certificates"
  on storage.objects;

create policy "enrollment_cert_owner_read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'enrollment-certificates'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or name like auth.uid()::text || '\_%' escape '\'
    )
  );

create policy "enrollment_cert_admin_read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'enrollment-certificates'
    and exists (
      select 1
        from public.profiles
       where id = auth.uid()
         and is_admin = true
    )
  );

-- UPDATE-Policy aus Mig 30 nutzt nur prefix-Pattern; foldername-Pattern fehlt.
-- Der Vollstaendigkeit halber neu erstellen damit Owner beide Wege updaten kann.
drop policy if exists "Users can update own enrollment certificates"
  on storage.objects;

create policy "enrollment_cert_owner_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'enrollment-certificates'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or name like auth.uid()::text || '\_%' escape '\'
    )
  );

-- DELETE: Owner darf eigene Datei loeschen (vorher gar keine Policy → niemand
-- konnte loeschen, auch nicht der Owner selbst).
drop policy if exists "enrollment_cert_owner_delete" on storage.objects;

create policy "enrollment_cert_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'enrollment-certificates'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or name like auth.uid()::text || '\_%' escape '\'
    )
  );
