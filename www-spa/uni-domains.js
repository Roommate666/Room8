// uni-domains.js — Klassifizierung von E-Mail-Domains fuer die Studenten-Verifizierung
//
// Strategie (Whitelist-first, statt nur Blocklist):
//   1. Bekannte Freemailer (gmail, gmx, ...) -> sofort abgelehnt
//   2. Domain matcht ein akademisches Muster (uni-*.de, .edu, .ac.at, ...) -> akzeptiert
//   3. Domain steht in der kuratierten DACH-Hochschulliste -> akzeptiert
//   4. Alles andere (z.B. eigene Firmen-Domain) -> NICHT per Mail erlaubt -> Dokument-Upload
//
// Warum kein 9000-Eintraege-Welt-Datensatz: zu gross fuer jeden Pageload. Muster + kuratierte
// Liste decken den realen DACH-Markt sehr gut ab; alle Sonderfaelle laufen ueber Doku-Upload.
//
// WICHTIG: Diese Pruefung ist clientseitig und damit per DevTools umgehbar. Die wirkliche
// Sicherheit ist der Mail-Besitz (Verifizierungs-Link geht an die eingegebene Adresse).
// Fuer vollstaendigen Schutz muss die verify-uni-token Edge-Function dieselbe Domain-Pruefung
// nochmal serverseitig durchfuehren (siehe TODO in CLAUDE.md / specs/auth-and-verify.md).

