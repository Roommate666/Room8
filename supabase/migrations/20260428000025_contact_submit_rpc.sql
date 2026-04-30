-- RPC: submit_contact_message
--
-- Problem: faq.html ruft .from('contact_messages').insert() mit
-- supabase-js auf. Der Client setzt je nach Version 'Prefer: return=representation',
-- was nach dem Insert einen SELECT triggert. SELECT ist admin-only → 42501.
--
-- Loesung: dedizierte security-definer RPC. Anon ruft RPC, RPC inserted bypassend.
-- Trigger feuert wie gewohnt.

create or replace function public.submit_contact_message(
    p_name text,
    p_email text,
    p_category text,
    p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    -- minimal validation
    if p_name is null or length(trim(p_name)) = 0 then
        raise exception 'Name ist erforderlich';
    end if;
    if p_email is null or length(trim(p_email)) = 0 then
        raise exception 'Email ist erforderlich';
    end if;
    if p_message is null or length(trim(p_message)) = 0 then
        raise exception 'Nachricht ist erforderlich';
    end if;

    insert into public.contact_messages (name, email, category, message, created_at, is_read)
    values (trim(p_name), trim(p_email), coalesce(p_category, 'allgemein'), trim(p_message), now(), false)
    returning id into v_id;

    return v_id;
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text) to anon, authenticated;
