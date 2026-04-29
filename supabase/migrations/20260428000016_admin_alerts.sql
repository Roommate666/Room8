-- Migration: Admin-Email-Alerts bei kritischen Events
--
-- Bei Reports, Verifizierungs-Anfragen, Partner-Submissions, Event-Antraegen,
-- Kontakt-Nachrichten und neuen Registrierungen bekommen alle is_admin=true
-- Profile eine Email an ihre auth.users.email Adresse.
--
-- Helper: public.send_admin_alert(subject, body_html, cta_url?)
-- Trigger: 6 (reports, profiles INSERT, verifications, partner_submissions,
--           event_creator_requests, contact_messages)
--
-- Rate-Limit: max 10 Admin-Mails pro Subject-Type pro Stunde
-- (verhindert Mass-Spam wenn ein Bot 1000 Reports schickt).
--
-- AI-LOCK: send_admin_alert ist der einzige sanktionierte Weg Admin-Emails
-- aus Triggern zu senden. Spec: specs/push-and-email.md.

-- =========================================================
-- 1. send_admin_alert(subject, body_html, cta_url?, subject_type?) Helper
-- =========================================================
-- Holt alle is_admin=true Profile, ruft send-email Edge Function fuer jeden auf.
-- Rate-Limit: max 10 Mails pro subject_type pro Stunde (verhindert Mass-Spam).
-- Subject-Prefix '[Room8 Admin]' wird automatisch ergaenzt.
create or replace function public.send_admin_alert(
    p_subject  text,
    p_body_html text,
    p_cta_url  text default null,
    p_subject_type text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    admin_record record;
    v_url text;
    v_mail_html text;
    v_recent_count int;
    v_full_subject text;
begin
    v_full_subject := '[Room8 Admin] ' || p_subject;

    -- Rate-Limit ueber notification_logs.title (Subject-Match per Type)
    if p_subject_type is not null then
        select count(*) into v_recent_count
          from public.notification_logs
         where channel = 'email'
           and status = 'success'
           and metadata->>'admin_alert_type' = p_subject_type
           and created_at >= now() - interval '1 hour';

        if v_recent_count >= 10 then
            return;  -- Drosselung
        end if;
    end if;

    v_url := coalesce(
        current_setting('app.supabase_url', true),
        'https://tvnvmogaqmduzcycmvby.supabase.co'
    ) || '/functions/v1/send-email';

    -- HTML-Body via email_template-Helper (falls vorhanden), sonst Plain-HTML
    begin
        v_mail_html := public.email_template(
            p_subject,
            p_body_html,
            case when p_cta_url is not null then 'Im Admin-Panel oeffnen' else null end,
            p_cta_url
        );
    exception when others then
        v_mail_html := '<h2>' || p_subject || '</h2>' || p_body_html
                    || case when p_cta_url is not null
                            then '<p><a href="' || p_cta_url || '">Im Admin-Panel oeffnen</a></p>'
                            else '' end;
    end;

    for admin_record in
        select u.email
          from public.profiles p
          join auth.users u on u.id = p.id
         where p.is_admin = true
           and u.email is not null
           and u.email != ''
    loop
        begin
            perform net.http_post(
                url := v_url,
                headers := jsonb_build_object('Content-Type', 'application/json'),
                body := jsonb_build_object(
                    'to',      admin_record.email,
                    'subject', v_full_subject,
                    'html',    v_mail_html,
                    'data',    jsonb_build_object('admin_alert_type', coalesce(p_subject_type, 'unknown'))
                )
            );
        exception when others then
            raise warning 'send_admin_alert pg_net failed for %: %',
                admin_record.email, sqlerrm;
        end;
    end loop;
end;
$$;

revoke all on function public.send_admin_alert(text, text, text, text) from public;
grant execute on function public.send_admin_alert(text, text, text, text) to service_role;

-- =========================================================
-- 2. Trigger: reports → "🚨 Neuer Report"
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
    raise warning 'alert_admin_new_report failed: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists alert_admin_new_report on public.reports;
create trigger alert_admin_new_report
    after insert on public.reports
    for each row execute function public.alert_admin_new_report();

-- =========================================================
-- 3. Trigger: profiles → "👤 Neue Registrierung"
-- =========================================================
create or replace function public.alert_admin_new_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text;
    v_body text;
begin
    select email into v_email from auth.users where id = NEW.id;

    v_body :=
        '<p><b>Username:</b> ' || coalesce(NEW.username, '—') || '</p>' ||
        '<p><b>Name:</b> ' || coalesce(NEW.full_name, '—') || '</p>' ||
        '<p><b>Email:</b> ' || coalesce(v_email, '—') || '</p>' ||
        '<p><b>Stadt:</b> ' || coalesce(NEW.city, '—') || '</p>' ||
        '<p><b>User-ID:</b> <code>' || NEW.id::text || '</code></p>';

    perform public.send_admin_alert(
        '👤 Neue Registrierung: ' || coalesce(NEW.username, NEW.full_name, v_email, 'Unbekannt'),
        v_body, 'https://www.room8.club/admin.html', 'registration'
    );
    return NEW;
exception when others then
    raise warning 'alert_admin_new_registration failed: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists alert_admin_new_registration on public.profiles;
create trigger alert_admin_new_registration
    after insert on public.profiles
    for each row execute function public.alert_admin_new_registration();

-- =========================================================
-- 4. Trigger: verifications → "🎓 Verifizierungs-Anfrage"
-- =========================================================
-- Defensiv: Wenn Tabelle nicht existiert, schluckt's der DO-Block.
do $$
begin
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name='verifications') then

        execute $func$
        create or replace function public.alert_admin_new_verification()
        returns trigger
        language plpgsql
        security definer
        set search_path = public
        as $body$
        declare
            v_username text;
            v_body text;
        begin
            select coalesce(p.username, p.full_name, 'Unbekannt') into v_username
              from public.profiles p where p.id = NEW.user_id;

            v_body := '<p>Eine neue Verifizierungs-Anfrage wartet auf Pruefung.</p>'
                  || '<p><b>User:</b> ' || coalesce(v_username, '—') || '</p>'
                  || '<p><b>User-ID:</b> <code>' || coalesce(NEW.user_id::text, '?') || '</code></p>';

            perform public.send_admin_alert(
                '🎓 Neue Verifizierungs-Anfrage',
                v_body, 'https://www.room8.club/admin.html', 'verification'
            );
            return NEW;
        exception when others then
            raise warning 'alert_admin_new_verification failed: %', sqlerrm;
            return NEW;
        end;
        $body$;
        $func$;

        execute 'drop trigger if exists alert_admin_new_verification on public.verifications';
        execute 'create trigger alert_admin_new_verification
                 after insert on public.verifications
                 for each row execute function public.alert_admin_new_verification()';
    end if;
