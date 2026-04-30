-- Debug: send_admin_alert direkt aufrufen koennen + Status pruefen
create or replace function public.debug_trigger_admin_alert(p_label text default 'manual')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_msg text;
begin
    perform public.send_admin_alert(
        '[debug ' || p_label || '] ' || to_char(now(), 'HH24:MI:SS'),
        '<p>Manueller Debug-Trigger via RPC um ' || to_char(now(), 'HH24:MI:SS') || '.</p>',
        null,
        'debug_test'
    );
    return 'send_admin_alert called at ' || to_char(now(), 'HH24:MI:SS');
exception when others then
    return 'EXCEPTION: ' || sqlerrm;
end;
$$;
grant execute on function public.debug_trigger_admin_alert(text) to anon, authenticated;
