-- =============================================================
-- Demo-Coupons entfernen (12.06.2026)
-- seed_demo_data (20260511000002) hatte 2 Platzhalter-Coupons mit
-- is_test=false live in Augsburg ("Cafe Anna" STUDI-COFFEE, "Stueckgut"
-- STUDI20) inkl. falscher Umlaute (Fruehstueck). Keine echten Partner
-- (echte Partner sind Ulm/Neu-Ulm). Raus statt umlaut-fixen.
-- =============================================================

DELETE FROM public.coupons
 WHERE discount_code IN ('STUDI-COFFEE', 'STUDI20')
   AND business_name IN ('Cafe Anna Augsburg', 'Stueckgut Cafe');