end;
$$;

-- =========================================================
-- 5. Trigger: partner_submissions → "🤝 Partner-Submission"
-- =========================================================
do $$
begin
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name='partner_submissions') then

        execute $func$
        create or replace function public.alert_admin_new_partner_submission()
        returns trigger
        language plpgsql
        security definer
        set search_path = public
        as $body$
        declare v_body text;
        begin
            v_body := '<p>Eine neue Partner-Submission wurde eingereicht.</p>';
            perform public.send_admin_alert(
                '🤝 Neue Partner-Submission',
                v_body, 'https://www.room8.club/admin.html', 'partner_submission'
            );
            return NEW;
        exception when others then
            raise warning 'alert_admin_new_partner_submission failed: %', sqlerrm;
            return NEW;
        end;
        $body$;
        $func$;

        execute 'drop trigger if exists alert_admin_new_partner_submission on public.partner_submissions';
        execute 'create trigger alert_admin_new_partner_submission
                 after insert on public.partner_submissions
                 for each row execute function public.alert_admin_new_partner_submission()';
    end if;
end;
$$;

-- =========================================================
-- 6. Trigger: event_creator_requests → "🔓 Event-Antrag"
-- =========================================================
do $$
begin
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name='event_creator_requests') then

        execute $func$
        create or replace function public.alert_admin_new_event_request()
        returns trigger
        language plpgsql
        security definer
        set search_path = public
        as $body$
        declare
            v_username text;
            v_body text;
        begin
            select coalesce(p.username, p.full_name, 'Unbekannt') into v_username
              from public.profiles p where p.id = NEW.user_id;

            v_body :=
                '<p><b>User:</b> ' || coalesce(v_username, '—') || '</p>' ||
                '<p><b>Organisation:</b> ' || coalesce(NEW.organization_name, '—') || '</p>';

            perform public.send_admin_alert(
                '🔓 Neuer Event-Creator-Antrag',
                v_body, 'https://www.room8.club/admin.html', 'event_request'
            );
            return NEW;
        exception when others then
            raise warning 'alert_admin_new_event_request failed: %', sqlerrm;
            return NEW;
        end;
        $body$;
        $func$;

        execute 'drop trigger if exists alert_admin_new_event_request on public.event_creator_requests';
        execute 'create trigger alert_admin_new_event_request
                 after insert on public.event_creator_requests
                 for each row execute function public.alert_admin_new_event_request()';
    end if;
end;
$$;

-- =========================================================
-- 7. Trigger: contact_messages → "📬 Kontakt-Nachricht"
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
    raise warning 'alert_admin_new_contact_message failed: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists alert_admin_new_contact_message on public.contact_messages;
create trigger alert_admin_new_contact_message
    after insert on public.contact_messages
    for each row execute function public.alert_admin_new_contact_message();

