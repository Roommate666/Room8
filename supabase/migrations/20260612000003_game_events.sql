-- Goat/Room8 Spiele-Event-System (Remote-Config -> kein Neu-Deploy noetig)
-- Ein aktives Event definiert: welches Spiel (game_key), Preis, Zeitraum, Scope, Quests/Config.
-- Die App liest das aktive Event zur Laufzeit. Admin schaltet Runden/Preise/Spiele um.

create table if not exists public.game_events (
  id          uuid primary key default gen_random_uuid(),
  game_key    text not null default 'goat_blast',   -- welches Spiel-Modul die App laedt
  title       text,
  prize_text  text,                                  -- Freitext: "500 EUR + Sessel" etc.
  prize_type  text default 'mixed',                  -- cash | goods | voucher | mixed
  scope       text not null default 'both' check (scope in ('global','uni','both')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  active      boolean not null default false,
  config      jsonb not null default '{}'::jsonb,    -- spielspezifisch: quests, settings...
  created_at  timestamptz not null default now()
);
comment on table public.game_events is 'Spiele-Events (Remote-Config). Aktives Event steuert Spiel/Preis/Zeitraum ohne App-Deploy.';

create index if not exists game_events_active_idx on public.game_events (active, starts_at desc);

alter table public.game_events enable row level security;

-- Lesen: alle (Board/Menue zeigen aktuelles Event + Preis auch anonym)
drop policy if exists game_events_select on public.game_events;
create policy game_events_select on public.game_events for select to anon, authenticated using (true);

-- Schreiben: nur Admins (profiles.is_admin). Admin-Panel kann alternativ Service-Role nutzen.
drop policy if exists game_events_admin_write on public.game_events;
create policy game_events_admin_write on public.game_events for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Score an Event binden (nullable, damit Alt-Scores gueltig bleiben)
alter table public.goat_scores add column if not exists event_id uuid references public.game_events(id) on delete set null;
create index if not exists goat_scores_event_idx on public.goat_scores (event_id, score desc);

-- Aktuelles Event (aktiv + im Zeitfenster), neuestes zuerst
create or replace view public.current_game_event as
select * from public.game_events
where active = true
  and starts_at <= now()
  and (ends_at is null or ends_at > now())
order by starts_at desc
limit 1;
grant select on public.current_game_event to anon, authenticated;

-- Start-Event: Goat Blast aktiv (Preis setzt Yusuf spaeter im Admin)
insert into public.game_events (game_key, title, prize_type, scope, active)
select 'goat_blast', 'Goat Blast', 'mixed', 'both', true
where not exists (select 1 from public.game_events);
