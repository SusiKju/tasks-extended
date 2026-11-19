/**
 * sync-dfbnet-schiri.mjs
 *
 * Holt Lennys Schiedsrichter-Ansetzungen aus DFBnet (Schiriansetzung) und
 * trägt sie in den Google-Kalender „Lenny Fußball“ ein. Neue Spiele werden
 * angelegt, geänderte aktualisiert, abgesetzte bekommen den Präfix
 * „ABGESETZT:“ (so liest sie auch das Artefakt „Lennys Fußball-Termine“).
 *
 * DFBnet hat keine offizielle API. Das Skript macht denselben Login wie die
 * Web-App sria.dfbnet.org (Keycloak, Authorization Code + PKCE, Client
 * „referee-administration“) und ruft danach deren JSON-Endpunkte auf
 * api.dfbnet.org auf. Ändert DFBnet Login oder Endpunkte, bricht der Sync
 * mit einer Fehlermeldung ab – dann hier nachziehen.
 *
 * Läuft als GitHub-Actions-Cron (.github/workflows/sync-dfbnet-schiri.yml).
 * Env: DFBNET_USERNAME, DFBNET_PASSWORD (Lennys Kennung) und
 * FIREBASE_SERVICE_ACCOUNT (Service-Account-JSON; lokal ersatzweise
 * serviceAccount.json). Der Service-Account braucht im Kalender
 * „Lenny Fußball“ die Freigabe „Änderungen an Terminen vornehmen“, und im
 * GCP-Projekt muss die Google Calendar API aktiviert sein.
 *
 * Lokal: node scripts/sync-dfbnet-schiri.mjs --dry-run   (nur anzeigen)
 *        node scripts/sync-dfbnet-schiri.mjs --self-test (ohne Netz)
 */

import { createHash, createSign, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const CALENDAR_ID = '368423f48dec2934d70d66b6673d33c429a8480e894093769fde45a216e3950b@group.calendar.google.com';
const AUTH = 'https://auth.dfbnet.org/realms/dfbnet/protocol/openid-connect';
const CLIENT_ID = 'referee-administration';
const REDIRECT = 'https://sria.dfbnet.org';
const API = 'https://api.dfbnet.org/api/referee';
const DAY = 86400000;
const MATCH_DURATION_MS = 2 * 3600000;
const CANCEL_PREFIX = 'ABGESETZT: ';

const ROLE_LABEL = {
  REFEREE: 'SR',
  ASSISTANT_1: 'SRA 1',
  ASSISTANT_2: 'SRA 2',
  FOURTH_OFFICIAL: '4. Offizieller',
  MENTOR: 'Pate',
  OBSERVER: 'Beobachter',
};
const roleLabel = (role) => ROLE_LABEL[role] ?? role ?? '?';
const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Kalender-Event-ID aus der DFBnet-Spiel-ID: Google erlaubt nur [a-v0-9], Hex passt. */
export const eventIdFor = (matchId) => 'dfb' + createHash('sha1').update(matchId).digest('hex');

/** Baut den Kalendereintrag für eine Ansetzung. Rein, ohne Netz – siehe --self-test. */
export function buildEvent({ appointment, match, teamsById, venuesById, refereeId }) {
  const me = appointment.referees.find((r) => r.id === refereeId);
  const home = teamsById[match?.homeTeamId]?.name ?? 'Heim';
  const guest = teamsById[match?.guestTeamId]?.name ?? 'Gast';
  const venue = venuesById[match?.venueId];
  const cancelled = Boolean(match?.reasonForCancellation) || /CANCEL/i.test(match?.status ?? '');
  const kickoff = new Date(appointment.kickoff);

  const crew = appointment.referees
    .map((r) => `${roleLabel(r.role)}: ${r.firstName} ${r.lastName}${r.appointmentConfirmed ? '' : ' (unbestätigt)'}`)
    .join('\n');
  const description = [
    `DFBnet-Ansetzung: Lenny als ${me ? roleLabel(me.role) : 'Schiedsrichter'}`,
    match?.divisionName || appointment.league?.name || '',
    '',
    crew,
    '',
    me && !me.appointmentConfirmed ? '⚠️ Einteilung in DFBnet noch nicht bestätigt!' : '✅ Einteilung in DFBnet bestätigt',
    match?.comment ? `Bemerkung: ${match.comment}` : '',
    cancelled ? `Abgesetzt${match?.reasonForCancellation ? `: ${match.reasonForCancellation}` : ''}` : '',
    '',
    'Automatisch aus DFBnet übernommen – Änderungen hier werden beim nächsten Abgleich überschrieben.',
  ]
    .filter((line, i, all) => line !== '' || (all[i - 1] ?? '') !== '')
    .join('\n')
    .trim();

  return {
    id: eventIdFor(appointment.id),
    summary: `${cancelled ? CANCEL_PREFIX : ''}🟨 L Schiri: ${me ? roleLabel(me.role) : 'Einsatz'} – ${home} – ${guest}`,
    location: venue
      ? [venue.name, venue.address?.street, [venue.address?.zipCode, venue.address?.city].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', ')
      : '',
    description,
    start: { dateTime: kickoff.toISOString(), timeZone: 'Europe/Berlin' },
    end: { dateTime: new Date(kickoff.getTime() + MATCH_DURATION_MS).toISOString(), timeZone: 'Europe/Berlin' },
    extendedProperties: { private: { source: 'dfbnet', matchId: appointment.id } },
  };
}

// ---------- DFBnet ----------

/** Login wie die Web-App: Keycloak-Formular per HTTP abschicken, Code gegen Token tauschen. */
async function dfbnetLogin(username, password) {
  const verifier = b64url(randomBytes(32));
  const state = b64url(randomBytes(12));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: 'openid',
    state,
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
  });
  const page = await fetch(`${AUTH}/auth?${params}`, { redirect: 'manual' });
  const cookies = page.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const html = await page.text();
  const action = html.match(/action="([^"]*login-actions\/authenticate[^"]*)"/)?.[1]?.replaceAll('&amp;', '&');
  if (!action) throw new Error(`DFBnet-Loginseite unerwartet (HTTP ${page.status}) – hat sich der Login geändert?`);

  const res = await fetch(action, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies },
    body: new URLSearchParams({ username, password, credentialId: '' }),
  });
  const location = res.headers.get('location') ?? '';
  const back = location.startsWith(REDIRECT) ? new URL(location) : null;
  if (!back?.searchParams.get('code') || back.searchParams.get('state') !== state) {
    throw new Error(
      `DFBnet-Login fehlgeschlagen (HTTP ${res.status}). Zugangsdaten prüfen oder einmal im Browser anmelden – ` +
        'evtl. verlangt DFBnet eine Aktion (Passwort ändern, AGB).'
    );
  }

  const token = await fetch(`${AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code: back.searchParams.get('code'),
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    }),
  });
  if (!token.ok) throw new Error(`DFBnet-Token: HTTP ${token.status}`);
  return (await token.json()).access_token;
}

async function dfbnet(token, path, body) {
  const res = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DFBnet ${path.split('?')[0]}: HTTP ${res.status}`);
  return res.json();
}

