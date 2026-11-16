-- Instagram-DM-Autoantwort (Edge Function instagram-webhook).
-- Rein additiv. Beide Tabellen nur fuer service_role (RLS an, keine Policies).

create table if not exists public.ig_messages (
  id          bigserial primary key,
  mid         text unique,
  ig_user_id  text not null,
  direction   text not null check (direction in ('in','out')),
  text        text,
  status      text,          -- in: received/duplicate/flag/skipped ; out: auto/human/echo
  category    text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists ig_messages_user_time on public.ig_messages (ig_user_id, created_at desc);
alter table public.ig_messages enable row level security;
revoke all on public.ig_messages from anon, authenticated;
grant all on public.ig_messages to service_role;
grant usage, select on sequence public.ig_messages_id_seq to service_role;

create table if not exists public.ig_config (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
alter table public.ig_config enable row level security;
revoke all on public.ig_config from anon, authenticated;
grant all on public.ig_config to service_role;

-- auto_reply: on = selbst antworten | draft = nur Vorschlag per Telegram | off = nur loggen
insert into public.ig_config (key, value) values ('auto_reply', 'on') on conflict (key) do nothing;

-- Token woechentlich verlaengern (60-Tage-Token, refresh ab 24 h Alter erlaubt)
select cron.unschedule('ig-token-refresh') where exists (select 1 from cron.job where jobname = 'ig-token-refresh');
select cron.schedule('ig-token-refresh', '17 4 * * 1', $c$
  select net.http_post(
    url := 'https://tvnvmogaqmduzcycmvby.supabase.co/functions/v1/instagram-webhook?action=refresh',
    headers := public.app_internal_headers(),
    body := '{}'::jsonb
  );
$c$);

-- Datensparsamkeit: DM-Verlauf nach 180 Tagen loeschen
select cron.unschedule('ig-messages-cleanup') where exists (select 1 from cron.job where jobname = 'ig-messages-cleanup');
select cron.schedule('ig-messages-cleanup', '40 3 * * *', $c$
  delete from public.ig_messages where created_at < now() - interval '180 days';
$c$);
