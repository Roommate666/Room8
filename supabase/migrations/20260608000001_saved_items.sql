-- =============================================================
-- Saved Items: User speichert Coupons / Jobs / Events
-- Reduzierte App (Coupons/Jobs/Events). Universelles Speichern-System.
-- item_type: 'coupon' | 'job' | 'event'
-- item_id: text (polymorph, kein FK -> coupons/jobs evtl. nicht uuid)
-- Stand 2026-06-08
-- =============================================================

CREATE TABLE IF NOT EXISTS public.saved_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_type text NOT NULL,
    item_id text NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, item_type, item_id),
    CONSTRAINT saved_items_type_check CHECK (item_type IN ('coupon', 'job', 'event'))
);

CREATE INDEX IF NOT EXISTS idx_saved_items_user ON public.saved_items(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_lookup ON public.saved_items(user_id, item_type, item_id);

ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;

-- Nur eigene gespeicherte Items lesen
DROP POLICY IF EXISTS "saved_items_self_read" ON public.saved_items;
CREATE POLICY "saved_items_self_read" ON public.saved_items
    FOR SELECT USING (auth.uid() = user_id);

-- Nur fuer sich selbst speichern
DROP POLICY IF EXISTS "saved_items_self_insert" ON public.saved_items;
CREATE POLICY "saved_items_self_insert" ON public.saved_items
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Nur eigene Speicherung loeschen
DROP POLICY IF EXISTS "saved_items_self_delete" ON public.saved_items;
CREATE POLICY "saved_items_self_delete" ON public.saved_items
    FOR DELETE USING (auth.uid() = user_id);
