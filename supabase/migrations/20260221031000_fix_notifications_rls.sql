-- Fix: INSERT Policy fuer notifications Tabelle
-- Erlaubt authentifizierten Usern Benachrichtigungen fuer andere User zu erstellen

-- Erst pruefen ob eine INSERT Policy existiert, falls nicht erstellen
DO $$
BEGIN
    -- Bestehende INSERT Policies droppen falls vorhanden
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'notifications'
        AND schemaname = 'public'
        AND cmd = 'INSERT'
        AND policyname = 'Users can create notifications'
    ) THEN
        DROP POLICY "Users can create notifications" ON public.notifications;
    END IF;
END $$;

-- Authentifizierte User koennen Benachrichtigungen erstellen
CREATE POLICY "Users can create notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);
