-- Monats-Preise fuer die G-Coins-Rangliste (Top 3), sichtbar in Hub, Rang und Spiel.
-- Rein additiv: neue Tabelle, nur Lesen fuer alle, Schreiben nur service_role/SQL.
-- Pflege: je Monat bis zu 3 Zeilen (month = erster Tag des Monats). Keine Zeile -> Banner bleibt aus.

create table if not exists public.monthly_prizes (
  month      date     not null check (extract(day from month) = 1),
  place      smallint not null check (place between 1 and 3),
  title      text     not null check (char_length(title) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (month, place)
);

alter table public.monthly_prizes enable row level security;

drop policy if exists monthly_prizes_read on public.monthly_prizes;
create policy monthly_prizes_read on public.monthly_prizes
  for select to anon, authenticated using (true);

revoke all on public.monthly_prizes from anon, authenticated;
grant select on public.monthly_prizes to anon, authenticated;
grant all on public.monthly_prizes to service_role;

insert into public.monthly_prizes (month, place, title) values
  ('2026-11-01', 1, '100 € + Red Bull Paket'),
  ('2026-11-01', 2, '80 €'),
  ('2026-11-01', 3, '30 €')
on conflict (month, place) do update set title = excluded.title;
