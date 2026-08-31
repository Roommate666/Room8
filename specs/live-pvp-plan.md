# UniGoat — Live-Echtzeit-PvP fuer Goat Blast (Architektur-Spec)

**Stand:** 2026-08-30 · **Status:** DESIGN-DOKUMENT (kein Code, nichts deployed)
**Autor:** Architektur-Entwurf auf Basis des Live-Codes (`www/game/core.js`, `submit-goat-score`, Referral/Coins-Schema).
**Scope:** Zwei UniGoat-Nutzer spielen Goat Blast GLEICHZEITIG gegeneinander und behindern sich mit Coins-gekauften Gadgets.

> Diese Spec ist ein PLAN. Bevor irgendetwas gebaut wird: Phase 0 (Go/No-Go) mit Yusuf abschliessen.
> Aenderungen an `www/game/core.js` / `goat-core.js` sind **AI-LOCK** (siehe `specs/kritische-pfade.md`) und brauchen explizites OK.

---

## 0. Ehrliche Einordnung zuerst (bitte lesen bevor gebaut wird)

PvP ist kein Feature-Problem, sondern ein **Liquiditaets-Problem**: Es braucht zwei Menschen, die im selben Moment spielen wollen. Bei der aktuellen Nutzerbasis (laut Memory Subs nahe 0) ist offenes Live-Matchmaking eine **Geisterstadt** — man baut 6 Wochen und niemand findet je einen Gegner.

**Empfehlung:**
- **Start = Freunde-Duell** (Einladung ueber Join-Code / Freunde-Graph `referred_by`), NICHT offenes Matchmaking. Zwei Leute verabreden sich bewusst.
- Zusaetzlich **async-Duell** (Gegner spielt denselben Seed spaeter, Score-Vergleich) und **Geist-Gegner** (aufgezeichneter Lauf) gegen leere Lobbys.
- **Offenes Quick-Match lohnt erst ab grob 200-400 taeglich aktiven Spielern** bzw. genug Gleichzeitigen pro Uni. Vorher = Flag aus.

Wenn diese Schwelle nicht absehbar ist: **Feature verschieben**. Der Aufwand (6-8 Wochen) rechnet sich sonst nicht.

---

## 1. Der zentrale Trick: seed-deterministischer State-Sync

Der bestehende Core ist bereits **deterministisch**: `GoatCore.create(seed, mode)` erzeugt aus EINEM Seed exakt dasselbe Startboard, dieselben Trays und (bei gleicher Zugfolge) denselben Score — das ist die Grundlage des Single-Player-Anti-Cheats (`submit-goat-score` rechnet die Runde per `replay(seed, moves)` nach).

Daraus folgt fuer PvP:

- **Beide Spieler bekommen denselben `seed`** (serverseitig erzeugt, in `match.seed`). Damit spielen beide dasselbe Board — fair und vergleichbar.
- Es muss **NICHT der volle Grid-Zustand** gebroadcastet werden, sondern nur der winzige Zug `{idx, r, c, t}` (~10-16 Byte) und Gadget-Events.
- Jeder Client haelt **zwei** Core-States:
  - `st_self` — interaktiv gespielt.
  - `st_opp` — nur durch empfangene Gegner-Zuege abgespielt, gerendert als **Mini-Board** des Gegners (Live-Blick auf den Rivalen).
- **Traffic pro Runde < 5 KB.** Kein Game-Server, kein Extra-Prozess.

Nebeneffekt: Weil alles seed+zug-basiert ist, funktioniert der **Server-Replay-Anti-Cheat am Rundenende genauso wie im Single-Player**.

---

## 2. Realtime-Architektur (Supabase)

### 2.1 Ein Broadcast-Kanal pro Match

Kanalname: `match:<match_id>`

```js
const ch = supabase.channel(`match:${matchId}`, {
  config: {
    broadcast: { self: false, ack: true },
    presence:  { key: userId }
  }
});
```

### 2.2 Presence = Verbindungs-/Abbruch-Erkennung

