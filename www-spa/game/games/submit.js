/* Verdrahtet window.__submit fuer die neuen Spiele -> Edge Function submit-score.
   Braucht window.sb (aus ../../../config.js). Nur eingeloggte Nutzer, sonst still.
   Spiel bleibt entkoppelt: es ruft nur window.__submit(payload) auf. */
(function () {
  'use strict';
  window.__submit = async function (payload) {
    try {
      if (!window.sb || !payload) return;
      var res = await sb.auth.getUser();
      var user = res && res.data ? res.data.user : null;
      if (!user) return; // nur eingeloggt werten
      var eventId = null;
      try {
        var r = await sb.from('current_game_event').select('id').limit(1);
        if (r.data && r.data[0]) eventId = r.data[0].id;
      } catch (e) {}
      var body = {
        game_key: payload.game_key,
        seed: payload.seed,
        score: payload.score,
        input_log: payload.input_log,
        mode: payload.mode || 'high',
        event_id: eventId,
      };
      await sb.functions.invoke('submit-score', { body: body });
    } catch (e) { /* still: Spielfluss nie stoeren */ }
  };
})();
