-- Audit P4 (15.10.): Hardcoded-Admin-E-Mail-Bypass aus admin_update_all_profiles entfernt.
-- Nur noch is_admin=true. Bereits live via ALTER POLICY; hier zur Versionierung.
ALTER POLICY admin_update_all_profiles ON public.profiles
  USING (EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.is_admin = true));
