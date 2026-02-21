-- Storage Policies fuer enrollment-certificates Bucket
-- Erlaubt authentifizierten Usern Upload und Admins das Lesen

-- Upload: Authentifizierte User koennen eigene Dateien hochladen
CREATE POLICY "Users can upload own enrollment certificates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'enrollment-certificates' AND (storage.foldername(name))[1] = auth.uid()::text OR name LIKE auth.uid()::text || '_%');

-- Update: Authentifizierte User koennen eigene Dateien ueberschreiben (upsert)
CREATE POLICY "Users can update own enrollment certificates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'enrollment-certificates' AND name LIKE auth.uid()::text || '_%');

-- Lesen: Authentifizierte User koennen alle Dateien im Bucket lesen (fuer Admin)
CREATE POLICY "Authenticated users can read enrollment certificates"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'enrollment-certificates');
