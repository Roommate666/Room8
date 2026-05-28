-- Migration: enrollment-certificates INSERT-Policy Klammer-Bug fixen.
--
-- Vorher: Migration 20260221030000 hat
--   "Users can upload own enrollment certificates"
-- erstellt mit:
--   WITH CHECK (bucket_id = 'enrollment-certificates'
--              AND (storage.foldername(name))[1] = auth.uid()::text
--              OR name LIKE auth.uid()::text || '_%')
--
-- SQL parst das wegen Operator-Praezedenz (AND bindet staerker als OR) als:
--   (bucket_id = 'enrollment-certificates' AND folder = uid)
--   OR (name LIKE uid || '_%')
-- Der zweite OR-Zweig hat KEINE bucket_id-Bedingung. Folge: jeder
-- authentifizierte User darf in JEDEN beliebigen Bucket (avatars,
-- event-images, listing-images, ...) eine Datei hochladen, solange der
-- Dateiname mit seiner eigenen UID + "_" beginnt. -> Storage-Quota-Abuse,
-- Hosting fremder Dateien unter fremden Buckets.
--
-- Die spaetere Haertungs-Migration 20260504000004 hat nur SELECT/UPDATE/DELETE
-- ersetzt, die kaputte INSERT-Policy aber stehen lassen.
--
-- Nachher: INSERT-Policy mit korrekter Klammerung. bucket_id-Bedingung gilt
-- IMMER, egal welches der beiden historischen Pfad-Muster matcht. Konsistent
-- mit den Policies aus 20260504000004 (escaped underscore).
--
-- Pfad-Muster im Bucket (zwei Wege existieren historisch):
--   1. {uid}/{timestamp}_{filename}   (upload.html)
--   2. {uid}_verification.{ext}        (verify-options.html)

drop policy if exists "Users can upload own enrollment certificates"
  on storage.objects;

create policy "enrollment_cert_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'enrollment-certificates'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or name like auth.uid()::text || '\_%' escape '\'
    )
  );
