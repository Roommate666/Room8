-- Deal-der-Woche (15.10.2026): Push-Copy fuer die 9 Coupons ohne reminder_title/body setzen.
-- Baustein send_daily_coupon_reminders existiert (20260814000001); Copy personalisiert pro Coupon,
-- sonst Auto-Fallback. Diese 9 hatten noch keine. Texte = user-sichtbar -> echte Umlaute.

UPDATE public.coupons SET reminder_title='Fit ins Semester? 💪',
  reminder_body='Body Cult Ulm: 10% Studenten-Rabatt aufs Training. Pack''s an!'
 WHERE id='c3db9c9e-e8f1-4de1-8fde-22a877b861df';

UPDATE public.coupons SET reminder_title='Feierabend-Bier? 🍺',
  reminder_body='Casa de España: dein erstes Gericht + 0,5 L Fassbier gratis. Olé!'
 WHERE id='c167046d-beb1-46f0-a5b0-610013ccb7e3';

UPDATE public.coupons SET reminder_title='Auto wieder frisch? 🚗',
  reminder_body='EAK Autoaufbereitung: 10% Rabatt – ab 100 € sogar 20%.'
 WHERE id='402847c7-5023-4472-8d9c-7562ce78ad33';

UPDATE public.coupons SET reminder_title='Erster Monat gratis? 🏋️',
  reminder_body='GYM FACTORY: 1. Monat gratis + Studententarif. Leg los!'
 WHERE id='cc13da8b-ee69-4fc6-9b3f-0acdfc04345d';

UPDATE public.coupons SET reminder_title='Shisha-Abend? 🔥',
  reminder_body='Heart Shishabar: Shisha für nur 12 €. Zeit zum Chillen.'
 WHERE id='e1917831-0d2e-42de-8b4d-3f4bd34031c6';

UPDATE public.coupons SET reminder_title='Schluss mit Rasieren? ✨',
  reminder_body='Magic Beauty: gratis Laser-Probebehandlung Achseln. Jetzt testen.'
 WHERE id='68e39f65-08d8-47c8-8184-773b8ccef12e';

UPDATE public.coupons SET reminder_title='Tanzen lernen? 💃',
  reminder_body='Salsa Energy: 25% Studentenrabatt auf Salsa & Bachata.'
 WHERE id='cccd25c2-34e7-4049-b1c6-39226841f1a8';

UPDATE public.coupons SET reminder_title='Bock auf Shisha? 💨',
  reminder_body='Smoke Paradise: 40% auf deine Shisha – nur für Studis.'
 WHERE id='164e3386-0f45-4518-9ade-143871783d49';

UPDATE public.coupons SET reminder_title='Zwei linke Füße? 🕺',
  reminder_body='We dance: 15% auf alle Tanzkurse. Trau dich!'
 WHERE id='a0a0493b-0f0d-4c49-808c-325c6ce37566';