- `ch.track({ user_id, ready, connected_at })` beim Betreten.
- `presence.sync` / `presence.leave` liefern Reconnect- und Abbruch-Signale.
- Gegner > **8 s** weg -> Grace-Countdown, dann Sieg-durch-Aufgabe (siehe 7).

### 2.3 Broadcast-Events (kein DB-Roundtrip pro Zug)

| Event | Payload | Zweck |
|---|---|---|
| `mv` | `{seq, idx, r, c, t}` | ein Platzierungs-Zug |
| `gadget` | `{seq, kind, t}` | geschicktes Gadget (siehe 4) |
| `state` | `{score, level, streak, over}` | Heartbeat/Score-Ticker fuers Gegner-HUD, max **1/s**, NICHT autoritativ |
| `over` | `{final_score, moves_count}` | eigenes Game Over |
| `start` | `{at_ts}` | Host startet Countdown 3-2-1 |
| `emote` | `{e}` | optionaler Spass (Ziege-Emote) |

**Wichtig:** Jeder Client zeichnet `mv` / `gadget` / `over` zusaetzlich lokal auf (`moveLog_self`, `moveLog_opp`, `gadgetLog`) fuer den spaeteren Server-Replay.

> `state` ist reine Anzeige. Der wertungsrelevante Score kommt IMMER aus dem Server-Replay, nie aus dem Live-Ticker.

---

## 3. Matchmaking

### 3.1 Freunde-Duell (empfohlener Start)

1. Spieler A tippt **"Duell"** -> Edge Function `create-match`: legt `match`-Zeile an (`status='lobby'`, `seed`=serverseitig zufaellig, `host_id`=A) und liefert **6-stelligen JOIN-CODE** (Stil wie `referral_code`) + Deep-Link `unigoat.de/duell/<code>`.
2. A teilt Code/Link ueber den **Freunde-Graph** (`referred_by`-Kontakte) oder WhatsApp.
3. Spieler B tippt Code -> `join-match` (setzt `guest_id`=B, `status='ready'`).
4. Beide betreten den Kanal, Presence `ready` -> Host broadcastet `start`, Countdown 3-2-1, `status='active'`.

### 3.2 Quick-Match (Phase 2, erst ab genug Spielern)

- `match`-Zeile mit `status='queue'`, `university`, `elo`.
- `find_match` RPC nimmt via **`FOR UPDATE SKIP LOCKED`** den aeltesten passenden Queue-Eintrag (gleiche Uni bevorzugt, ELO-Fenster das mit Wartezeit waechst) oder legt selbst einen Queue-Eintrag an.
- Realtime-Broadcast auf privatem User-Kanal `user:<id>` signalisiert `matched`.

### 3.3 Anti-Ghost-Town

- Nach **20 s** ohne Quick-Match -> Angebot **"gegen Geist spielen"**: ein `replay_validated`-Lauf aus `goat_scores` wird als Gegner abgespielt. Fuehlt sich live an, ist aber aufgezeichnet. Zaehlt **NICHT** fuer ELO.

---

## 4. Gadget-System

Gadgets kosten G-Coins (bestehendes `add_coins` / `coin_transactions`; neue atomare RPC `spend_match_gadget`).

| Gadget | Coins | Wirkung | Core-Effekt? |
|---|---|---|---|
| **Muell-Block** (`trash`) | 25 | Injiziert dem Gegner 1 fest verankerten Junk-Cluster (`t:'j'`), blockiert Platzierung, clrt nur bei voller Zeile/Spalte, gibt 0 Punkte | **JA** (echter Core-Effekt, replay-relevant) |
| **Vorschau-Nebel** (`fog`) | 15 | Verdeckt `nextTray`-Vorschau des Gegners 8 s | NEIN (rein visuell) |
| **Zeitdruck** (`rush`) | 20 | Erzwingt beim Gegner 6 s sichtbaren Countdown + Warnpuls | NEIN (rein visuell/psychologisch) |

**Regeln:**
- Coins werden **beim Absender** atomar abgebucht (`greatest(0, ...)` verhindert negativ).
- **Cooldown 10 s** pro Typ, **max 5 Gadgets/Match/Spieler** (Anti-Spam).
- **Junk ist der einzige echte Core-Effekt.** `fog`/`rush` beeinflussen den Score-Replay NICHT (sie erschweren nur die Bedienung/den Kopf).

