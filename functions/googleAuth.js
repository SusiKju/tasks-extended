/**
 * TE-43: Google-Login ohne wiederkehrendes Pop-up.
 *
 * Der Browser bekommt von Google nie ein Refresh-Token. Deshalb tauscht die
 * Web-App beim (einmaligen) Verbinden einen Autorisierungscode hier gegen
 * Tokens; das Refresh-Token bleibt serverseitig in `googleTokens/{uid}`
 * (Firestore-Rules sperren die Collection für Clients komplett). Neue
 * Access-Tokens holt die App danach still über `googleAccessToken`.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

if (getApps().length === 0) initializeApp();

const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET');
const GOOGLE_CLIENT_ID = '934256455571-posu4ic37t03v4krthiph71pik127ljn.apps.googleusercontent.com';
const OPTS = { region: 'europe-west1', secrets: [GOOGLE_CLIENT_SECRET] };

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET.value(),
      ...params,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function requireUid(req) {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Nicht angemeldet');
  return uid;
}

/** Code (GIS Code-Client, ux_mode popup) → Tokens; Refresh-Token wird gespeichert. */
exports.googleExchangeCode = onCall(OPTS, async (req) => {
  const uid = requireUid(req);
  const code = String(req.data?.code ?? '');
  if (!code || code.length > 2048) throw new HttpsError('invalid-argument', 'code fehlt');

  // Beim Popup-Modus von GIS ist die redirect_uri fest 'postmessage'.
  const { ok, data } = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: 'postmessage' });
  if (!ok || !data.access_token) {
    throw new HttpsError('permission-denied', `Code-Tausch fehlgeschlagen: ${data.error ?? 'unbekannt'}`);
  }

  // Google liefert das Refresh-Token nur bei (erneuter) Zustimmung – ein
  // vorhandenes nicht mit „leer“ überschreiben.
  if (data.refresh_token) {
    await getFirestore().doc(`googleTokens/${uid}`).set({
      refreshToken: data.refresh_token,
      scope: data.scope ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return {
    accessToken: data.access_token,
    expiresIn: Number(data.expires_in) || 3600,
    hasRefreshToken: !!data.refresh_token,
  };
});

/** Liefert still ein frisches Access-Token aus dem gespeicherten Refresh-Token. */
exports.googleAccessToken = onCall(OPTS, async (req) => {
  const uid = requireUid(req);
  const ref = getFirestore().doc(`googleTokens/${uid}`);
  const snap = await ref.get();
  const refreshToken = snap.exists ? snap.get('refreshToken') : null;
  if (!refreshToken) throw new HttpsError('failed-precondition', 'Kein Refresh-Token gespeichert');

  const { ok, data } = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  if (!ok || !data.access_token) {
    // invalid_grant = Zugriff widerrufen/abgelaufen → Token verwerfen, App fällt aufs Pop-up zurück.
    if (data.error === 'invalid_grant') await ref.delete();
    throw new HttpsError('failed-precondition', `Refresh fehlgeschlagen: ${data.error ?? 'unbekannt'}`);
  }
  return { accessToken: data.access_token, expiresIn: Number(data.expires_in) || 3600 };
});

/** Beim Trennen in den Einstellungen: gespeichertes Refresh-Token löschen. */
exports.googleForget = onCall({ region: 'europe-west1' }, async (req) => {
  const uid = requireUid(req);
  await getFirestore().doc(`googleTokens/${uid}`).delete();
  return null;
});
