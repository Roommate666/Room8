-- Job-Tracking: View-Counter + Apply-Klick-Counter
-- Spec: keine — kein DB-Trigger, kein Cross-Table, einfache Counter.

alter table public.jobs
  add column if not exists view_count int not null default 0,
  add column if not exists apply_clicks int not null default 0;

comment on column public.jobs.view_count is
  'Aufrufe von job-detail.html (pro Page-Open hochgezaehlt).';
comment on column public.jobs.apply_clicks is
  'Klicks auf "Bewerben"-Button (oeffnet mailto: oder application_url).';

-- ============================================
-- RPC increment_job_view
-- ============================================
create or replace function public.increment_job_view(p_job_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.jobs
  set view_count = coalesce(view_count, 0) + 1
  where id = p_job_id;
$$;

grant execute on function public.increment_job_view(uuid) to authenticated, anon;

-- ============================================
-- RPC increment_job_apply
-- ============================================
create or replace function public.increment_job_apply(p_job_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.jobs
  set apply_clicks = coalesce(apply_clicks, 0) + 1
  where id = p_job_id;
$$;

grant execute on function public.increment_job_apply(uuid) to authenticated, anon;
