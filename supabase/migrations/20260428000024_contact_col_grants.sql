-- Spalten + RLS Status pruefen
create or replace function public.debug_contact_columns()
returns table(column_name text, is_nullable text, column_default text)
language sql
security definer
set search_path = public
as $$
    select column_name::text, is_nullable::text, column_default::text
      from information_schema.columns
     where table_schema = 'public' and table_name = 'contact_messages'
     order by ordinal_position;
$$;
grant execute on function public.debug_contact_columns() to anon, authenticated;