### 4.1 Junk-Injektion deterministisch

Junk-Position wird **deterministisch aus `(match.seed XOR seq)`** berechnet, damit der Server sie beim Replay exakt reproduziert. Junk wird als Pseudo-Zug im `moveLog` protokolliert (siehe 5).

> Der Junk-Zell-Typ `t:'j'` ist die **EINZIGE** noetige Aenderung am deterministischen Core. `www/game/core.js` UND `supabase/functions/_shared/goat-core.js` muessen danach wieder **byte-identisch** sein, Drift-Guard-Test gruen, `submit-goat-score` neu deployen. **AI-LOCK — nur mit User-OK.**

---

## 5. Latenz- & Desync-Handling

- Broadcast ist Fire-and-Forget (optional `ack`). Da beide Boards deterministisch aus dem Seed laufen, ist die **einzige** Desync-Gefahr die **Reihenfolge** von Junk-Injektionen relativ zu den eigenen Zuegen des Empfaengers.
- **Loesung:** Empfangener Junk wird NICHT sofort ins Grid geschrieben, sondern in eine **pending-Queue** gelegt und **deterministisch VOR dem naechsten eigenen Zug** angewendet — mit einer `seq`-Nummer im `moveLog` protokolliert. So sehen Live-Anzeige und Server-Replay dieselbe Reihenfolge.
- Kleine Uhr-Drift bei Heat/Zeitdruck ist unkritisch, weil der finale Score aus dem Replay kommt.

---

## 6. Anti-Cheat (baut 1:1 auf `submit-goat-score` auf)

Am Rundenende ruft **jeder** Client Edge Function `submit-match`:

```
{ match_id, seed, my_moves (inkl. angewandter Junk als Pseudo-Zuege), duration_ms }
```

Server:
1. JWT -> `user_id`; prueft `user_id IN (host_id, guest_id)`.
2. `GoatCore.replay(seed, my_moves)` (Core kennt Junk nach Erweiterung) -> **Server-Score**.
3. Schreibt `host_score`/`guest_score` + `host_replay_ok`/`guest_replay_ok`.
4. Sobald **BEIDE** abgegeben haben (oder eine Seite + Timeout): `winner_id` = hoeherer verifizierter Server-Score.
5. Nur einseitiger Submit + Gegner-Timeout -> abgebender Spieler gewinnt (Aufgabe).
6. **Client-Score wird ignoriert** (wie im Single-Player).

**Zusatz-Plausis:**
- Injizierte Junk-Events muessen zu einem `gadget`-Log passen, das die **Gegenseite** (via ihr `match_move`) belegt. Selbst-injizierter Fake-Junk faellt auf (kein passendes Absender-Gadget).
- `duration_ms` Mindestwert, `MAX_MOVES`-Cap (wie heute).
- Gadget-Anzahl <= tatsaechlich gekaufte (`coin_transactions`-Abgleich).

---

## 7. Abbruch & Reconnect

- `presence.leave` startet **8-s-Grace**.
- Client versucht **Rejoin**: Kanal neu, State resynchronisieren durch erneutes Abspielen des `match_move`-Logs des Gegners bis `seq`.
- Kein Rejoin in 8 s -> `status='aborted'` / Sieg-durch-Aufgabe fuer den verbliebenen Spieler (falls dessen Submit valide).
- **Capacitor/App-Background:** `visibilitychange` setzt Presence auf `away`. Der WebSocket kann sterben -> als Abbruch werten, **nicht** als Cheat. Score bleibt korrekt (kommt aus Replay).

---

## 8. Rangwertung (ELO)

- Neue Tabelle `pvp_rating (user_id, elo int default 1000, wins, losses, streak, university)`.
- Nach jedem `finished`-Match: `finalize-match` aktualisiert ELO beider Spieler (Standard-Formel, K=32) + Coins: Gewinner **+30**, Verlierer **+5** (Trostpreis).
- View `pvp_leaderboard` (join `public_profiles`) analog `goat_leaderboard`, Tabs **Global / Meine Uni**.
- Geist/Bot-Matches zaehlen NICHT fuer ELO.

