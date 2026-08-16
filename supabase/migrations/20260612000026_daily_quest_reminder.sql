-- Abend-Push: erinnert Nutzer, die heute noch NICHT alle 3 Daily-Quests erfuellt haben.
-- "Erfuellt" = >=3 coin_transactions mit reason 'dq_%' heute (3 Quests/Tag).
-- Nur an Nutzer mit fcm_token (App installiert). 1x/Tag (dedup). Cron abends.

create or replace function public.notify_daily_quest_reminder()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in (
    select distinct t.user_id
    from public.fcm_tokens t
    where (
      select count(*) from public.coin_transactions ct
      where ct.user_id = t.user_id
        and ct.reason like 'dq\_%'
        and ct.created_at::date = current_date
    ) < 3
  ) loop
    begin
      perform public.notify_user_push(r.user_id, 'daily_quest',
        'Deine Daily-Quests warten 🎯',
        'Noch nicht alle erfüllt! Hol dir bis zu +75 G-Coins und schnapp dir Platz 1 im Wettkampf.',
        jsonb_build_object('url','/game/index.html'),
        'dq_reminder_' || current_date::text);
    exception when others then raise warning 'dq reminder fail %: %', r.user_id, sqlerrm; end;
  end loop;
end; $$;
grant execute on function public.notify_daily_quest_reminder() to service_role;

-- Cron: taeglich 18:00 UTC (20:00 CEST) — Abend, ein paar Stunden vor Mitternachts-Reset
do $$
begin
  perform cron.unschedule('daily-quest-reminder') where exists (select 1 from cron.job where jobname='daily-quest-reminder');
  perform cron.schedule('daily-quest-reminder','0 18 * * *', $c$ select public.notify_daily_quest_reminder(); $c$);
exception when others then raise warning 'dq reminder cron failed (pg_cron?): %', sqlerrm;
end $$;
