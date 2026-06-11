-- =============================================================
-- PARTNER SELF-SERVICE: eigene Live-Inhalte pausieren/aktivieren (11.06.2026)
-- WICHTIG-Liste (c) aus Pre-Launch-Audit:
--   Partner konnte eigene Live-Inhalte nicht deaktivieren (read-only).
-- Yusuf-Entscheidung: Submit-to-Admin-Modell -> Partner DARF eigene
--   bereits-live Inhalte pausieren (Qualitaet/Kuratierung bleibt, weil
--   neue Inhalte weiter ueber Admin-Freigabe laufen).
--
-- Ansatz: EINE SECURITY-DEFINER-RPC mit hartem Owner-Check statt breite
--   UPDATE-Policies zu oeffnen. Setzt je Typ das korrekte Deaktiv-Feld:
--     listing -> is_active            (true/false)
--     coupon  -> status               ('active'/'inactive')
--     event   -> status               ('active'/'cancelled')
-- =============================================================

CREATE OR REPLACE FUNCTION public.partner_set_content_active(
    p_type   text,
    p_id     uuid,
    p_active boolean
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid     uuid := auth.uid();
    v_admin   boolean := public.is_caller_admin();
    v_owner   uuid;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Nicht angemeldet';
    END IF;

    IF p_type = 'listing' THEN
        SELECT owner_id INTO v_owner FROM public.listings WHERE id = p_id;
        IF v_owner IS NULL THEN RAISE EXCEPTION 'Inhalt nicht gefunden'; END IF;
        IF v_owner <> v_uid AND NOT v_admin THEN RAISE EXCEPTION 'Kein Zugriff'; END IF;
        UPDATE public.listings SET is_active = p_active WHERE id = p_id;

    ELSIF p_type = 'coupon' THEN
        SELECT user_id INTO v_owner FROM public.coupons WHERE id = p_id;
        IF v_owner IS NULL THEN RAISE EXCEPTION 'Inhalt nicht gefunden'; END IF;
        IF v_owner <> v_uid AND NOT v_admin THEN RAISE EXCEPTION 'Kein Zugriff'; END IF;
        UPDATE public.coupons
           SET status = CASE WHEN p_active THEN 'active' ELSE 'inactive' END
         WHERE id = p_id;

    ELSIF p_type = 'event' THEN
        SELECT organizer_id INTO v_owner FROM public.events WHERE id = p_id;
        IF v_owner IS NULL THEN RAISE EXCEPTION 'Inhalt nicht gefunden'; END IF;
        IF v_owner <> v_uid AND NOT v_admin THEN RAISE EXCEPTION 'Kein Zugriff'; END IF;
        UPDATE public.events
           SET status = CASE WHEN p_active THEN 'active' ELSE 'cancelled' END
         WHERE id = p_id;

    ELSE
        RAISE EXCEPTION 'Unbekannter Typ: %', p_type;
    END IF;

    RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.partner_set_content_active(text, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_set_content_active(text, uuid, boolean) TO authenticated;
