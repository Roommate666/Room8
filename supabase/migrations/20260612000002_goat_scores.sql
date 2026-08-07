-- Goat Blast Online-Rangliste
-- Scores werden AUSSCHLIESSLICH ueber die Edge Function submit-goat-score (Service Role)
-- geschrieben. Direkte Client-Inserts sind per RLS gesperrt (sonst waere der Score
-- trivial faelschbar). Zwei Stufen:
--   verified          = Basis-Plausipruefung bestanden -> erscheint im Board
--   replay_validated  = Server hat die Runde per Seed+Zuege nachgerechnet -> Preisgeld-faehig
-- Preisgeld-Auszahlung NUR gegen replay_validated = true (Phase 2).

create table if not exists public.goat_scores (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  mode             text not null check (mode in ('high','daily')),
  score            integer not null check (score >= 0 and score <= 5000000),
  seed             bigint,
  lines_total      integer,
  duration_ms      integer,
  verified         boolean not null default false,
  replay_validated boolean not null default false,
  created_at       timestamptz not null default now()
);

comment on table public.goat_scores is 'Goat Blast Highscores. Insert nur via Edge Function submit-goat-score (Service Role).';

create index if not exists goat_scores_mode_score_idx on public.goat_scores (mode, score desc);
create index if not exists goat_scores_created_idx on public.goat_scores (created_at);
create index if not exists goat_scores_user_idx on public.goat_scores (user_id);

alter table public.goat_scores enable row level security;

-- Lesen: eingeloggte Nutzer duerfen Scores lesen (fuers Board). Namen/Uni kommen aus der View unten.
drop policy if exists goat_scores_select on public.goat_scores;
create policy goat_scores_select on public.goat_scores
  for select to authenticated using (true);

-- KEIN insert/update/delete-Policy fuer anon/authenticated -> RLS sperrt Client-Writes.
-- Nur der Service-Role-Key (Edge Function) umgeht RLS und darf schreiben.

-- Board-View: verbindet verifizierte Scores mit Anzeigename + Uni aus public_profiles
-- (public_profiles ist security_definer -> respektiert Profil-Privatsphaere, fuer alle lesbar).
create or replace view public.goat_leaderboard as
select
  gs.id,
  gs.user_id,
  gs.mode,
  gs.score,
  gs.created_at,
  pp.username,
  pp.university
from public.goat_scores gs
join public.public_profiles pp on pp.id = gs.user_id
where gs.verified = true;

grant select on public.goat_leaderboard to anon, authenticated;
