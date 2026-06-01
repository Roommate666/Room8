# TODOs — Room8

**Geplante Verbesserungen & offene Aufgaben.** Live-Bug-/Security-Tracking laeuft in
[BUGS-OFFEN.md](./BUGS-OFFEN.md); diese Datei ist die Vorwaerts-Roadmap.

---

## Hinweise fuer Claude

- Diese Datei am Session-Start lesen (nach `_GOLDEN-RULES.md` + `CLAUDE.md`).
- Vor neuer Arbeit pruefen, ob hier schon ein passender Punkt existiert.
- Erledigtes nach **Erledigt** verschieben (mit Datum).
- Neue Erkenntnisse waehrend einer Session hier ergaenzen.

---

## Hoch (terminkritisch)

- [ ] **Apple OAuth JWT erneuern — VOR 11.09.2026**
  - Laeuft 180 Tage nach Erstellung ab (letzte Erneuerung 15.03.2026). Verstreicht der
    Termin, bricht iOS-Login fuer ALLE User. Tool: `tools/generate-apple-jwt.js`.
  - Siehe `_GOLDEN-RULES.md` Regel 9.

---

## Mittel

- [ ] **CSP von Report-Only auf enforcing umstellen**
  - In `www/vercel.json` laeuft die Content-Security-Policy aktuell als
    `Content-Security-Policy-Report-Only`. Nach Live-Phase ohne Violations auf
    `Content-Security-Policy` umstellen.
  - **Voraussetzung:** Idealerweise vorher die 257 Inline-Event-Handler (`onclick=` etc.)
    reduzieren, damit `script-src` ohne `'unsafe-inline'` auskommt (Nonces/Hashes).
  - **Added:** 01.06.2026

- [ ] **createClient-Dedup in www/-HTML**
  - Mehrere Seiten bauen einen eigenen Supabase-Client statt das globale `window.sb`
    (aus `config.js`) zu teilen. Kein Bug, aber sauberer + ein Key-Punkt weniger.
  - **Added:** 01.06.2026

- [ ] **Submissions editieren / zurueckziehen (F4)**
  - User koennen eingereichte Inhalte aktuell weder editieren noch withdrawen.

---

## Niedrig / Nice-to-have

- [ ] **Optional: Git-History verschlanken**
  - Binaer-Ballast (supabase.exe, www.zip, www_backup_*, roommate_full_updated/) wurde aus
    dem Tracking entfernt, steckt aber noch in der History → `.git` bleibt gross.
  - `git filter-repo` schrumpft die History, ABER: schreibt sie um → force-push noetig,
    bricht bestehende Klone (Yusufs USB-Stick-Sync Win↔Mac beachten). Nur abgestimmt.

- [ ] **Job-Bewerbungs-Inbox (F3)** — internes Tracking statt nur extern (Email/URL).
- [ ] **Login-UX (F5)** — Hinweis "Du hast dich mit Google/Apple angemeldet" auf dem Login-Tab.

---

## Offene Tests (Verifikation steht aus)

- [ ] **F6** Push-Emojis: FCM mit UTF-8-Emojis live testen.
- [ ] **F7** DE/EN-Sprachumschaltung systematisch durchspielen (translations.js).
- [ ] **F8** Email-Versand: echte Mail in Inbox bestaetigen.

---

## Erledigt

- [x] **Quality-Pass 01.06.2026:** www/ als Single Source of Truth, Repo-Ballast aus
  Tracking entfernt, Security-Header in vercel.json, B5/B19/B20/B21 gefixt.
- [x] Security-Phase 1+2 (04.05.2026): siehe BUGS-OFFEN.md (S1–S13, B1–B12, N1).