---

## 9. Datenmodell (additiv, nur `create if not exists`)

Neue Migration: `supabase/migrations/20260830NNNNNN_pvp_match.sql` (NNNNNN = laufende Nummer am Tag).

```sql
-- Match-Raum
create table if not exists public.match (
  id            uuid primary key default gen_random_uuid(),
  seed          bigint not null,
  mode          text not null default 'high' check (mode in ('high','daily')),
  status        text not null default 'lobby'
                check (status in ('lobby','queue','ready','active','finished','aborted')),
  host_id       uuid not null references auth.users(id) on delete cascade,
  guest_id      uuid references auth.users(id) on delete set null,
  join_code     text unique,
  university    text,
  host_score    integer,
  guest_score   integer,
  host_replay_ok  boolean not null default false,
  guest_replay_ok boolean not null default false,
  winner_id     uuid references auth.users(id) on delete set null,
  is_ghost      boolean not null default false,   -- Geist-Gegner (zaehlt nicht fuer ELO)
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists match_status_idx on public.match (status, created_at);
create index if not exists match_players_idx on public.match (host_id, guest_id);

-- Zug-Audit (append-only, Quelle fuer Server-Replay). Wird gebatcht via Edge Function geschrieben.
create table if not exists public.match_move (
  id         bigint generated always as identity primary key,
  match_id   uuid not null references public.match(id) on delete cascade,
  player_id  uuid not null references auth.users(id) on delete cascade,
  seq        integer not null,
  idx        smallint,
  r          smallint,
  c          smallint,
  t          integer,           -- ms seit Rundenstart (Heat)
  kind       text default 'mv'  -- 'mv' | 'junk' | 'gadget'
);
create index if not exists match_move_match_idx on public.match_move (match_id, player_id, seq);

-- ELO/Wertung
create table if not exists public.pvp_rating (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  elo        integer not null default 1000,
  wins       integer not null default 0,
  losses     integer not null default 0,
  streak     integer not null default 0,
  university text,
  updated_at timestamptz not null default now()
);

alter table public.match      enable row level security;
alter table public.match_move enable row level security;
alter table public.pvp_rating enable row level security;

-- Lesen: nur eigene Matches (Spieler ist host/guest)
drop policy if exists match_select on public.match;
create policy match_select on public.match for select to authenticated
  using (host_id = auth.uid() or guest_id = auth.uid());

-- match_move + pvp_rating: KEINE Client-Writes. Nur Service Role (Edge Functions) schreibt.
drop policy if exists match_move_select on public.match_move;
create policy match_move_select on public.match_move for select to authenticated
  using (exists (select 1 from public.match m
                 where m.id = match_id and (m.host_id = auth.uid() or m.guest_id = auth.uid())));

drop policy if exists pvp_rating_select on public.pvp_rating;
create policy pvp_rating_select on public.pvp_rating for select to authenticated using (true);

-- Leaderboard-View (analog goat_leaderboard)
create or replace view public.pvp_leaderboard as
select pr.user_id, pr.elo, pr.wins, pr.losses, pp.username, pp.university
from public.pvp_rating pr
join public.public_profiles pp on pp.id = pr.user_id;
grant select on public.pvp_leaderboard to anon, authenticated;
```

RPCs (SECURITY DEFINER, im selben Migrations-File): `create_match`, `join_match`, `find_match` (Queue mit `FOR UPDATE SKIP LOCKED`), `spend_match_gadget` (atomar: Cooldown/Cap pruefen + `add_coins` negativ). `add_coins` bleibt Service-Role-only; `spend_match_gadget` kapselt den Abzug serverseitig.

> Nur additiv. **Kein DROP/TRUNCATE.** Vor dem Anwenden Schema-Restore-Punkt ziehen (`kritische-pfade.md`).

---

## 10. Edge Functions

