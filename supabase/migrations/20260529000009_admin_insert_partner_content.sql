-- Admin darf Inhalte mit FREMDEM Owner anlegen (Partner-Submission-Approve).
--
-- Bug (per E2E-Test 29.05. gefunden): Seit dem Approve-Owner-Fix (Commit fd258b8)
-- setzt admin.html beim Genehmigen owner_id/user_id = submitter_id (der Partner),
-- damit dieser seinen Live-Inhalt im Dashboard sieht. Die INSERT-RLS von coupons
-- und listings erlaubte aber nur user_id/owner_id = auth.uid() -> Admin-Insert mit
-- fremdem Owner brach mit 42501 (HTTP 403). Folge: Job- und Coupon-Genehmigungen
-- waren komplett blockiert (Event-Approve ging, da events-RLS is_admin schon erlaubt).
--
-- Fix: je eine ZUSAETZLICHE permissive INSERT-Policy fuer Admins. Permissive
-- Policies werden mit OR kombiniert -> bestehende (AI-LOCK-)Policies bleiben
-- unveraendert, Admins duerfen nur zusaetzlich fuer beliebige Owner anlegen.
-- is_admin ist Trigger-geschuetzt (nur Admin/System setzbar) -> sicher.

drop policy if exists coupons_admin_insert on public.coupons;
create policy coupons_admin_insert
on public.coupons
for insert
to authenticated
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

drop policy if exists listings_admin_insert on public.listings;
create policy listings_admin_insert
on public.listings
for insert
to authenticated
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);