(function () {
  'use strict';

  // 1. Bekannte private Anbieter — niemals als Uni-Mail akzeptieren
  var BLOCKED_DOMAINS = [
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.de', 'yahoo.co.uk', 'yahoo.fr',
    'hotmail.com', 'hotmail.de', 'hotmail.co.uk', 'hotmail.fr',
    'outlook.com', 'outlook.de',
    'live.com', 'live.de',
    'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'aol.de',
    'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'gmx.com',
    'web.de',
    'freenet.de',
    'arcor.de',
    'mail.com', 'email.com',
    'zoho.com',
    'yandex.com', 'yandex.ru',
    'mail.ru',
    'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me',
    'tutanota.com', 'tutamail.com', 'tuta.io',
    'posteo.de', 'posteo.net',
    'mailbox.org',
    't-online.de',
    'vodafone.de',
    'o2online.de',
    'bluewin.ch',
    'sunrise.ch',
    'orange.fr',
    'laposte.net',
    'libero.it',
    'seznam.cz',
    'wp.pl', 'onet.pl', 'interia.pl',
    'rambler.ru',
    'ukr.net',
    'inbox.com', 'inbox.lv',
    'fastmail.com',
    'hushmail.com',
    'disroot.org',
    'riseup.net'
  ];

  // 2. Akademische Muster — decken den Grossteil der DACH-Hochschulen automatisch ab.
  //    Geprueft wird die volle Domain (z.B. "stud.uni-augsburg.de").
  var ACCEPT_PATTERNS = [
    /(^|\.)uni-[a-z-]+\.de$/,        // uni-augsburg.de, stud.uni-koeln.de
    /(^|\.)tu-[a-z-]+\.de$/,         // tu-berlin.de, mail.tu-dortmund.de
    /(^|\.)th-[a-z-]+\.de$/,         // th-koeln.de, th-nuernberg.de
    /(^|\.)fh-[a-z-]+\.de$/,         // fh-aachen.de, fh-muenster.de
    /(^|\.)hs-[a-z-]+\.de$/,         // hs-augsburg.de, hs-kempten.de
    /(^|\.)htw-?[a-z-]*\.de$/,       // htw-berlin.de, htwg-konstanz.de, htwk-leipzig.de
    /(^|\.)hwr-[a-z-]+\.de$/,        // hwr-berlin.de
    /(^|\.)hsw?-?[a-z-]*\.de$/,      // diverse Hochschul-Kuerzel
    /\.hochschule(-[a-z]+)?\.de$/,   // *.hochschule-*.de
    /(^|\.)dhbw[a-z-]*\.de$/,        // dhbw-stuttgart.de, lehre.dhbw-mannheim.de
    /(^|\.)ph-[a-z-]+\.de$/,         // ph-freiburg.de (Paedagogische Hochschulen)
    /\.edu$/,                        // international (kit.edu, harvard.edu)
    /\.edu\.[a-z]{2,3}$/,            // edu.tr, edu.pl, edu.au ...
    /\.ac\.at$/,                     // Oesterreich: tuwien.ac.at, univie.ac.at
    /\.ac\.uk$/,                     // UK
    /\.ac\.[a-z]{2}$/                // weitere academic ccTLDs
  ];

  // 3. Kuratierte Liste grosser DACH-Hochschulen, die KEINEM Muster folgen.
  var KNOWN_UNI_DOMAINS = [
    // --- Deutschland (musterlos) ---
    'tum.de', 'mytum.de',                 // TU Muenchen
    'lmu.de', 'campus.lmu.de',            // LMU Muenchen
    'rwth-aachen.de',                     // RWTH Aachen
    'fau.de',                             // Erlangen-Nuernberg
    'kit.edu',                            // (matcht .edu, hier zur Sicherheit)
    'rptu.de',                            // RPTU Kaiserslautern-Landau
    'hu-berlin.de',                       // Humboldt
    'fu-berlin.de',                       // Freie Uni Berlin
    'charite.de',                         // Charite
    'tu-darmstadt.de',                    // (matcht tu-, zur Sicherheit)
    'kln.de',
    'haw-hamburg.de',                     // HAW Hamburg
    'hcu-hamburg.de',
    'macromedia.de',
    'iubh.de', 'iu.org',                  // IU Internationale Hochschule
    'srh.de',
    'leuphana.de',                        // Leuphana Lueneburg
    'jacobs-university.de', 'constructor.university',
    'wiso.uni-hamburg.de',
    'zhdk.ch',
    // --- Oesterreich (musterlos) ---
    'jku.at',                             // Linz
    'wu.ac.at',                           // (matcht .ac.at)
    'fhwn.ac.at',
    'fh-campuswien.ac.at',
    'aau.at',                             // Klagenfurt
    'plus.ac.at',                         // Salzburg
    'meduniwien.ac.at',
    // --- Schweiz (musterlos, .ch hat kein academic-Muster) ---
    'ethz.ch', 'student.ethz.ch',         // ETH Zuerich
    'epfl.ch',                            // EPF Lausanne
    'uzh.ch', 'student.uzh.ch',           // Uni Zuerich
    'unibas.ch',                          // Basel
    'unibe.ch', 'students.unibe.ch',      // Bern
    'unil.ch',                            // Lausanne
    'unige.ch',                           // Genf
    'unifr.ch',                           // Freiburg
    'unisg.ch',                           // St. Gallen
    'usi.ch',                             // Lugano
    'hslu.ch',                            // Luzern
    'zhaw.ch',                            // ZHAW
    'fhnw.ch',                            // FHNW
    'bfh.ch',                             // Berner Fachhochschule
    'ost.ch',                             // OST
    'hsr.ch'
  ];

  function extractDomain(email) {
    if (!email || email.indexOf('@') === -1) return null;
    var domain = email.split('@')[1];
    if (!domain) return null;
    return domain.trim().toLowerCase();
  }

  // Klassifiziert eine E-Mail. Liefert { accepted: bool, blocked: bool, domain: string }
  function classify(email) {
    var domain = extractDomain(email);
    if (!domain) return { accepted: false, blocked: false, domain: null };

    if (BLOCKED_DOMAINS.indexOf(domain) !== -1) {
      return { accepted: false, blocked: true, domain: domain };
    }
    for (var i = 0; i < ACCEPT_PATTERNS.length; i++) {
      if (ACCEPT_PATTERNS[i].test(domain)) {
        return { accepted: true, blocked: false, domain: domain };
      }
    }
    if (KNOWN_UNI_DOMAINS.indexOf(domain) !== -1) {
      return { accepted: true, blocked: false, domain: domain };
    }
    return { accepted: false, blocked: false, domain: domain };
  }

  window.Room8UniDomains = {
    classify: classify,
    // true wenn die Mail als Uni-Mail akzeptiert wird
    isUniEmail: function (email) { return classify(email).accepted; },
    // true wenn explizit ein Freemailer (fuer alte Aufrufer kompatibel)
    isBlockedEmail: function (email) { return classify(email).blocked; },
    BLOCKED_DOMAINS: BLOCKED_DOMAINS,
    KNOWN_UNI_DOMAINS: KNOWN_UNI_DOMAINS
  };
})();
