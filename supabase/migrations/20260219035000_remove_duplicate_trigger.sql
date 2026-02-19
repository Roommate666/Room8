-- Doppelten Trigger entfernen - verursacht doppelte Push-Benachrichtigungen
DROP TRIGGER IF EXISTS trigger_notify_new_message ON messages;

-- Debug Funktion aufraeumen
DROP FUNCTION IF EXISTS public.debug_message_triggers();
