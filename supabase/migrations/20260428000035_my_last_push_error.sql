create or replace function public.my_last_push_error()
returns table(
    status text,
    error_code text,
    error_msg text,
    title text,
    created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
    select status, error_code, error_msg, title, created_at
      from public.notification_logs
     where user_id = auth.uid() and channel = 'push'
     order by created_at desc
     limit 5;
$$;
revoke all on function public.my_last_push_error() from public;
grant execute on function public.my_last_push_error() to authenticated;
