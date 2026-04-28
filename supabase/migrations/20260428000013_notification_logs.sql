-- Migration: notification_logs Tabelle
-- Persistiert jeden Push/Email-Versuch (Success + Fail) fuer Health-Monitoring.
-- Wird von Edge Functions send-push und send-email beschrieben.
-- Wird vom Admin-Tab "Push Health" gelesen.

-- =========================================================
-- TABELLE
-- =========================================================
create table if not exists public.notification_logs (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid references public.profiles(id) on delete set null,
    channel     text not null check (channel in ('push', 'email')),
    status      text not null check (status in ('success', 'no_token', 'invalid_email', 'fcm_error', 'resend_failed', 'exception')),
    error_code  text,                  -- z.B. INVALID_ARGUMENT, UNREGISTERED, validation_error
    error_msg   text,                  -- erste 500 Zeichen der Fehlermeldung
    provider_id text,                  -- FCM message-id ODER Resend email-id
    title       text,                  -- Push-Title oder Email-Subject (fuer Debugging)
    metadata    jsonb,                 -- Optional: data-payload, recipient_email, etc.
    created_at  timestamptz not null default now()
);

-- Index fuer Health-Stats Queries (24h-Window + Channel-Filter)
create index if not exists idx_notification_logs_created_channel
    on public.notification_logs (created_at desc, channel);

-- Index fuer Fail-Analysis pro User
create index if not exists idx_notification_logs_user_status
    on public.notification_logs (user_id, status, created_at desc);

-- =========================================================
-- RLS
-- =========================================================
alter table public.notification_logs enable row level security;

-- Service-Role darf alles (Edge Functions schreiben hierein)
-- Service-Role bypasst RLS automatisch — keine Policy noetig.

-- Admins duerfen alles lesen
drop policy if exists "notification_logs_admin_select" on public.notification_logs;
create policy "notification_logs_admin_select"
    on public.notification_logs
    for select
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where id = auth.uid() and is_admin = true
        )
    );

-- Niemand sonst darf direkt schreiben/lesen (nur Service-Role via Edge Functions)

-- =========================================================
-- HELPER: 24h Health-Stats RPC (admin-only via security definer)
-- =========================================================
-- Liefert aggregierte Stats fuer Admin-Dashboard.
-- Nutzung: select * from get_notification_health(24);
create or replace function public.get_notification_health(hours int default 24)
returns table (
    channel       text,
    total         bigint,
    success       bigint,
    failed        bigint,
    success_rate  numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and is_admin = true
    ) then
        raise exception 'forbidden: admin only';
    end if;

    return query
    select
        nl.channel,
        count(*) as total,
        count(*) filter (where nl.status = 'success') as success,
        count(*) filter (where nl.status != 'success') as failed,
        round(
            100.0 * count(*) filter (where nl.status = 'success')::numeric
            / nullif(count(*), 0),
            2
        ) as success_rate
    from public.notification_logs nl
    where nl.created_at >= now() - (hours || ' hours')::interval
    group by nl.channel
    order by nl.channel;
end;
$$;

revoke all on function public.get_notification_health(int) from public;
grant execute on function public.get_notification_health(int) to authenticated;

-- =========================================================
-- HELPER: Top-Fail-Reasons RPC
-- =========================================================
create or replace function public.get_notification_failures(hours int default 24)
returns table (
    channel    text,
    status     text,
    error_code text,
    cnt        bigint,
    last_seen  timestamptz,
    last_msg   text
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and is_admin = true
    ) then
        raise exception 'forbidden: admin only';
    end if;

    return query
    select
        nl.channel,
        nl.status,
        nl.error_code,
        count(*) as cnt,
        max(nl.created_at) as last_seen,
        (array_agg(nl.error_msg order by nl.created_at desc))[1] as last_msg
    from public.notification_logs nl
    where nl.created_at >= now() - (hours || ' hours')::interval
      and nl.status != 'success'
    group by nl.channel, nl.status, nl.error_code
    order by cnt desc
    limit 50;
end;
$$;

grant execute on function public.get_notification_failures(int) to authenticated;

-- =========================================================
-- AUTO-CLEANUP: Logs aelter als 30 Tage loeschen
-- =========================================================
-- Verhindert dass die Tabelle ewig waechst.
-- Wird von pg_cron nightly ausgefuehrt.
create or replace function public.cleanup_old_notification_logs()
returns void
language sql
security definer
set search_path = public
as $$
    delete from public.notification_logs where created_at < now() - interval '30 days';
$$;

-- pg_cron Job (nur anlegen wenn extension da ist)
do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.unschedule('cleanup-notification-logs')
        where exists (select 1 from cron.job where jobname = 'cleanup-notification-logs');

        perform cron.schedule(
            'cleanup-notification-logs',
            '0 3 * * *',  -- taeglich 3 Uhr UTC
            $cron$ select public.cleanup_old_notification_logs(); $cron$
        );
    end if;
end;
$$;
