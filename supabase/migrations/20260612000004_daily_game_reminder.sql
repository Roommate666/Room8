-- UniGoat Daily-Reminder-Push via pg_cron
-- Erinnert Nutzer, die schon mal gespielt haben (engaged) aber HEUTE noch nicht,
-- einmal taeglich. Nutzt notify_user_push -> Safeguards (Quiet-Hours/Rate-Limit/Dedup)
-- greifen automatisch. Channel 'daily_game' ist per Default AN (should_notify else-Zweig).
-- ref_id = 'daily_game_<datum>' -> pro Tag hoechstens EIN Reminder je Nutzer (Dedup).

create or replace function public.send_daily_game_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    r record;
    v_count int := 0;
begin
    for r in (
        select distinct gs.user_id
        from public.goat_scores gs
        where exists (select 1 from public.fcm_tokens t where t.user_id = gs.user_id)
          and not exists (
              select 1 from public.goat_scores g2
              where g2.user_id = gs.user_id
                and g2.created_at::date = current_date
          )
    ) loop
        begin
            perform public.notify_user_push(
                r.user_id,
                'daily_game',
                'Deine Ziege wartet 🐐',
                'Heute schon gespielt? Sichere dir deinen Highscore!',
                jsonb_build_object('url', '/game/'),
                'daily_game_' || current_date::text
            );
            v_count := v_count + 1;
        exception when others then
            raise warning 'daily reminder failed for %: %', r.user_id, sqlerrm;
        end;
    end loop;
    raise notice 'daily game reminders processed: %', v_count;
end;
$$;

revoke all on function public.send_daily_game_reminders() from public;
grant execute on function public.send_daily_game_reminders() to service_role;

-- Cron: taeglich 17:00 UTC (~18-19 Uhr Europe/Berlin). current_date ist UTC.
do $$
begin
    if exists (select 1 from cron.job where jobname = 'daily-game-reminder') then
        perform cron.unschedule('daily-game-reminder');
    end if;
    perform cron.schedule('daily-game-reminder', '0 17 * * *', $cmd$ select public.send_daily_game_reminders(); $cmd$);
exception when others then
    raise warning 'cron schedule failed (pg_cron aktiv?): %', sqlerrm;
end $$;
