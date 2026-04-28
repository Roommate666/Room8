-- =============================================================
-- Events Feature: Tabellen, RLS, Storage, Trigger
-- Stand 2026-04-28
-- =============================================================

-- =============================================================
-- TABELLE: events
-- =============================================================
CREATE TABLE IF NOT EXISTS public.events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    location text,
    address text,
    city text,
    start_at timestamptz NOT NULL,
    end_at timestamptz,
    category text DEFAULT 'other',
    organizer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    organizer_name text,
    organizer_type text DEFAULT 'student',
    cover_image_path text,
    external_url text,
    price numeric,
    max_participants integer,
    status text DEFAULT 'active',
    is_official boolean DEFAULT false,
    view_count integer DEFAULT 0,
    interest_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT events_status_check CHECK (status IN ('active', 'cancelled', 'past', 'draft')),
    CONSTRAINT events_category_check CHECK (category IN ('party', 'lecture', 'workshop', 'sport', 'culture', 'networking', 'food', 'other')),
    CONSTRAINT events_organizer_type_check CHECK (organizer_type IN ('student', 'university', 'asta', 'partner', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_events_start ON public.events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_city ON public.events(city);
CREATE INDEX IF NOT EXISTS idx_events_category ON public.events(category);
CREATE INDEX IF NOT EXISTS idx_events_organizer ON public.events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);

-- =============================================================
-- TABELLE: event_interests (User markieren "Ich gehe hin")
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event_interests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status text DEFAULT 'going',
    created_at timestamptz DEFAULT now(),
    UNIQUE(event_id, user_id),
    CONSTRAINT event_interests_status_check CHECK (status IN ('going', 'interested', 'not_going'))
);

CREATE INDEX IF NOT EXISTS idx_event_interests_event ON public.event_interests(event_id);
CREATE INDEX IF NOT EXISTS idx_event_interests_user ON public.event_interests(user_id);

-- =============================================================
-- RLS POLICIES
-- =============================================================
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_interests ENABLE ROW LEVEL SECURITY;

-- Events sind oeffentlich lesbar (active oder past)
DROP POLICY IF EXISTS "events_public_read" ON public.events;
CREATE POLICY "events_public_read" ON public.events
    FOR SELECT USING (status IN ('active', 'past'));

-- Verifizierte User koennen Events erstellen
DROP POLICY IF EXISTS "events_verified_insert" ON public.events;
CREATE POLICY "events_verified_insert" ON public.events
    FOR INSERT WITH CHECK (
        auth.uid() = organizer_id
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND (is_verified = true OR is_student_verified = true)
        )
    );

-- Organizer kann eigene Events bearbeiten
-- WITH CHECK verhindert Ownership-Hijack (organizer_id darf nicht geaendert werden)
DROP POLICY IF EXISTS "events_organizer_update" ON public.events;
CREATE POLICY "events_organizer_update" ON public.events
    FOR UPDATE USING (auth.uid() = organizer_id)
    WITH CHECK (auth.uid() = organizer_id);

-- Organizer kann eigene Events loeschen
DROP POLICY IF EXISTS "events_organizer_delete" ON public.events;
CREATE POLICY "events_organizer_delete" ON public.events
    FOR DELETE USING (auth.uid() = organizer_id);

-- Admin kann alle Events bearbeiten (z.B. is_official setzen)
DROP POLICY IF EXISTS "events_admin_all" ON public.events;
CREATE POLICY "events_admin_all" ON public.events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- Event Interests
DROP POLICY IF EXISTS "event_interests_public_read" ON public.event_interests;
CREATE POLICY "event_interests_public_read" ON public.event_interests
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "event_interests_self_insert" ON public.event_interests;
CREATE POLICY "event_interests_self_insert" ON public.event_interests
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "event_interests_self_update" ON public.event_interests;
CREATE POLICY "event_interests_self_update" ON public.event_interests
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "event_interests_self_delete" ON public.event_interests;
CREATE POLICY "event_interests_self_delete" ON public.event_interests
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================================
-- STORAGE: event-images Bucket
-- =============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "event_images_public_read" ON storage.objects;
CREATE POLICY "event_images_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'event-images');

