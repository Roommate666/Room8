-- =============================================================
-- Partner-Einreichungs-Mail mit ALLEN relevanten Infos (typ-spezifisch)
-- damit das Team direkt aus der Mail entscheiden kann (ohne Admin-Panel).
-- Mail an partner@room8.club.
-- Stand 2026-06-09
-- =============================================================
CREATE OR REPLACE FUNCTION public.notify_admin_new_submission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_label text; v_name text; v_url text; v_rows text := '';
    FUNCTION_row text;
BEGIN
    v_label := CASE NEW.submission_type WHEN 'job' THEN 'Job' WHEN 'coupon' THEN 'Coupon' WHEN 'event' THEN 'Event' ELSE 'Eintrag' END;
    v_name := coalesce(nullif(NEW.title,''), nullif(NEW.business_name,''), v_label);

    -- Hilfs-Zeilen-Builder (nur nicht-leere Felder)
    v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Betrieb</td><td style="padding:4px 10px;"><b>'||nullif(NEW.business_name,'')||'</b></td></tr>','');
    v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Titel</td><td style="padding:4px 10px;">'||nullif(NEW.title,'')||'</td></tr>','');
    v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Stadt</td><td style="padding:4px 10px;">'||nullif(NEW.city,'')||'</td></tr>','');
    v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Beschreibung</td><td style="padding:4px 10px;">'||nullif(NEW.description,'')||'</td></tr>','');
    -- Coupon-Felder
    IF NEW.submission_type = 'coupon' THEN
        v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Rabatt</td><td style="padding:4px 10px;">'||nullif(NEW.discount_value,'')||'</td></tr>','');
        v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Kategorie</td><td style="padding:4px 10px;">'||nullif(NEW.category,'')||'</td></tr>','');
        v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Bedingungen</td><td style="padding:4px 10px;">'||nullif(NEW.terms,'')||'</td></tr>','');
        v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Adresse</td><td style="padding:4px 10px;">'||nullif(NEW.address,'')||'</td></tr>','');
        v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Oeffnungszeiten</td><td style="padding:4px 10px;">'||nullif(NEW.opening_hours,'')||'</td></tr>','');
    ELSIF NEW.submission_type = 'job' THEN
        v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Job-Art</td><td style="padding:4px 10px;">'||nullif(NEW.job_type,'')||'</td></tr>','');
        v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Verguetung</td><td style="padding:4px 10px;">'||nullif(NEW.salary,'')||'</td></tr>','');
        v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Stunden</td><td style="padding:4px 10px;">'||nullif(NEW.hours,'')||'</td></tr>','');
        v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Anforderungen</td><td style="padding:4px 10px;">'||nullif(NEW.requirements,'')||'</td></tr>','');
        v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Bewerbung</td><td style="padding:4px 10px;">'||coalesce(nullif(NEW.application_email,''), nullif(NEW.application_url,''))||'</td></tr>','');
    ELSIF NEW.submission_type = 'event' THEN
        v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Beginn</td><td style="padding:4px 10px;">'||NEW.start_at::text||'</td></tr>','');
        v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Ort</td><td style="padding:4px 10px;">'||nullif(NEW.location,'')||'</td></tr>','');
    END IF;
    -- Kontakt
    v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Kontakt</td><td style="padding:4px 10px;"><a href="mailto:'||nullif(NEW.contact_email,'')||'">'||nullif(NEW.contact_email,'')||'</a></td></tr>','');
    v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Website</td><td style="padding:4px 10px;">'||nullif(NEW.website, nullif(NEW.company_website,''))||'</td></tr>','');
    v_rows := v_rows || coalesce('<tr><td style="padding:4px 10px;color:#6b7280;">Telefon</td><td style="padding:4px 10px;">'||nullif(NEW.phone,'')||'</td></tr>','');

    v_url := coalesce(current_setting('app.supabase_url', true),'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
    PERFORM net.http_post(
        url := v_url, headers := public.app_internal_headers(),
        body := jsonb_build_object(
            'to','partner@room8.club',
            'subject','Neue '||v_label||'-Einreichung: '||v_name,
            'html','<h2>Neue '||v_label||'-Einreichung</h2>'
                || '<table style="width:100%;border-collapse:collapse;font-size:14px;">'||v_rows||'</table>'
                || '<p style="margin-top:16px;">Im Panel pruefen + freigeben: <a href="https://www.room8.club/admin.html">admin.html</a></p>'
        )
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admin_new_submission failed: %', sqlerrm;
    RETURN NEW;
END;
$$;
