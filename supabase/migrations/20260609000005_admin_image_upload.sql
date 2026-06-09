-- =============================================================
-- event-images Upload: Admins explizit erlauben (fuer Bild-Ersetzen im
-- Admin-Approve-Modal). Bisher nur is_verified/is_student_verified -> ein
-- nicht-verifizierter Admin (z.B. admin@room8.club) konnte nicht hochladen.
-- Stand 2026-06-09
-- =============================================================
DROP POLICY IF EXISTS "event_images_verified_upload" ON storage.objects;
CREATE POLICY "event_images_verified_upload" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'event-images'
        AND auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND (is_verified = true OR is_student_verified = true OR is_admin = true)
        )
    );
