-- ============================================================================
-- 20260906000003_friend_search.sql
-- Freunde finden: (1) Namenssuche mit Beziehungs-Status, (2) Referral-Code -> Name
-- fuer die Einladungslink-Landing (join.html).
-- Baut auf 20260905000001_friendships.sql (friendships: requester_id/addressee_id/status)
-- und 20260612000015_referral.sql (profiles.referral_code) auf. Rein additiv.
-- ============================================================================

-- ── search_users: Live-Suche nach Benutzername (Prefix + Teilstring) ─────────
-- Gibt NUR oeffentliche Anzeigedaten zurueck (username, grobe Stadt) + die Beziehung
-- zum Sucher (none/pending_out/pending_in/friends), damit die UI den richtigen Button
-- zeigt. Min. 2 Zeichen, max 10 Treffer. Keine Email/keine sensiblen Felder.
create or replace function public.search_users(p_query text)
returns table(id uuid, username text, city text, rel text)
language sql security definer set search_path to 'public' stable as $$
  select p.id, p.username, p.city,
    case
      when f.status = 'accepted' then 'friends'
      when f.status = 'pending' and f.requester_id = auth.uid() then 'pending_out'
      when f.status = 'pending' and f.addressee_id = auth.uid() then 'pending_in'
      else 'none'
    end as rel
  from public.profiles p
  left join lateral (
    select status, requester_id, addressee_id
    from public.friendships
    where (requester_id = auth.uid() and addressee_id = p.id)
       or (requester_id = p.id and addressee_id = auth.uid())
    limit 1
  ) f on true
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.username is not null
    and length(btrim(p_query)) >= 2
    and p.username ilike '%' || btrim(p_query) || '%'
  order by (lower(p.username) = lower(btrim(p_query))) desc,               -- exakter Treffer zuerst
           (lower(p.username) like lower(btrim(p_query)) || '%') desc,     -- dann Prefix
           p.username
  limit 10;
$$;
grant execute on function public.search_users(text) to authenticated;

-- ── resolve_referral: Einladungs-Code -> Einlader-Name (fuer join.html-Anzeige) ─
-- anon erlaubt: wer den Code hat (aus dem geteilten Link), darf den Anzeigenamen sehen.
-- Nur username, nichts weiter.
create or replace function public.resolve_referral(p_code text)
returns jsonb language sql security definer set search_path to 'public' stable as $$
  select coalesce(
    (select jsonb_build_object('ok', true, 'username', username)
       from public.profiles
      where upper(referral_code) = upper(btrim(p_code)) and username is not null
      limit 1),
    jsonb_build_object('ok', false)
  );
$$;
grant execute on function public.resolve_referral(text) to anon, authenticated;
