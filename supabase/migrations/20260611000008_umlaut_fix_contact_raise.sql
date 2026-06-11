-- =============================================================
-- Echte Umlaute in user-facing RAISE (11.06.2026, Runde 2)
-- submit_contact_message: die globale Rate-Limit-Fehlermeldung zeigte
-- "ueberlastet"/"spaeter" statt "überlastet"/"später". Diese Meldung
-- landet via Frontend-Catch direkt im UI des Nutzers.
-- Funktion 1:1 aus 20260504000006 uebernommen, nur der RAISE-Text korrigiert.
-- =============================================================

CREATE OR REPLACE FUNCTION public.submit_contact_message(
    p_name text,
    p_email text,
    p_category text,
    p_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
    v_id uuid;
    v_email_lower text;
    v_count_email_hour int;
    v_count_email_day int;
    v_count_global_hour int;
begin
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

    select count(*) into v_count_email_hour
      from public.contact_messages
     where lower(email) = v_email_lower
       and created_at >= now() - interval '1 hour';
    if v_count_email_hour >= 3 then
        raise exception 'Zu viele Anfragen — bitte versuche es in einer Stunde erneut.'
              using errcode = 'P0001';
    end if;

    select count(*) into v_count_email_day
      from public.contact_messages
     where lower(email) = v_email_lower
       and created_at >= now() - interval '24 hours';
    if v_count_email_day >= 30 then
        raise exception 'Tageslimit erreicht — bitte versuche es morgen erneut.'
              using errcode = 'P0001';
    end if;

    select count(*) into v_count_global_hour
      from public.contact_messages
     where created_at >= now() - interval '1 hour';
    if v_count_global_hour >= 60 then
        raise exception 'Service derzeit überlastet — bitte später erneut versuchen.'
              using errcode = 'P0001';
    end if;

    insert into public.contact_messages (name, email, category, message, created_at, is_read)
    values (trim(p_name), trim(p_email), coalesce(p_category, 'allgemein'), trim(p_message), now(), false)
    returning id into v_id;

    return v_id;
end;
$$;
