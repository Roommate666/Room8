-- =============================================================
-- Anon-Einreicher duerfen Bilder hochladen (Akquise-Flow)
-- PROBLEM: partner-event/job/coupon.html laedt Logo+Cover nach
--   event-images/partner-uploads/. Die bestehende INSERT-Policy
--   event_images_verified_upload verlangt auth.uid() IS NOT NULL
--   + verified/admin. Anon-Akquise-Einreicher (nicht eingeloggt)
--   -> Upload scheitert STILL -> cover_image_path/logo_image_path
--   bleiben null -> kein Bild im Admin-Panel. Genau das passierte
--   bei Quiz-Night / Rabatt / Marketing (alle submitter_id=null,
--   alle ohne Bild), waehrend "Werkstudent" (eingeloggt) ein Bild hat.
-- FIX: Anon + eingeloggte (auch nicht-verified) duerfen NUR in den
--   partner-uploads/-Ordner schreiben. Missbrauch ist auf diesen
--   Prefix begrenzt; Bilder werden clientseitig (Room8ImageValidator)
--   re-encoded/zugeschnitten, Bucket ist ohnehin public-read.
-- Stand 2026-06-09
-- =============================================================

DROP POLICY IF EXISTS "event_images_submission_upload" ON storage.objects;
CREATE POLICY "event_images_submission_upload" ON storage.objects
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        bucket_id = 'event-images'
        AND (storage.foldername(name))[1] = 'partner-uploads'
    );
