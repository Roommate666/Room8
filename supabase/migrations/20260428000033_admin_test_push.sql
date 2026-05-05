-- Migration: admin_test_push RPC
-- Erlaubt Admins via UI einen Test-Push an sich selbst zu schicken.
-- Bypassed Toggle/Quiet-Hours/Rate-Limit damit der Test deterministisch ist.

create or replace function public.admin_test_push(
    p_title text default '🔔 Test Push',
    p_body  text default 'Wenn du das siehst, funktioniert FCM auf deinem Geraet'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller uuid;
    v_is_admin boolean;
    v_fcm_token text;
    v_url text;
    v_ts text;
begin
    v_caller := auth.uid();
    if v_caller is null then
        return 'EXCEPTION: not authenticated';
    end if;

    select is_admin into v_is_admin from public.profiles where id = v_caller;
    if not coalesce(v_is_admin, false) then
        return 'EXCEPTION: not admin';
    end if;

    select fcm_token into v_fcm_token from public.profiles where id = v_caller;
    if v_fcm_token is null or v_fcm_token = '' then
        -- noch loggen, damit wir wissen wer's versucht hat
        insert into public.notification_logs
            (user_id, channel, status, error_code, error_msg, title, metadata)
        values
            (v_caller, 'push', 'no_token', 'no_fcm_token',
             'Admin hat Test-Push versucht, kein FCM-Token registriert',
             p_title,
             jsonb_build_object('admin_test', true));
        return 'NO_TOKEN: kein fcm_token in profiles. Native App muss laufen + Push erlauben.';
    end if;

    v_ts := to_char(now() at time zone 'utc', 'HH24:MI:SS UTC');
    v_url := coalesce(
        current_setting('app.supabase_url', true),
        'https://tvnvmogaqmduzcycmvby.supabase.co'
    ) || '/functions/v1/send-push';

    -- Direkt send-push via pg_net, bypassed notify_user_push (kein Toggle/Rate/Dedup)
    perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
            'userId', v_caller::text,
            'title',  p_title || ' (' || v_ts || ')',
            'body',   p_body,
            'data',   jsonb_build_object(
                'channel_key', 'admin_test',
                'admin_test', true
            )
        )
    );

    return 'FIRED at ' || v_ts || ' to user ' || v_caller || '. Check Push Health logs in 30s.';
end;
$$;

revoke all on function public.admin_test_push(text, text) from anon, authenticated, public;
grant execute on function public.admin_test_push(text, text) to authenticated;
