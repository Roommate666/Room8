-- Migration: Defensive Logging fuer alert_admin_* Triggers
--
-- Problem: Heute morgen hat send_admin_alert eine Exception geworfen (JOIN-Bug).
-- Die Trigger-Functions haben das per "exception when others then raise warning; return NEW"
-- geschluckt → Insert lief durch, User merkte nix, KEIN persistenter Log → wir blind.
--
-- Loesung: log_trigger_exception() Helper, der Exceptions in notification_logs persistiert.
-- Damit landen Trigger-Bugs zukuenftig im Push Health Tab + Health-Check Workflow.

-- =========================================================
-- 1. Helper
-- =========================================================
create or replace function public.log_trigger_exception(
    p_trigger_name text,
    p_error_msg text
) returns void
language sql
security definer
set search_path = public
as $$
    insert into public.notification_logs
        (channel, status, error_code, error_msg, title, metadata)
    values
        ('email', 'exception', 'trigger_failed',
         left(coalesce(p_error_msg, '<no msg>'), 500),
         'trigger:' || coalesce(p_trigger_name, '<unknown>'),
         jsonb_build_object('trigger_name', p_trigger_name));
$$;

revoke all on function public.log_trigger_exception(text, text) from public;
grant execute on function public.log_trigger_exception(text, text) to public;

-- =========================================================
-- 2. alert_admin_new_report — defensives Logging
-- =========================================================
create or replace function public.alert_admin_new_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_reporter_name text;
    v_body text;
    v_url text;
begin
    select coalesce(p.full_name, p.username, 'Unbekannt')
      into v_reporter_name
      from public.profiles p
     where p.id = NEW.reporter_id;

    v_body :=
        '<p><b>Typ:</b> ' || coalesce(NEW.reported_type, '?') || '</p>' ||
        '<p><b>Reporter:</b> ' || coalesce(v_reporter_name, 'Anonym') || '</p>' ||
        '<p><b>Grund:</b> ' || coalesce(NEW.reason, '—') || '</p>' ||
        case when NEW.description is not null and trim(NEW.description) != ''
             then '<p><b>Beschreibung:</b> ' || NEW.description || '</p>'
             else '' end ||
        '<p><b>Reported-ID:</b> <code>' || coalesce(NEW.reported_id::text, '?') || '</code></p>';

    v_url := 'https://www.room8.club/admin.html';

    perform public.send_admin_alert(
        '🚨 Neuer Report (' || coalesce(NEW.reported_type, '?') || ')',
        v_body, v_url, 'report'
    );
    return NEW;
exception when others then
    perform public.log_trigger_exception('alert_admin_new_report', sqlerrm);
    return NEW;
end;
$$;

-- =========================================================
-- 3. alert_admin_new_registration
-- =========================================================
create or replace function public.alert_admin_new_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_body text;
begin
    v_body :=
        '<p><b>User-ID:</b> <code>' || coalesce(NEW.id::text, '?') || '</code></p>' ||
        '<p><b>Username:</b> ' || coalesce(NEW.username, '—') || '</p>' ||
        '<p><b>Name:</b> ' || coalesce(NEW.full_name, '—') || '</p>' ||
        '<p><b>Stadt:</b> ' || coalesce(NEW.city, '—') || '</p>';

    perform public.send_admin_alert(
        '👤 Neue Registrierung: ' || coalesce(NEW.username, NEW.full_name, 'unbekannt'),
        v_body, 'https://www.room8.club/admin.html', 'registration'
    );
    return NEW;
exception when others then
    perform public.log_trigger_exception('alert_admin_new_registration', sqlerrm);
    return NEW;
end;
$$;

-- =========================================================
-- 4. alert_admin_new_verification
-- =========================================================
create or replace function public.alert_admin_new_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_username text;
    v_body text;
begin
    -- Nur status=pending → noch zu pruefen
    if NEW.status is distinct from 'pending' then
        return NEW;
    end if;

    select coalesce(p.username, p.full_name, 'unbekannt')
      into v_username
      from public.profiles p
     where p.id = NEW.user_id;

    v_body :=
        '<p><b>User:</b> ' || coalesce(v_username, '?') || '</p>' ||
        '<p><b>Typ:</b> ' || coalesce(NEW.verification_type, '?') || '</p>';

    begin
        perform public.send_admin_alert(
            '🎓 Neue Verifizierungs-Anfrage',
            v_body, 'https://www.room8.club/admin.html', 'verification'
        );
    exception when others then
        perform public.log_trigger_exception('alert_admin_new_verification', sqlerrm);
    end;
    return NEW;
exception when others then
    perform public.log_trigger_exception('alert_admin_new_verification', sqlerrm);
    return NEW;
end;
$$;

-- =========================================================
-- 5. alert_admin_new_partner_submission
-- =========================================================
create or replace function public.alert_admin_new_partner_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_body text;
begin
    if NEW.status is distinct from 'pending' then
        return NEW;
    end if;

    v_body :=
        '<p><b>Submission-ID:</b> <code>' || coalesce(NEW.id::text, '?') || '</code></p>' ||
        '<p><b>Typ:</b> ' || coalesce(NEW.submission_type, '?') || '</p>';

    begin
        perform public.send_admin_alert(
            '📦 Neue Partner-Submission',
            v_body, 'https://www.room8.club/admin.html', 'partner_submission'
        );
    exception when others then
        perform public.log_trigger_exception('alert_admin_new_partner_submission', sqlerrm);
    end;
    return NEW;
exception when others then
    perform public.log_trigger_exception('alert_admin_new_partner_submission', sqlerrm);
    return NEW;
end;
$$;

-- =========================================================
-- 6. alert_admin_new_event_request
-- =========================================================
create or replace function public.alert_admin_new_event_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_body text;
    v_username text;
begin
    if NEW.status is distinct from 'pending' then
        return NEW;
    end if;

    select coalesce(p.username, p.full_name, 'unbekannt')
      into v_username
      from public.profiles p
     where p.id = NEW.user_id;

    v_body :=
        '<p><b>User:</b> ' || coalesce(v_username, '?') || '</p>' ||
        '<p><b>Begruendung:</b> ' || coalesce(NEW.reason, '—') || '</p>';

    begin
        perform public.send_admin_alert(
            '🎉 Event-Creator Anfrage',
            v_body, 'https://www.room8.club/admin.html', 'event_creator_request'
        );
    exception when others then
        perform public.log_trigger_exception('alert_admin_new_event_request', sqlerrm);
    end;
    return NEW;
exception when others then
    perform public.log_trigger_exception('alert_admin_new_event_request', sqlerrm);
    return NEW;
end;
$$;

-- =========================================================
-- 7. alert_admin_new_contact_message
-- =========================================================
create or replace function public.alert_admin_new_contact_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_body text;
begin
    v_body :=
        '<p><b>Name:</b> ' || coalesce(NEW.name, '—') || '</p>' ||
        '<p><b>Email:</b> ' || coalesce(NEW.email, '—') || '</p>' ||
        '<p><b>Kategorie:</b> ' || coalesce(NEW.category, '—') || '</p>' ||
        '<p><b>Nachricht:</b><br><blockquote>' ||
            replace(coalesce(NEW.message, '—'), chr(10), '<br>') ||
        '</blockquote></p>';

    perform public.send_admin_alert(
        '📬 Neue Kontakt-Nachricht',
        v_body, 'https://www.room8.club/admin.html', 'contact_message'
    );
    return NEW;
exception when others then
    perform public.log_trigger_exception('alert_admin_new_contact_message', sqlerrm);
    return NEW;
end;
$$;