async function loadEvents(token) {
  const info = await fetch(`${AUTH}/userinfo`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const refereeId = info.dfbnet_person_id;
  if (!refereeId) throw new Error('DFBnet-Userinfo ohne dfbnet_person_id');

  const query = new URLSearchParams({
    size: '100',
    page: '0',
    sort: 'kickoff,asc',
    from: new Date(Date.now() - 14 * DAY).toISOString(),
    until: new Date(Date.now() + 365 * DAY).toISOString(),
    'referee-id': refereeId,
  });
  const appointments = await dfbnet(token, `/appointment/with-match-details?${query}`);
  if (!appointments.length) return [];

  const matches = await dfbnet(token, `/match?${new URLSearchParams({ 'match-ids': appointments.map((a) => a.id).join(',') })}`);
  const teamIds = [...new Set(matches.flatMap((m) => [m.homeTeamId, m.guestTeamId]).filter(Boolean))];
  const venueIds = [...new Set(matches.map((m) => m.venueId).filter(Boolean))];
  const [teams, venues] = await Promise.all([
    teamIds.length ? dfbnet(token, `/club-team?${new URLSearchParams({ 'club-team-ids': teamIds.join(',') })}`) : [],
    venueIds.length ? dfbnet(token, '/venue/query', { venueIds }) : [],
  ]);
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const matchesById = byId(matches);
  return appointments.map((appointment) =>
    buildEvent({ appointment, match: matchesById[appointment.id], teamsById: byId(teams), venuesById: byId(venues), refereeId })
  );
}

// ---------- Google Calendar (Service-Account, JWT ohne Zusatzpaket) ----------

async function googleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(JSON.stringify(o));
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = b64url(createSign('RSA-SHA256').update(unsigned).sign(sa.private_key));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`Google-Token: HTTP ${res.status}`);
  return (await res.json()).access_token;
}

