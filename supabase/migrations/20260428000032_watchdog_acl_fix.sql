-- Migration: ACL-Fix fuer Watchdog RPCs
-- 31 hatte nur "revoke all from public" — anon hatte trotzdem implizites EXECUTE.
-- Hier explicit revoke + grant nur an service_role.

revoke all on function public.daily_health_check() from anon, authenticated, public;
grant execute on function public.daily_health_check() to service_role;

revoke all on function public.check_daily_health_log(int) from anon, authenticated, public;
grant execute on function public.check_daily_health_log(int) to service_role;

-- Auch send_admin_alert (5-arg version) sicher: nur service_role
revoke all on function public.send_admin_alert(text, text, text, text, text) from anon, authenticated, public;
grant execute on function public.send_admin_alert(text, text, text, text, text) to service_role;
