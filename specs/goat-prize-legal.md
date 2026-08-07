# Goat Blast Preisgeld — Rechts-Check (Stand 08.08.2026)

> **KEIN Rechtsrat.** Fundierte Ersteinschaetzung + Umsetzungs-Vorgaben. Vor dem ersten echten
> Preis MUSS ein Anwalt (Wettbewerbs-/Gluecksspielrecht) die Teilnahmebedingungen freigeben.
> Kosten dafuer sind klein gegen Abmahn-/Bussgeldrisiko.

## Ampel: GRUEN — wenn wir es als kostenloses Skill-Gewinnspiel bauen
Entscheidend ist die Abgrenzung **Gluecksspiel vs. Gewinnspiel**:
- **Gluecksspiel** (GlueStV, lizenzpflichtig, streng) = **Einsatz** (Geld/geldwert) + Zufall + Gewinnchance.
- **Gewinnspiel** = KEIN verpflichtender Einsatz -> faellt NICHT unter den GlueStV, nur leichtere Regeln (v.a. UWG, DSGVO).
- **Geschicklichkeitsspiel** = Ausgang primaer durch Koennen bestimmt (bei uns: skill-basierter Highscore + Server-Replay).

**Unser Setup ist unkritisch, SOLANGE:** die Teilnahme **gratis** ist (kein Kauf, kein Einsatz, keine
Coupon-/Geld-Abgabe zum Spielen) UND der Gewinner ueber **Koennen** (Highscore) ermittelt wird.
Dann = Gewinnspiel/Preisausschreiben, kein Gluecksspiel, keine Lizenz noetig.

## VERBINDLICHE Design-Vorgaben (im Produkt hart einhalten)
1. **Kein Einsatz, nie.** Spielen + Teilnahme immer 0 EUR. Keine In-App-Kaeufe fuer Teilnahme/Extra-Versuche/Booster, die den Score beeinflussen. (Kosmetik-IAP ohne Score-Einfluss waere ok — aber im Zweifel weglassen.)
2. **Gewinner = Skill.** Rang nach Score (nur `replay_validated=true`). Bei Gleichstand: frueherer Zeitstempel gewinnt (KEINE Zufalls-Ziehung -> haelt es klar im Geschicklichkeits-Bereich).
3. **Preise bevorzugt Sachpreise/Gutscheine** (Campus-Coupons, Gutscheine). Bargeld ("Preisgeld") ist bei Gratis-Gewinnspiel rechtlich zulaessig, macht aber Steuer/Abwicklung komplizierter -> **Empfehlung: Gutscheine statt Bargeld** (Yusuf-Entscheid noetig).
4. **Teilnahmebedingungen sichtbar + akzeptiert** vor erster Wertung (UWG-Transparenz, § 6 UWG). Ein-Klick-Zustimmung + Link, gespeichert.
5. **Veranstalter klar benennen** (rechtliche Einheit + Anschrift + Impressum). Apple/Google sind ausdruecklich NICHT Sponsor/Veranstalter.
6. **Teilnahmeberechtigung:** Wohnsitz DE, **Mindestalter 18** (einfachste Variante; Studenten meist 18+). Minderjaehrige = Eltern-Einwilligung noetig -> zur Vereinfachung 18+ verlangen. Mitarbeiter/Angehoerige (Yusuf, Mirac, Room8-Team) ausgeschlossen.
7. **Fairness/Manipulation:** Server-Replay-Validierung dokumentieren; Cheating -> Disqualifikation (steht in den Bedingungen). Nur `replay_validated=true` ist preisberechtigt.
8. **Zeitraum + Ende** klar (woechentlicher Zyklus: Start/Ende, Bekanntgabe, Frist zur Preisannahme).
9. **DSGVO:** erhobene Daten (user_id, Score, Uni, Kontakt zur Preisuebergabe) + Zweck + Rechtsgrundlage + Speicherdauer in Datenschutz/Teilnahmebedingungen. Kein Verkauf/Weitergabe.
10. **Rechtsweg ausgeschlossen; keine Barauszahlung von Sachpreisen; Aenderungs-/Abbruchvorbehalt** (Standard-Klauseln).

## App-Store-Compliance (Room8 ist App!)
- **Apple 3.2.1:** Sweepstakes/Contests muessen vom Entwickler gesponsert sein, offizielle Regeln haben, Entwickler traegt Verantwortung; Apple darf nicht als Sponsor genannt werden. Kein bezahlter Zugang ausserhalb Apple-Billing (bei uns: gratis -> unkritisch).
- **Google Play (Update 28.10.2025):** "Sweepstake-Model Games" werden strenger (Richtung Gluecksspiel-Policy) eingestuft — zielt auf **einsatzbasierte** Modelle/Ads. Unser **gratis Skill-Contest mit Gutscheinen** sollte ausserhalb liegen, ist aber bei Einreichung/Update **explizit zu pruefen** (ggf. Age-Restricted-Content-Policy vom 30.10.2025 beachten).
- **Konsequenz:** Preis-Feature so bauen, dass es auch bei App-Review als "kostenloses Gewinnspiel mit offiziellen Regeln" klar erkennbar ist (Regel-Link im Feature).