function calendarApi(token) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  return async (method, path = '', body) => {
    const res = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
    if (res.status === 404 && method === 'GET') return null;
    if (!res.ok) throw new Error(`Kalender ${method} ${path || '/'}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? null : res.json();
  };
}

const sameEvent = (a, b) =>
  a.summary === b.summary &&
  (a.location ?? '') === b.location &&
  (a.description ?? '') === b.description &&
  new Date(a.start?.dateTime).getTime() === new Date(b.start.dateTime).getTime() &&
  a.status !== 'cancelled';

async function syncCalendar(cal, events) {
  const timeMin = new Date(Date.now() - 14 * DAY).toISOString();
  const listed = await cal('GET', `?${new URLSearchParams({ timeMin, maxResults: '250', singleEvents: 'true', q: 'Schiri' })}`);
  const existing = listed?.items ?? [];

  for (const ev of events) {
    const current = existing.find((e) => e.id === ev.id) ?? (await cal('GET', `/${ev.id}`));
    if (current && sameEvent(current, ev)) continue;
    // Von Hand angelegter Eintrag für dasselbe Spiel (gleiche Anstoßzeit) wird durch den Sync-Eintrag ersetzt.
    for (const manual of existing.filter(
      (e) =>
        !e.extendedProperties?.private?.source &&
        e.summary?.includes('🟨 L Schiri') &&
        new Date(e.start?.dateTime).getTime() === new Date(ev.start.dateTime).getTime()
    )) {
      await cal('DELETE', `/${manual.id}`);
      console.log(`  manuellen Eintrag ersetzt: ${manual.summary}`);
    }
    if (current) await cal('PUT', `/${ev.id}`, { ...ev, status: 'confirmed' });
    else await cal('POST', '', ev);
    console.log(`  ${current ? 'aktualisiert' : 'neu'}: ${ev.start.dateTime.slice(0, 10)} ${ev.summary}`);
  }

  // Früher übernommene, künftige Spiele, die DFBnet nicht mehr liefert → abgesetzt.
  const ids = new Set(events.map((e) => e.id));
  for (const gone of existing.filter(
    (e) =>
      e.extendedProperties?.private?.source === 'dfbnet' &&
      !ids.has(e.id) &&
      new Date(e.start?.dateTime) > new Date() &&
      !e.summary.startsWith(CANCEL_PREFIX)
  )) {
    await cal('PATCH', `/${gone.id}`, { summary: CANCEL_PREFIX + gone.summary });
    console.log(`  abgesetzt: ${gone.summary}`);
  }
}

// ---------- Self-Test & Start ----------

function selfTest() {
  const appointment = {
    id: 'M1',
    kickoff: '2026-11-28T11:00:00+01:00',
    league: { name: 'Kreisliga' },
    referees: [
      { id: 'LENNY', role: 'REFEREE', firstName: 'Lenny', lastName: 'Redmann', appointmentConfirmed: false },
      { id: 'P', role: 'MENTOR', firstName: 'Anthony', lastName: 'Bias', appointmentConfirmed: true },
    ],
  };
  const match = { id: 'M1', homeTeamId: 'H', guestTeamId: 'G', venueId: 'V', divisionName: 'Kreisliga C', status: 'ACKNOWLEDGED' };
  const teamsById = { H: { name: 'TSV Reichenberg-Boxdorf 2' }, G: { name: '1. FFC Fortuna Dresden 2 (Mä)' } };
  const venuesById = { V: { name: 'SpA Reichenberg Kunstrasen', address: { street: 'Dresdner Str. 69', zipCode: '01468', city: 'Moritzburg' } } };

  const ev = buildEvent({ appointment, match, teamsById, venuesById, refereeId: 'LENNY' });
  assert.equal(ev.summary, '🟨 L Schiri: SR – TSV Reichenberg-Boxdorf 2 – 1. FFC Fortuna Dresden 2 (Mä)');
  assert.equal(ev.location, 'SpA Reichenberg Kunstrasen, Dresdner Str. 69, 01468 Moritzburg');
  assert.equal(ev.start.dateTime, '2026-11-28T10:00:00.000Z');
  assert.equal(ev.end.dateTime, '2026-11-28T12:00:00.000Z');
  assert.match(ev.id, /^[a-v0-9]{5,1024}$/);
  assert.match(ev.description, /Pate: Anthony Bias/);
  assert.match(ev.description, /noch nicht bestätigt/);
  assert.doesNotMatch(ev.description, /\n\n\n/);

  const cancelled = buildEvent({ appointment, match: { ...match, status: 'CANCELLED' }, teamsById, venuesById, refereeId: 'LENNY' });
  assert.ok(cancelled.summary.startsWith(CANCEL_PREFIX));
  const unknownMe = buildEvent({ appointment, match: undefined, teamsById: {}, venuesById: {}, refereeId: 'X' });
  assert.equal(unknownMe.summary, '🟨 L Schiri: Einsatz – Heim – Gast');
  console.log('self-test ok');
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const { DFBNET_USERNAME, DFBNET_PASSWORD } = process.env;
  if (!DFBNET_USERNAME || !DFBNET_PASSWORD) throw new Error('DFBNET_USERNAME/DFBNET_PASSWORD fehlen');

  const events = await loadEvents(await dfbnetLogin(DFBNET_USERNAME, DFBNET_PASSWORD));
  console.log(`DFBnet: ${events.length} Ansetzung(en)`);
  if (process.argv.includes('--dry-run')) {
    for (const ev of events) console.log(`  ${ev.start.dateTime} ${ev.summary} | ${ev.location}`);
    return;
  }
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../serviceAccount.json'), 'utf8'));
  await syncCalendar(calendarApi(await googleToken(sa)), events);
  console.log('fertig');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
