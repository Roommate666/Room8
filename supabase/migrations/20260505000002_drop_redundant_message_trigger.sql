-- Doppel-Push-Bug bei Chat-Messages: Es gibt zwei aktive Trigger auf
-- public.messages die beide notify_new_message() aufrufen:
--   1. on_new_message (alt, Mig 20260219031000_chat_push_trigger)
--   2. notify_new_message_trigger (neu, Mig 20260428000014_notification_routing)
--
-- Ergebnis: Jeder Chat-INSERT loest 2 identische Pushes aus, was die User
-- als Doppel-Banner sehen.
--
-- Loesung: Alten Trigger droppen, der neue (notify_new_message_trigger) bleibt
-- als kanonischer Pfad.

drop trigger if exists on_new_message on public.messages;

-- Auch eine Diag-View ergaenzen damit wir zukuenftige Doppel-Trigger
-- ohne Migration entdecken koennen.
create or replace view public.diag_messages_triggers as
select tgname as trigger_name,
       pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.messages'::regclass
  and not tgisinternal;

grant select on public.diag_messages_triggers to authenticated, service_role;
