-- =============================================================
-- v2-Redesign des zentralen SQL-Mail-Templates email_template()
--
-- Bringt die Trigger-/RPC-Mails (via send_user_email) auf den
-- UniGoat-v2-Look: Archivo, eckig (Radius 0), 2px-Tinte-Linien,
-- Mint-CTA-Button, Masthead-Kopf. Ersetzt das alte blaue
-- "Room8"-Template. Signatur unveraendert -> alle Aufrufer laufen 1:1.
--
-- Hinweis: send-email erkennt volles <html> und wrappt NICHT erneut
-- (kein Doppel-Wrap). Sichtbarer Mail-Text = echte Umlaute.
-- Stand 2026-09-05
-- =============================================================

CREATE OR REPLACE FUNCTION public.email_template(
    headline text,
    body_html text,
    cta_text text DEFAULT NULL,
    cta_url text DEFAULT NULL
)
RETURNS text AS $$
DECLARE
    v_cta_html text := '';
BEGIN
    IF cta_text IS NOT NULL AND cta_url IS NOT NULL THEN
        v_cta_html := '<div style="margin:30px 0;">'
            || '<a href="' || cta_url || '" style="display:inline-block;padding:14px 28px;background:#12B489;color:#201e1d;text-decoration:none;font-weight:800;font-size:15px;font-family:Archivo,sans-serif;border-radius:0;">'
            || cta_text || '</a></div>';
    END IF;

    RETURN '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        || '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;800&display=swap" rel="stylesheet"></head>'
        || '<body style="margin:0;padding:0;background:#f3f2f2;font-family:Archivo,-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;color:#201e1d;">'
        || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2f2;padding:24px 12px;"><tr><td align="center">'
        || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:2px solid #201e1d;">'
        || '<tr><td style="padding:22px 24px 12px;"><div style="font-size:38px;font-weight:800;letter-spacing:-1.6px;line-height:.9;color:#201e1d;">UniGoat</div></td></tr>'
        || '<tr><td style="border-top:2px solid #201e1d;border-bottom:2px solid #201e1d;padding:9px 24px;">'
        ||   '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
        ||     '<td style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#201e1d;">Campus-Ausgabe</td>'
        ||     '<td align="right" style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0B6B52;">unigoat.de</td>'
        ||   '</tr></table></td></tr>'
        || '<tr><td style="padding:26px 24px 8px;color:#201e1d;font-size:16px;line-height:1.6;">'
        ||   '<h1 style="font-size:22px;color:#201e1d;margin:0 0 14px;font-weight:800;letter-spacing:-0.4px;line-height:1.1;">' || headline || '</h1>'
        ||   '<div style="color:#201e1d;font-size:16px;line-height:1.6;">' || body_html || '</div>'
        ||   v_cta_html
        || '</td></tr>'
        || '<tr><td style="padding:18px 24px 26px;"><div style="border-top:2px solid #201e1d;padding-top:16px;">'
        ||   '<div style="font-size:13px;color:#6f6a67;line-height:1.5;">UniGoat — Studentenrabatte, Coupons und der monatliche Goat-Wettkampf. Kostenlos und nur für verifizierte Studenten.</div>'
        ||   '<div style="font-size:12px;color:#8a8785;margin-top:12px;">UniGoat · <a href="https://www.unigoat.de" style="color:#0B6B52;text-decoration:none;font-weight:800;">unigoat.de</a></div>'
        || '</div></td></tr>'
        || '</table></td></tr></table></body></html>';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
