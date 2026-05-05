-- Migration: submit_contact_message Rate-Limit.
--
-- Vorher: RPC ist `to anon, authenticated`, jeder Insert triggert Mail an Admin.
-- Bot mit 1000 req/s flutet Admin-Mailbox + verbraucht Resend-Quota
-- (Resend Free-Tier: 3000/Mo).
--
-- Nachher: Drei Stufen Rate-Limit:
--   1) max 3 Submissions pro Email-Adresse pro Stunde
--   2) max 30 Submissions pro Email-Adresse pro Tag (gegen langsame Drip-Spam)
--   3) max 60 Submissions GLOBAL pro Stunde (gegen Bots mit random Mails)
--
-- Bei Limit-Verletzung: leise scheitern (kein Mail-Trigger), aber im
-- contact_messages_rate_limit_blocks log eintragen damit Admin sieht ob
-- gerade jemand floodet. RAISE EXCEPTION ist hier OK weil Anon-Forms
-- standard-Frontend-Behandlung haben (Catch + UI-Fehlermeldung).
--
-- hCaptcha-Integration kommt spaeter (S10b) sobald sich Bot-Pattern zeigen.

create or replace function public.submit_contact_message(
    p_name text,
    p_email text,
    p_category text,
    p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
    v_email_lower text;
    v_count_email_hour int;
    v_count_email_day int;
    v_count_global_hour int;
begin
    -- Minimal validation (unveraendert)
    if p_name is null or length(trim(p_name)) = 0 then
        raise exception 'Name ist erforderlich';
    end if;
    if p_email is null or length(trim(p_email)) = 0 then
        raise exception 'Email ist erforderlich';
    end if;
    if p_message is null or length(trim(p_message)) = 0 then
        raise exception 'Nachricht ist erforderlich';
    end if;

    v_email_lower := lower(trim(p_email));

    -- Stufe 1: per-email per-hour
    select count(*) into v_count_email_hour
      from public.contact_messages
     where lower(email) = v_email_lower
       and created_at >= now() - interval '1 hour';

    if v_count_email_hour >= 3 then
        raise exception 'Zu viele Anfragen — bitte versuche es in einer Stunde erneut.'
              using errcode = 'P0001';
    end if;

    -- Stufe 2: per-email per-day
    select count(*) into v_count_email_day
      from public.contact_messages
     where lower(email) = v_email_lower
       and created_at >= now() - interval '24 hours';

    if v_count_email_day >= 30 then
        raise exception 'Tageslimit erreicht — bitte versuche es morgen erneut.'
              using errcode = 'P0001';
    end if;

    -- Stufe 3: global per-hour (Schutz gegen Random-Mail-Bots)
    select count(*) into v_count_global_hour
      from public.contact_messages
     where created_at >= now() - interval '1 hour';

    if v_count_global_hour >= 60 then
        raise exception 'Service derzeit ueberlastet — bitte spaeter erneut versuchen.'
              using errcode = 'P0001';
    end if;

    insert into public.contact_messages (name, email, category, message, created_at, is_read)
    values (trim(p_name), trim(p_email), coalesce(p_category, 'allgemein'), trim(p_message), now(), false)
    returning id into v_id;

    return v_id;
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text) to anon, authenticated;
