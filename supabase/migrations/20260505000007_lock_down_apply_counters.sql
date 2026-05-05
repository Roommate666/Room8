-- Security-Hardening: Apply-Counter nur fuer eingeloggte User.
-- Audit am 05.05. zeigte: anon konnte increment_listing_apply spammen → Stats-Manipulation.

-- listings: apply_clicks nur fuer authenticated
revoke execute on function public.increment_listing_apply(uuid) from anon;

-- jobs: ungenutzte Spalten (Mig 5 war fehlleitende Tabelle), trotzdem dichtmachen
revoke execute on function public.increment_job_view(uuid) from anon;
revoke execute on function public.increment_job_apply(uuid) from anon;

-- view_count auf listings (existing increment_view_count) bleibt offen fuer anon —
-- View-Tracking ohne Login ist Standard-Pattern (Inserate sind ohne Login lesbar).
-- Spam-Schutz dort waere Per-IP-Rate-Limit und ist out-of-scope dieser Migration.
