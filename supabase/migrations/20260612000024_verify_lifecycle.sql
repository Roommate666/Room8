-- Verifizierungs-Lifecycle: harte Uni-Mail-Uniqueness (DB-Index), Reset (self+admin),
-- und Jahres-Ablauf (jede Verifizierung gilt 1 Jahr, danach neu).
-- Spalten existieren bereits (verify-uni-token nutzt sie): is_verified, is_student,
-- is_student_verified, uni_email, uni_email_verified, verification_status,
-- verification_method, verified_at, uni_email_verification_token.

-- 1) Harte Uniqueness: eine Uni-Mail kann nur EIN Konto verifizieren (solange verifiziert).
--    Partial-Index -> nach Reset/Ablauf (uni_email_verified=false) ist die Mail wieder frei.
create unique index if not exists profiles_uni_email_verified_uidx
  on public.profiles (lower(uni_email)) where uni_email_verified is true;

-- 2) Self-Reset: Nutzer setzt eigene Verifizierung zurueck (gibt Uni-Mail frei -> Re-Verify moeglich)
create or replace function public.reset_my_verification()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  update public.profiles set
    is_verified=false, is_student_verified=false, is_student=false,
    uni_email_verified=false, uni_email=null, uni_email_verification_token=null,
    verification_status='none', verification_method=null, verified_at=null
  where id = auth.uid();
  return true;
end; $$;
grant execute on function public.reset_my_verification() to authenticated;

-- 3) Admin-Reset: Admin setzt Verifizierung eines Users zurueck (falls Probleme)
create or replace function public.admin_reset_verification(p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and is_admin) then return false; end if;
  update public.profiles set
    is_verified=false, is_student_verified=false, is_student=false,
    uni_email_verified=false, uni_email=null, uni_email_verification_token=null,
    verification_status='none', verification_method=null, verified_at=null
  where id = p_user;
  return true;
end; $$;
grant execute on function public.admin_reset_verification(uuid) to authenticated;

-- 4) Jahres-Ablauf: Verifizierung > 1 Jahr alt -> zuruecksetzen (Uni-Mail bleibt am User,
--    aber uni_email_verified=false -> Index gibt sie frei; Re-Verify derselben Mail geht).
create or replace function public.expire_verifications()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in (
    select id from public.profiles
    where (coalesce(is_verified,false) or coalesce(is_student_verified,false))
      and verified_at is not null
      and verified_at < now() - interval '1 year'
  ) loop
    begin
      update public.profiles set
        is_verified=false, is_student_verified=false, is_student=false,
        uni_email_verified=false, verification_status='expired', verified_at=null
      where id = r.id;
      perform public.notify_user_push(r.id, 'verify',
        'Verifizierung abgelaufen',
        'Deine Studenten-Verifizierung ist nach einem Jahr abgelaufen. Kurz neu verifizieren, dann bist du wieder dabei.',
        jsonb_build_object('url','/verify-options.html'), 'verify_expired_'||r.id::text||'_'||to_char(now(),'YYYY'));
    exception when others then raise warning 'expire fail %: %', r.id, sqlerrm; end;
  end loop;
end; $$;
grant execute on function public.expire_verifications() to service_role;

-- Cron: taeglich 05:00 UTC
do $$
begin
  perform cron.unschedule('expire-verifications') where exists (select 1 from cron.job where jobname='expire-verifications');
  perform cron.schedule('expire-verifications','0 5 * * *', $c$ select public.expire_verifications(); $c$);
exception when others then raise warning 'expire cron failed (pg_cron?): %', sqlerrm;
end $$;
