-- Granulare Partner-Permissions: pro Submission-Typ einzeln erlauben/sperren.
-- is_partner bleibt master-toggle (Zugriff aufs Partner-Dashboard ueberhaupt),
-- die 3 Sub-Permissions definieren WAS er einreichen darf.

alter table public.profiles
    add column if not exists partner_can_jobs    boolean not null default true,
    add column if not exists partner_can_coupons boolean not null default true,
    add column if not exists partner_can_events  boolean not null default true;

-- Default ist true: bestehende Partner behalten alle Rechte. Admin kann gezielt
-- einzelne abdrehen (z.B. Bar Centrale = nur Coupons, sonst nichts).