## Steuer (kurz, kein Steuerrat)
- Sachpreise/Gutscheine an Privatpersonen aus Gratis-Gewinnspiel: i.d.R. keine Einkommensteuer beim Gewinner (keine Einkunftsart) — solange nicht Gegenleistung fuer eine Leistung.
- Fuer die Firma: Marketingaufwand. Bei Bargeld ggf. Aufzeichnungs-/Nachweispflichten -> Steuerberater fragen, wenn Bargeld.

## OFFENE PUNKTE fuer den Anwalt (konkret abfragen)
1. Reicht unser Gratis-Skill-Modell zweifelsfrei als Gewinnspiel (kein GlueStV)? Auch wenn Preise regelmaessig/woechentlich?
2. Gutscheine vs. Bargeld — Empfehlung + steuerliche Folgen.
3. Muss Mindestalter 18 sein, oder reicht Eltern-Einwilligung bei <18? (Uni-Zielgruppe)
4. Pflichtinhalte der Teilnahmebedingungen final absegnen (Entwurf unten).
5. Kopplung "Spiel in Coupon-App -> Campus-Coupons als Preis" wettbewerbsrechtlich unbedenklich?
6. Google-Play-Einstufung nach Okt-2025-Update fuer unser Modell.

---

## ENTWURF Teilnahmebedingungen (Platzhalter — anwaltlich pruefen, NICHT ungeprueft live)
**Veranstalter:** [RECHTLICHE EINHEIT, Anschrift, Impressum-Link]
**1. Teilnahme kostenlos.** Kein Kauf, kein Einsatz noetig. Es genuegt ein kostenloses Room8-Konto.
**2. Teilnahmeberechtigt:** natuerliche Personen mit Wohnsitz in Deutschland, mind. 18 Jahre. Ausgeschlossen: Mitarbeiter des Veranstalters und deren Angehoerige.
**3. Zeitraum:** woechentlich, [Start] bis [Ende] (jeweils [Wochentag/Uhrzeit], Zeitzone Europe/Berlin).
**4. Ablauf/Gewinnermittlung:** Es gewinnt, wer im Zeitraum den hoechsten serverseitig bestaetigten Punktestand ([global] und/oder [je Hochschule]) erreicht. Bei Gleichstand entscheidet der fruehere Erreichungszeitpunkt. Nur nachgerechnete (`replay_validated`) Ergebnisse sind gueltig.
**5. Preise:** [z.B. Campus-Gutschein im Wert von X EUR]. Keine Barauszahlung, kein Umtausch, keine Uebertragung.
**6. Benachrichtigung:** Gewinner werden binnen [X Tagen] ueber die im Konto hinterlegten Kontaktdaten informiert; Meldung binnen [Y Tagen] noetig, sonst Verfall/Nachrücken.
**7. Manipulation:** Bei Betrug/Cheating/Mehrfachkonten erfolgt Ausschluss und Aberkennung.
**8. Datenschutz:** Zur Durchfuehrung werden [user_id, Punktestand, Hochschule, Kontaktdaten] verarbeitet (Art. 6 Abs. 1 b/f DSGVO). Details: [Datenschutz-Link]. Keine Weitergabe zu Werbezwecken ohne Einwilligung.
**9. Aenderung/Abbruch:** Der Veranstalter kann das Gewinnspiel bei wichtigem Grund aendern/beenden.
**10. Sonstiges:** Der Rechtsweg ist ausgeschlossen. Apple/Google sind weder Sponsor noch Veranstalter und stehen in keiner Verbindung zum Gewinnspiel. Es gilt deutsches Recht.

---

## Freigabe-Gate fuer Phase-3-Bau
- [ ] Yusuf entscheidet: **Gutscheine** (empfohlen) oder Bargeld
- [ ] Yusuf entscheidet: Veranstalter-Einheit + Impressum
- [ ] Anwalt gibt Teilnahmebedingungen frei
- [ ] DANN erst: Preis-Auszahlung/Terms-Zustimmung im Produkt scharf schalten

**Bis dahin baubar OHNE Rechtsfreigabe (weil kein Geld fliesst):**
woechentliche Aggregation der Top-Scores + Gewinner-Ermittlung (read-only, nur `replay_validated`),
Anzeige "Wochensieger", Terms-Zustimmungs-Flag im Konto. Auszahlung bleibt AUS bis Freigabe.
