-- Debug: aktueller FCM-Token-Status fuer eingeloggten User
create or replace function public.my_fcm_status()
returns table(
    has_token boolean,
    token_prefix text,
    token_length int,
    is_admin boolean,
    last_push_attempt timestamptz,
    last_push_status text
)
language sql
security definer
set search_path = public
as $$
    with me as (
        select id, fcm_token, is_admin from public.profiles where id = auth.uid()
    ),
    latest_push as (
        select status, created_at
          from public.notification_logs
         where channel = 'push' and user_id = (select id from me)
         order by created_at desc
         limit 1
    )
    select
        (m.fcm_token is not null and m.fcm_token != '') as has_token,
        case when m.fcm_token is null then null
             else substr(m.fcm_token, 1, 20) || '...' end,
        coalesce(length(m.fcm_token), 0),
        coalesce(m.is_admin, false),
        lp.created_at,
        lp.status
      from me m
      left join latest_push lp on true;
$$;
revoke all on function public.my_fcm_status() from public;
grant execute on function public.my_fcm_status() to authenticated;