| Function | JWT | Aufgabe |
|---|---|---|
| `create-match` | ja | Match anlegen, Seed + Join-Code erzeugen |
| `join-match` | ja | Code einloesen, guest setzen, status ready |
| `find-match` | ja | Quick-Match Queue (Phase 2) |
| `submit-match` | ja | Zugkette replayen (Server-Score), match_move batch-schreiben, replay_ok setzen |
| `finalize-match` | intern/Service | winner_id, ELO, Coins; von submit-match oder Cron (Timeout) getriggert |

`submit-match` importiert denselben `_shared/goat-core.js` wie `submit-goat-score` (byte-identisch, Junk-faehig).

---

## 11. Client-Dateien (hinter Feature-Flag)

- **`www/game/pvp.js`** (neu): Kanal, Presence, Broadcast, doppelter Core-State (self+opp), Gegner-Mini-Board, deterministische Junk-pending-Queue, Countdown, Reconnect-Resync.
- **`www/game/index.html`**: Duell-Button + Gegner-HUD + Gadget-Leiste, alles unter `data-feature="pvp"` (features.js-Flag `pvp`, default false).
- **`www/features.js`**: Flag `pvp` ergaenzen (Guard/DOM-Hider bestehen bereits).

---

## 12. Phasen & Aufwand

| Phase | Inhalt | Aufwand |
|---|---|---|
| 0 | Go/No-Go, Flag, Recht, Scope = nur Freunde-Duell | 1-2 Tage |
| 1 | Core: Junk-Zell-Typ `t:'j'` (AI-LOCK, byte-identisch, Drift-Test) | 3-5 Tage |
| 2 | DB-Schema + RPCs (Migration additiv) | 3-4 Tage |
| 3 | Realtime-Sync-Client `pvp.js` (aufwaendigster Teil) | 1.5-2 Wochen |
| 4 | Lobby/Matchmaking-UI + Edge Functions (inkl. submit-match) | 1.5-2 Wochen |
| 5 | Gadget-UX + Balancing + Geist-Fallback | 1 Woche |
| 6 | Anti-Cheat-Haertung, E2E-Zwei-Sessions-Test, stufenweiser Rollout | 1 Woche |

**Gesamt realistisch: 6-8 Wochen** (eine Person, bis stabil-live).
**MVP (nur Freunde-Duell, kein ELO/Bot/Quick-Match): ~3 Wochen.**

---

## 13. Risiken (klar benannt)

1. **Ghost-Town (groesstes, nicht-technisch):** PvP braucht Gleichzeitige. Bei ~0 aktiven Nutzern totes Feature. -> Freunde-Duell + async + Geist zuerst; offenes Matching erst ab ~200-400 DAU.
2. **Junk-Desync:** Falsche Reihenfolge -> `replay_ok=false` -> Frust. Muss ueber strikte seq-pending-Queue geloest werden (Phase 3).
3. **AI-LOCK-Core-Aenderung:** Junk-Typ bricht bei Fehler AUCH den Single-Player-Submit. User-OK + Drift-Guard + Redeploy `submit-goat-score`.
4. **Realtime-Limits/Kosten:** Concurrent-Connections + Message-Limits je Supabase-Plan; `state`-Heartbeat auf 1/s deckeln.
5. **Coins-Oekonomie:** Gadgets als Sink koennen die Coupon-Einloese-Oekonomie verzerren. Kosten konservativ, Caps hart.
6. **Capacitor Background:** WebSocket stirbt im Hintergrund -> als Abbruch werten, nicht als Cheat.
7. **Scope-Creep:** ELO+Quick-Match+Bots gleichzeitig = Ueberladung. Strikt sequenziell bauen.

---

## 14. Empfehlung

Bauen **lohnt sich erst**, wenn absehbar genug Spieler gleichzeitig online sind (Richtwert ~200-400 DAU bzw. genug pro Uni). Bis dahin:
- Falls Yusuf PvP trotzdem will: **nur MVP Freunde-Duell + Geist-Gegner** (~3 Wochen), Rest hinter Flag.
- Andernfalls: **verschieben** und die Energie in Nutzer-Wachstum (Ersti-QR, Referral) stecken — mehr Nutzer machen PvP erst wertvoll und sind auch fuer alles andere der Hebel.
