-- Feedback / Problem melden / Verbesserungsvorschlaege
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('problem','vorschlag','sonstiges')),
  message text not null,
  context text,
  status text not null default 'neu' check (status in ('neu','gesehen','erledigt')),
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
-- Client darf NICHT direkt schreiben/lesen (nur via SECURITY-DEFINER-RPC)
revoke all on public.feedback from anon, authenticated;
drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own on public.feedback for select to authenticated using (user_id = auth.uid());

-- Feedback abschicken (jeder eingeloggte Nutzer)
create or replace function public.submit_feedback(p_type text, p_message text, p_context text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_id uuid; v_cnt int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  p_type := lower(coalesce(p_type,'sonstiges'));
  if p_type not in ('problem','vorschlag','sonstiges') then p_type := 'sonstiges'; end if;
  p_message := trim(coalesce(p_message,''));
  if length(p_message) < 3 then return jsonb_build_object('ok',false,'error','TOO_SHORT'); end if;
  if length(p_message) > 4000 then p_message := left(p_message,4000); end if;
  select count(*) into v_cnt from public.feedback where user_id=v_uid and created_at > now() - interval '10 minutes';
  if v_cnt >= 5 then return jsonb_build_object('ok',false,'error','RATE_LIMITED'); end if;
  insert into public.feedback(user_id,type,message,context)
    values (v_uid,p_type,p_message,left(coalesce(p_context,''),300)) returning id into v_id;
  begin
    perform net.http_post(
      url := coalesce(current_setting('app.supabase_url',true),'https://tvnvmogaqmduzcycmvby.supabase.co')||'/functions/v1/send-email',
      headers := public.app_internal_headers(),
      body := jsonb_build_object('to','info@unigoat.de',
        'subject','Neues UniGoat-Feedback ('||p_type||')',
        'html','<b>Typ:</b> '||p_type||'<br><b>Nutzer:</b> '||v_uid::text||'<br><b>Kontext:</b> '||coalesce(p_context,'-')||'<hr>'||replace(p_message,chr(10),'<br>')));
  exception when others then raise warning 'feedback mail fail: %', sqlerrm; end;
  return jsonb_build_object('ok',true,'id',v_id);
end $fn$;
grant execute on function public.submit_feedback(text,text,text) to authenticated;

-- Admin: Feedback lesen
create or replace function public.admin_list_feedback(p_limit int default 100)
returns setof public.feedback language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not public.is_caller_admin() then raise exception 'FORBIDDEN'; end if;
  return query select * from public.feedback order by created_at desc limit greatest(1,least(p_limit,500));
end $fn$;
grant execute on function public.admin_list_feedback(int) to authenticated;

-- Admin: Status setzen
create or replace function public.admin_update_feedback_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not public.is_caller_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('neu','gesehen','erledigt') then return jsonb_build_object('ok',false,'error','BAD_STATUS'); end if;
  update public.feedback set status=p_status where id=p_id;
  return jsonb_build_object('ok',true);
end $fn$;
grant execute on function public.admin_update_feedback_status(uuid,text) to authenticated;
