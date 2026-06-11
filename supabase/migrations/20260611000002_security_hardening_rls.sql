-- =============================================================
-- PRE-LAUNCH SECURITY HARDENING (11.06.2026)
-- Audit-Befunde (alle live reproduziert, HTTP 204/206):
--   1. Privilege Escalation: jeder User konnte profiles.is_admin=true patchen
--      -> damit auch CV-Diebstahl ueber get-resume-url (is_admin-Check).
--   2. listings-Hijacking: Partner konnte fremde Inserate uebernehmen
--      (owner_id umschreiben), offline nehmen, umbenennen.
--   3. partner_submissions: fremde lesen + Self-Approve + Sabotage (Status).
--   4. event_interests global lesbar (wer ist wo angemeldet).
-- Ansatz: Trigger schuetzen Schreibrechte unabhaengig von Policy-Namen;
-- DO-Bloecke ersetzen offene SELECT-Policies dynamisch.
-- NICHT hier (separat, wegen Build-Bruch-Risiko): profiles-SELECT-Verschaerfung.
-- =============================================================

-- Helper: ist der aktuelle Aufrufer ein echter Admin? (SECURITY DEFINER -> RLS-bypass)
CREATE OR REPLACE FUNCTION public.is_caller_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
    SELECT coalesce((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;

-- ---------- 1. profiles: privilegierte Spalten gegen Self-Set schuetzen ----------
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- service_role (kein auth.uid) + echte Admins duerfen alles
    IF auth.uid() IS NULL OR public.is_caller_admin() THEN
        RETURN NEW;
    END IF;
    -- Normaler User: privilegierte Felder zwingend auf Altwert -> kein Self-Upgrade
    NEW.is_admin            := OLD.is_admin;
    NEW.is_partner          := OLD.is_partner;
    NEW.is_banned           := OLD.is_banned;
    NEW.banned_at           := OLD.banned_at;
    NEW.role                := OLD.role;
    NEW.trusted_organizer   := OLD.trusted_organizer;
    NEW.can_create_events   := OLD.can_create_events;
    NEW.partner_can_jobs    := OLD.partner_can_jobs;
    NEW.partner_can_coupons := OLD.partner_can_coupons;
    NEW.partner_can_events  := OLD.partner_can_events;
    NEW.is_verified         := OLD.is_verified;
    NEW.is_student_verified := OLD.is_student_verified;
    NEW.uni_email_verified  := OLD.uni_email_verified;
    NEW.verified_at         := OLD.verified_at;
    NEW.uni_email_verification_token := OLD.uni_email_verification_token;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_privileged_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_privileged_profile_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_privileged_profile_columns();

-- ---------- 2. listings: Owner-Schutz (kein Hijacking, owner_id fix) ----------
CREATE OR REPLACE FUNCTION public.protect_listing_ownership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_caller_admin() THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.owner_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'Kein Zugriff: fremdes Inserat';
        END IF;
        NEW.owner_id := OLD.owner_id;  -- owner_id nicht umschreibbar
    ELSIF TG_OP = 'INSERT' THEN
        NEW.owner_id := auth.uid();    -- nur im eigenen Namen anlegen
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_listing_ownership ON public.listings;
CREATE TRIGGER trg_protect_listing_ownership
    BEFORE INSERT OR UPDATE ON public.listings
    FOR EACH ROW EXECUTE FUNCTION public.protect_listing_ownership();

-- ---------- 3. partner_submissions: Status ist Admin-Hoheit ----------
CREATE OR REPLACE FUNCTION public.protect_partner_submissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        -- anon-Akquise: status immer pending erzwingen
        IF TG_OP = 'INSERT' THEN NEW.status := 'pending'; END IF;
        RETURN NEW;
    END IF;
    IF public.is_caller_admin() THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Einreichungen koennen nur von Admins bearbeitet werden';
    ELSIF TG_OP = 'INSERT' THEN
        NEW.submitter_id := auth.uid();  -- Identitaet erzwingen
        NEW.status := 'pending';         -- kein Self-Approve
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_partner_submissions ON public.partner_submissions;
CREATE TRIGGER trg_protect_partner_submissions
    BEFORE INSERT OR UPDATE ON public.partner_submissions
    FOR EACH ROW EXECUTE FUNCTION public.protect_partner_submissions();

-- SELECT: nur eigene Einreichungen + Admin (alle offenen SELECT-Policies entfernen)
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='partner_submissions' AND cmd='SELECT' LOOP
        EXECUTE format('DROP POLICY %I ON public.partner_submissions', r.policyname);
    END LOOP;
END $$;
CREATE POLICY partner_submissions_read_own ON public.partner_submissions
    FOR SELECT USING (submitter_id = auth.uid() OR public.is_caller_admin());

-- ---------- 4. event_interests: nicht mehr global lesbar ----------
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='event_interests' AND cmd='SELECT' LOOP
        EXECUTE format('DROP POLICY %I ON public.event_interests', r.policyname);
    END LOOP;
END $$;
CREATE POLICY event_interests_read_scoped ON public.event_interests
    FOR SELECT USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_interests.event_id AND e.organizer_id = auth.uid())
        OR public.is_caller_admin()
    );
