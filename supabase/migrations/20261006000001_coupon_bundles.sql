-- Coupon-Bundles (Reseller/Vertriebler mit mehreren Branchen-Angeboten)
-- REIN ADDITIV: bestehende Coupons bleiben unberuehrt (parent_coupon_id NULL, is_bundle false).
-- Ein Bundle-Head (is_bundle=true) ist ein Container; die Einzel-Angebote haengen per
-- parent_coupon_id dran und bleiben GANZ NORMALE Coupons (redeem_coupon/Trigger/RLS unveraendert).
--
-- Einloese-Logik (redeem_coupon, enforce_coupon_redemption_limit, RLS) wird NICHT angefasst.

-- Selbst-Referenz auf die eigene Tabelle. on delete set null = defensiv:
-- wird ein Head geloescht, werden die Kinder zu normalen Standalone-Coupons (kein Datenverlust).
alter table public.coupons
  add column if not exists parent_coupon_id uuid references public.coupons(id) on delete set null;

-- Markiert den Container-Coupon (Reseller-Kopf). Kinder + normale Coupons = false.
alter table public.coupons
  add column if not exists is_bundle boolean not null default false;

-- Schneller Lookup der Kinder eines Bundles (nur Zeilen mit Parent indexiert).
create index if not exists idx_coupons_parent_coupon_id
  on public.coupons(parent_coupon_id) where parent_coupon_id is not null;
