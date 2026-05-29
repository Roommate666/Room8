-- Partner-Permission-Gate + feste Einreicher-Identitaet fuer partner_submissions.
--
-- AUSGANGSLAGE (per Live-Test 29.05. verifiziert): partner_submissions akzeptierte
-- JEDEN Insert -- sogar anonym ohne Login (HTTP 201), und ein eingeloggter Partner
-- mit nur partner_can_coupons=true konnte trotzdem Jobs UND Events einreichen.
-- Die granularen Permissions (partner_can_jobs/coupons/events) steuerten bisher NUR
-- die Button-Sichtbarkeit im Dashboard -- keine echte Durchsetzung.
--
-- HYBRID-MODELL (Produktentscheidung Yusuf 29.05.):
--   - Anonyme / eingeloggte Nicht-Partner: duerfen weiter frei einreichen
--     (oeffentliche Akquise ueber die Landing -- fremde Cafes/Bars ohne Account).
--   - Eingeloggte PARTNER (is_partner=true): duerfen NUR Typen einreichen, fuer die
--     ihr Schalter (partner_can_*) an ist. Jede Kombination moeglich, hart erzwungen.
--
-- Umsetzung als RESTRICTIVE Policy: wird mit AND zu allen bestehenden permissiven
-- Policies kombiniert -> kann nur zusaetzlich einschraenken, bricht keinen
-- bestehenden Flow (Akquise bleibt offen). Idempotent.

-- 1. Feste Einreicher-Identitaet (statt frei eingebbarer contact_email).
--    null bei anonymer Akquise-Einreichung. Basis fuer Owner-Zuordnung beim Approve
--    und fuer kuenftige Partner-Statistiken ("wer hat wie viel eingereicht").
alter table public.partner_submissions
  add column if not exists submitter_id uuid references auth.users(id) on delete set null;

create index if not exists idx_partner_submissions_submitter
  on public.partner_submissions(submitter_id);

-- 2. Permission-Gate (RESTRICTIVE): eingeloggte Partner nur erlaubte Typen.
drop policy if exists partner_submission_permission_gate on public.partner_submissions;

create policy partner_submission_permission_gate
on public.partner_submissions
as restrictive
for insert
to anon, authenticated
with check (
  -- anon ODER eingeloggter Nicht-Partner -> Akquise-Lead, frei erlaubt
  not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_partner = true
  )
  -- eingeloggter Partner -> nur Typen mit gesetztem Schalter
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_partner = true
      and (
        (partner_submissions.submission_type = 'job'    and p.partner_can_jobs)
        or (partner_submissions.submission_type = 'coupon' and p.partner_can_coupons)
        or (partner_submissions.submission_type = 'event'  and p.partner_can_events)
      )
  )
);
