-- Deal-der-Woche Cron als Migration festhalten (war 15.10. per DO-Block direkt geschaltet).
-- 2x/Woche: Dienstag + Donnerstag 09:30 UTC (= 11:30 CEST). Idempotent.
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule('weekly-deal-reminder') where exists (select 1 from cron.job where jobname='weekly-deal-reminder');
    perform cron.schedule('weekly-deal-reminder','30 9 * * 2,4', $c$ select public.send_daily_coupon_reminders(); $c$);
  end if;
exception when others then raise warning 'weekly-deal cron failed (pg_cron?): %', sqlerrm;
end $$;
