-- Debug: Pipeline einsehen
create or replace function public.debug_recent_notifications()
returns table(
    id uuid,
    channel text,
    status text,
    title text,
    error_code text,
    error_msg text,
    metadata jsonb,
    created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
    select id, channel, status, title, error_code, error_msg, metadata, created_at
      from public.notification_logs
     order by created_at desc
     limit 20;
$$;
grant execute on function public.debug_recent_notifications() to anon, authenticated;

-- pg_net Response-History
create or replace function public.debug_recent_http()
returns table(
    id bigint,
    status_code int,
    content text,
    error_msg text,
    created timestamptz
)
language sql
security definer
set search_path = public, net
as $$
    select r.id, r.status_code,
           left(coalesce(r.content::text, ''), 500),
           r.error_msg,
           r.created
      from net._http_response r
     order by r.created desc
     limit 10;
$$;
grant execute on function public.debug_recent_http() to anon, authenticated;

-- Admin emails effektiv (so wuerde send_admin_alert sie sammeln)
create or replace function public.debug_admin_recipients()
returns table(email text, source text)
language sql
security definer
set search_path = public
as $$
    with admin_ids as (
        select id from public.profiles where is_admin = true
    )
    select u.email::text, 'primary'::text
      from auth.users u
      join admin_ids a on a.id = u.id
     where u.email is not null
    union all
    select unnest(coalesce(ns.extra_email_recipients, '{}'))::text, 'extra'::text
      from public.notification_settings ns
      join admin_ids a on a.id = ns.user_id
     where ns.extra_email_recipients is not null;
$$;
grant execute on function public.debug_admin_recipients() to anon, authenticated;
