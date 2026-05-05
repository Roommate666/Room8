-- REVOKE auf anon greift unzuverlaessig wenn Function security definer ist.
-- Sauberer: auth.uid() IS NULL Check inline in der Function.
-- Bei anon liefert auth.uid() NULL → Funktion macht nichts.

create or replace function public.increment_listing_apply(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.listings
  set apply_clicks = coalesce(apply_clicks, 0) + 1
  where id = p_listing_id;
end;
$$;

create or replace function public.increment_job_view(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.jobs
  set view_count = coalesce(view_count, 0) + 1
  where id = p_job_id;
end;
$$;

create or replace function public.increment_job_apply(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.jobs
  set apply_clicks = coalesce(apply_clicks, 0) + 1
  where id = p_job_id;
end;
$$;