DROP POLICY IF EXISTS "event_images_verified_upload" ON storage.objects;
CREATE POLICY "event_images_verified_upload" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'event-images'
        AND auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND (is_verified = true OR is_student_verified = true)
        )
    );

DROP POLICY IF EXISTS "event_images_owner_delete" ON storage.objects;
CREATE POLICY "event_images_owner_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'event-images'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- =============================================================
-- TRIGGER: updated_at automatisch aktualisieren
-- =============================================================
CREATE OR REPLACE FUNCTION public.update_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_updated_at ON public.events;
CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.update_events_updated_at();

-- =============================================================
-- TRIGGER: interest_count auf events automatisch aktualisieren
-- =============================================================
CREATE OR REPLACE FUNCTION public.update_event_interest_count()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.status = 'going') THEN
        UPDATE public.events
        SET interest_count = interest_count + 1
        WHERE id = NEW.event_id;
    ELSIF (TG_OP = 'DELETE' AND OLD.status = 'going') THEN
        UPDATE public.events
        SET interest_count = GREATEST(interest_count - 1, 0)
        WHERE id = OLD.event_id;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.status = 'going' AND NEW.status <> 'going') THEN
            UPDATE public.events
            SET interest_count = GREATEST(interest_count - 1, 0)
            WHERE id = NEW.event_id;
        ELSIF (OLD.status <> 'going' AND NEW.status = 'going') THEN
            UPDATE public.events
            SET interest_count = interest_count + 1
            WHERE id = NEW.event_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_interest_count ON public.event_interests;
CREATE TRIGGER trg_event_interest_count
    AFTER INSERT OR UPDATE OR DELETE ON public.event_interests
    FOR EACH ROW EXECUTE FUNCTION public.update_event_interest_count();

-- =============================================================
-- TRIGGER: Vergangene Events automatisch auf 'past' setzen
-- (wird via cron/edge-function getriggered, hier nur Helper)
-- =============================================================
CREATE OR REPLACE FUNCTION public.mark_past_events()
RETURNS void AS $$
BEGIN
    UPDATE public.events
    SET status = 'past'
    WHERE status = 'active'
    AND COALESCE(end_at, start_at + interval '4 hours') < now();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE public.events IS 'Uni-Events, AStA-Events und Studenten-Events';
COMMENT ON COLUMN public.events.is_official IS 'Nur Admin kann setzen - markiert offizielle Uni/AStA Events';
COMMENT ON COLUMN public.events.organizer_type IS 'student, university, asta, partner, admin';

-- =============================================================
-- TRIGGER: is_official Schutz (nur Admin darf setzen)
-- Verhindert dass normale User beim INSERT/UPDATE is_official=true
-- mitschicken und sich als "offiziell" ausgeben
-- =============================================================
CREATE OR REPLACE FUNCTION public.protect_events_admin_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    SELECT COALESCE(is_admin, false) INTO v_is_admin
    FROM public.profiles WHERE id = auth.uid();

    IF NOT v_is_admin THEN
        IF TG_OP = 'INSERT' THEN
            NEW.is_official := false;
            NEW.organizer_type := COALESCE(NEW.organizer_type, 'student');
            -- Nicht-Admin darf keine privilegierten organizer_types setzen
            IF NEW.organizer_type IN ('university', 'asta', 'admin') THEN
                NEW.organizer_type := 'student';
            END IF;
        ELSIF TG_OP = 'UPDATE' THEN
            NEW.is_official := OLD.is_official;
            NEW.organizer_type := OLD.organizer_type;
            NEW.view_count := OLD.view_count;
            NEW.interest_count := OLD.interest_count;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_events_admin_protect ON public.events;
CREATE TRIGGER trg_events_admin_protect
    BEFORE INSERT OR UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.protect_events_admin_fields();

-- =============================================================
-- RPC: Atomarer view_count-Increment
-- Statt Client-UPDATE (von RLS geblockt + Race-anfaellig) nutzen
-- Clients diese SECURITY DEFINER Funktion
-- =============================================================
CREATE OR REPLACE FUNCTION public.increment_event_view(event_id_input uuid)
RETURNS void AS $$
BEGIN
    UPDATE public.events
    SET view_count = view_count + 1
    WHERE id = event_id_input
    AND status IN ('active', 'past');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_event_view(uuid) TO authenticated, anon;
