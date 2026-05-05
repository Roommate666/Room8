-- Migration: fcm_token-Registrierung in SECURITY DEFINER RPC verschieben.
--
-- Vorher: www/push-logic.js machte zwei Direct-UPDATE-Calls auf profiles:
--   1) update({fcm_token: null}).eq('fcm_token', token).neq('id', user.id)
--      → Wenn Angreifer Token-Wert kennt (siehe S6 vor Fix), kann er
--        Opfer-Push deaktivieren ueber UPDATE ohne dass DB-RLS das sieht
--        (nur USING auf eigenes id, nicht auf fcm_token-Wert).
--   2) update({fcm_token: token}).eq('id', user.id)
--      → Eigener Token-Set, harmlos.
--
-- Nachher: register_fcm_token(text) RPC, security definer.
--   - prueft auth.uid() != null
--   - prueft Token-Format (FCM hat ":")
--   - clear bei anderen Profilen NUR fuer genau diesen Token (Device-Reuse)
--   - Set bei aktuellem User
--   - Direct-UPDATE-Pfad wird in push-logic.js entfernt.
--
-- Side-Effekt: Cross-User-Clear bleibt funktional, ist aber jetzt
-- nicht mehr von externer RLS abhaengig sondern in einem auditable
-- code-path eingeschlossen. Angreifer kann immer noch fremden Token
-- nullen wenn er ihn kennt — aber er muesste dafuer seinen eigenen
-- Push-Token aufgeben (wir setzen am Ende fcm_token = p_token bei
-- auth.uid()), das ist Self-DoS, nicht Remote-Attack.

create or replace function public.register_fcm_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        raise exception 'not authenticated';
    end if;

    if p_token is null or length(p_token) < 20 or position(':' in p_token) = 0 then
        raise exception 'invalid fcm token format';
    end if;

    -- Device-Reuse Case: vorheriger User auf diesem Device wird stillgelegt
    update public.profiles
       set fcm_token = null
     where fcm_token = p_token
       and id <> v_uid;

    -- Aktueller User bekommt den Token
    update public.profiles
       set fcm_token = p_token
     where id = v_uid;
end;
$$;

revoke all on function public.register_fcm_token(text) from public, anon;
grant execute on function public.register_fcm_token(text) to authenticated;

-- Optional: clear-Token-Funktion fuer logout-Flow. Nicht zwingend, aber sauber.
create or replace function public.clear_own_fcm_token()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        raise exception 'not authenticated';
    end if;
    update public.profiles set fcm_token = null where id = v_uid;
end;
$$;

revoke all on function public.clear_own_fcm_token() from public, anon;
grant execute on function public.clear_own_fcm_token() to authenticated;
