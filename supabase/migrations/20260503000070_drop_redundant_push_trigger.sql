-- Doppelter-Push-Bug: trigger_notify_push_all auf notifications-Tabelle feuert
-- bei jedem INSERT einen Push, ZUSAETZLICH zur notify_user_push() in den
-- jeweiligen Trigger-Funktionen. Resultat: 2 pushes pro Aktion.
--
-- Loesung: trigger_notify_push_all droppen. Alle relevanten Trigger-Funktionen
-- (notify_new_listing_city, notify_new_event_city, notify_new_review etc.)
-- rufen schon notify_user_push direkt auf — der einzige sanktionierte Pfad.

drop trigger if exists trigger_notify_push_all on public.notifications;

-- Funktion belassen falls etwas anderes sie noch braucht (defensiv).
-- Der Trigger ist weg, also feuert sie nicht mehr automatisch.
