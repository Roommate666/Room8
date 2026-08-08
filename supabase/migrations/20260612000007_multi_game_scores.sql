-- Multi-Game: Scores je Spiel taggen, damit jedes Spiel/Event ein eigenes Board hat.
-- Bestehende Goat-Blast-Scores bekommen per Default 'goat_blast'.

alter table public.goat_scores add column if not exists game_key text not null default 'goat_blast';
create index if not exists goat_scores_game_mode_score_idx on public.goat_scores (game_key, mode, score desc);

-- Board-View um game_key erweitern (Spalten-Umordnung -> drop+create statt replace)
drop view if exists public.goat_leaderboard;
create view public.goat_leaderboard as
select
  gs.id, gs.user_id, gs.mode, gs.score, gs.created_at, gs.game_key,
  pp.username, pp.university, pp.avatar_config
from public.goat_scores gs
join public.public_profiles pp on pp.id = gs.user_id
where gs.verified = true;
grant select on public.goat_leaderboard to anon, authenticated;
