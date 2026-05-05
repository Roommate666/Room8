-- Migration: event_interests RLS haerten.
--
-- Vorher: USING (true) — jeder anon konnte (event_id, user_id, interested_at)
-- Tupel auslesen. Privacy-Leak / Stalking-Vector.
--
-- Nachher:
--   - User darf seine EIGENEN Interests lesen
--   - Event-Organizer darf Interests fuer SEINE Events lesen
--   - Anon darf nichts mehr lesen
--
-- Public-Counter ("X Personen interessiert") muessen ueber Aggregat-RPC
-- bezogen werden — NICHT direkt aus event_interests.

drop policy if exists "event_interests_public_read" on public.event_interests;

create policy "event_interests_self_or_organizer_read" on public.event_interests
    for select
    using (
        auth.uid() = user_id
        or exists (
            select 1 from public.events e
             where e.id = event_interests.event_id
               and e.organizer_id = auth.uid()
        )
    );

-- Public Aggregat-Function: jeder authenticated darf den Count abfragen,
-- aber nicht die User-IDs.
create or replace function public.count_event_interests(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
    select count(*)::int
      from public.event_interests
     where event_id = p_event_id;
$$;

grant execute on function public.count_event_interests(uuid) to anon, authenticated;
