/**
 * fussballDeMatchplan
 *
 * Reiner CORS-Proxy für den öffentlichen Spielplan-Endpunkt von fussball.de
 * (siehe src/services/fussballDe.ts). Browser dürfen fussball.de nicht direkt
 * per fetch() lesen (kein Access-Control-Allow-Origin dort) – diese Funktion
 * holt die HTML-Seite serverseitig und reicht sie mit CORS-Header durch.
 *
 * teamId wird auf ein enges Format geprüft (keine beliebige Ziel-URL), damit
 * die Funktion kein offener Proxy für fremde Seiten wird.
 */

const { onRequest } = require('firebase-functions/v2/https');

const TEAM_ID_RE = /^[A-Za-z0-9]{10,40}$/;

exports.fussballDeMatchplan = onRequest(
  { region: 'europe-west1', cors: true },
  async (req, res) => {
    const teamId = String(req.query.teamId ?? '');
    if (!TEAM_ID_RE.test(teamId)) {
      res.status(400).send('teamId fehlt oder ungültig');
      return;
    }

    const upstream = await fetch(
      `https://www.fussball.de/ajax.team.matchplan/-/mode/PAGE/team-id/${teamId}`
    );
    if (!upstream.ok) {
      res.status(upstream.status).send(`fussball.de: HTTP ${upstream.status}`);
      return;
    }

    const html = await upstream.text();
    res.set('Cache-Control', 'public, max-age=120');
    res.type('html').send(html);
  }
);

// TE-43: Google-Token-Tausch/-Refresh ohne Pop-up
Object.assign(exports, require('./googleAuth'));
