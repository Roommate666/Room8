-- UniGoat KI-Immatrikulations-Scan: Metadaten der Verifizierung am Profil.
-- Additiv (add column if not exists), NICHTS droppen. Geschrieben ausschliesslich
-- ueber die Edge Function verify-enrollment (Service Role). Das Foto der
-- Bescheinigung wird NICHT gespeichert (DSGVO/Datensparsamkeit) -> hier landen nur
-- Zeitpunkt der Pruefung und das ermittelte Ablaufdatum der Gueltigkeit.
--
-- is_student_verified + university existieren bereits an public.profiles und werden
-- von der Function ebenfalls gesetzt.

alter table public.profiles
  add column if not exists enrollment_verified_at timestamptz;

alter table public.profiles
  add column if not exists enrollment_valid_until date;

comment on column public.profiles.enrollment_verified_at is
  'Zeitpunkt der letzten erfolgreichen KI-Immatrikulations-Verifizierung (verify-enrollment).';
comment on column public.profiles.enrollment_valid_until is
  'Semester-Enddatum aus der verifizierten Immatrikulationsbescheinigung. Kein Bild gespeichert.';
