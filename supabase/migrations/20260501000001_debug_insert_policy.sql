-- TEMP: erlaube authenticated User INSERT in notification_logs fuer eigene user_id
-- (Debug-Tracing aus push-logic.js)
drop policy if exists "notification_logs_self_debug_insert" on public.notification_logs;
create policy "notification_logs_self_debug_insert"
    on public.notification_logs
    for insert
    to authenticated
    with check (auth.uid() = user_id);
