-- Benachrichtigung an den Partner bei Genehmigung/Ablehnung seiner Einreichung.
--
-- Vorher: approveSubmission/rejectSubmission (admin.html) setzten nur den Status.
-- Der Partner erfuhr von der Entscheidung nur, wenn er selbst ins Dashboard schaute.
--
-- Jetzt: Trigger auf partner_submissions feuert beim Wechsel pending -> approved/
-- rejected und benachrichtigt den Einreicher:
--   - Eingeloggter Partner (submitter_id gesetzt): In-App-Notification (Bell) + Push.
--   - Anon-Akquise (nur contact_email, kein Account): E-Mail.
-- Folgt dem etablierten Muster (notify_user_push + app_internal_headers aus
-- Mig 20260504000001). SECURITY DEFINER, fehlertolerant (blockt den Status-Update nie).

create or replace function public.notify_partner_submission_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_label text;
    v_name  text;
    v_title text;
    v_msg   text;
    v_link  text := 'partner-dashboard.html';
    v_url   text;
begin
    -- Nur echter Statuswechsel von pending -> approved/rejected
    if NEW.status = OLD.status or OLD.status <> 'pending'
       or NEW.status not in ('approved', 'rejected') then
        return NEW;
    end if;

    v_label := case NEW.submission_type
        when 'job'    then 'Job'
        when 'coupon' then 'Coupon'
        when 'event'  then 'Event'
        else 'Eintrag' end;
    v_name := coalesce(nullif(NEW.title, ''), nullif(NEW.business_name, ''), v_label);

    if NEW.status = 'approved' then
        v_title := '✅ ' || v_label || ' genehmigt';
        v_msg   := 'Dein ' || v_label || ' "' || v_name || '" ist jetzt live in der App.';
    else
        v_title := '❌ ' || v_label || ' abgelehnt';
        v_msg   := 'Dein ' || v_label || ' "' || v_name || '" wurde nicht freigegeben.'
                || case when coalesce(NEW.admin_notes, '') <> ''
                        then ' Hinweis: ' || NEW.admin_notes else '' end;
    end if;

    -- 1. Eingeloggter Partner: In-App-Notification (Bell) + Push
    if NEW.submitter_id is not null then
        insert into public.notifications (user_id, type, title, message, link, is_read)
        values (NEW.submitter_id, 'partner_review', v_title, v_msg, v_link, false);

        perform public.notify_user_push(
            NEW.submitter_id,
            'partner_review',
            v_title,
            v_msg,
            jsonb_build_object('url', v_link, 'ref_id', 'psub_' || NEW.id::text)
        );

    -- 2. Anon-Akquise (kein Account): E-Mail an contact_email
    elsif coalesce(NEW.contact_email, '') <> '' then
        v_url := coalesce(current_setting('app.supabase_url', true),
                          'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
        perform net.http_post(
            url     := v_url,
            headers := public.app_internal_headers(),
            body    := jsonb_build_object(
                'to',      NEW.contact_email,
                'subject', v_title || ' - Room8',
                'html',    '<h2>' || v_title || '</h2><p>' || v_msg || '</p>'
                        || '<p>Schau in der Room8-App vorbei: <a href="https://www.room8.club">room8.club</a></p>'
            )
        );
    end if;

    return NEW;
exception when others then
    -- Benachrichtigung darf den Status-Update niemals blockieren
    raise warning 'notify_partner_submission_review failed: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_partner_submission_review on public.partner_submissions;
create trigger trg_notify_partner_submission_review
    after update on public.partner_submissions
    for each row
    execute function public.notify_partner_submission_review();
