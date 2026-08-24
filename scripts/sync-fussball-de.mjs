/**
 * sync-fussball-de.mjs
 *
 * Holt Spielplan + Tabelle von fussball.de für jedes Kind mit hinterlegter
 * Team-ID (Einstellungen → fussball.de) und schreibt sie nach Firestore.
 * Läuft serverseitig (Node, kein Browser) – daher kein CORS-Problem, anders
 * als ein direkter fetch() aus der App (siehe src/services/fussballDe.ts).
 *
 * Gedacht für einen GitHub-Actions-Cron (.github/workflows/sync-fussball-de.yml).
 * Lokal: node scripts/sync-fussball-de.mjs (braucht serviceAccount.json im
 * Projekt-Root). In CI: Service-Account-JSON über die Env-Variable
 * FIREBASE_SERVICE_ACCOUNT (Secret) statt Datei.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const __dirname = dirname(fileURLToPath(import.meta.url));

const FAMILY_ID = 'redmann-db923190';

const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : JSON.parse(readFileSync(resolve(__dirname, '../serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

/** Minimal-Decode für die paar Entities, die in Vereins-/Wettbewerbsnamen vorkommen. */
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function extractHeadline(chunk) {
  const head = chunk.match(/<td colspan="6">([^<]+)<\/td>/);
  if (!head) return null;
  const m = head[1].match(/(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2}):(\d{2})\s*Uhr\s*\|\s*(.+)/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min, competition] = m;
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}`, competition: decodeEntities(competition.trim()) };
}

function extractClubNames(chunk) {
  const names = [...chunk.matchAll(/class="club-name">\s*([^<]+?)\s*<\/div>/g)].map((m) => decodeEntities(m[1].trim()));
  return names.length >= 2 ? [names[0], names[1]] : null;
}

function extractTeamIds(chunk) {
  return [...chunk.matchAll(/href="[^"]*team-id\/([A-Za-z0-9]+)"[^>]*class="club-wrapper"/g)].map((m) => m[1]);
}

function extractLink(chunk) {
  return chunk.match(/href="(https:\/\/www\.fussball\.de\/spiel\/[^"]+)"/)?.[1] ?? null;
}

/** Spielplan (nächste + letzte Spiele) – Tore sind über ein Icon-Font obfuskiert, bewusst nicht geparst. */
function parseMatchplan(html, teamId) {
  const chunks = html.split('<tr class="row-headline visible-small">').slice(1);
  const matches = [];
  const indexByLink = new Map();
  for (const chunk of chunks) {
    const headline = extractHeadline(chunk);
    const names = extractClubNames(chunk);
    if (!headline || !names) continue;
    const teamIds = extractTeamIds(chunk);
    const link = extractLink(chunk);
    const match = {
      ...headline,
      home: names[0],
      away: names[1],
      // ponytail: falls die team-id-Extraktion mal leer läuft, nehmen wir
      // "Heimspiel" an (steht in der HTML-Reihenfolge zuerst) statt zu verwerfen.
      isHome: teamIds[0] ? teamIds[0] === teamId : true,
      link,
    };
    // fussball.de listet dasselbe Spiel teils zweifach mit unterschiedlichem
    // Termin – bei einer Spielverlegung bleibt ein Eintrag mit dem alten
    // Termin stehen, der spätere Eintrag im HTML trägt den aktuellen. Also
    // per Link entdoppeln und dabei den späteren (aktuellen) behalten.
    if (link && indexByLink.has(link)) {
      matches[indexByLink.get(link)] = match;
    } else {
      if (link) indexByLink.set(link, matches.length);
      matches.push(match);
    }
  }
  return matches;
}

/** Tabelle der aktuellen Saison/Staffel (Endpunkt ermittelt sie automatisch aus der Team-ID). */
function parseTable(html) {
  const rowRe = /<tr([^>]*)>([\s\S]*?)<\/tr>/g;
  const standings = [];
  let m;
  while ((m = rowRe.exec(html))) {
    const [, attrs, body] = m;
    if (/\bthead\b/.test(attrs)) continue;
    const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      decodeEntities(c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    );
    if (cells.length < 10) continue;
    const [goalsFor, goalsAgainst] = cells[7].split(':').map((s) => parseInt(s.trim(), 10));
    standings.push({
      rank: parseInt(cells[1], 10),
      club: cells[2],
      isOwn: /\bown\b/.test(attrs),
      played: parseInt(cells[3], 10),
      won: parseInt(cells[4], 10),
      drawn: parseInt(cells[5], 10),
      lost: parseInt(cells[6], 10),
      goalsFor,
      goalsAgainst,
      points: parseInt(cells[9], 10),
    });
  }
  return standings;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function syncChild(childId, teamId) {
  console.log(`→ ${childId} (teamId=${teamId})`);
  const [matchplanHtml, tableHtml] = await Promise.all([
    fetchText(`https://www.fussball.de/ajax.team.matchplan/-/mode/PAGE/team-id/${teamId}`),
    fetchText(`https://www.fussball.de/ajax.team.table/-/team-id/${teamId}`),
  ]);
  const matches = parseMatchplan(matchplanHtml, teamId);
  const standings = parseTable(tableHtml);
  await db.doc(`families/${FAMILY_ID}/children/${childId}`).set(
    { fussballMatches: matches, fussballTable: standings },
    { merge: true }
  );
  console.log(`  ${matches.length} Spiele, ${standings.length} Tabellenplätze gespeichert.`);
}

const settingsSnap = await db.collection(`families/${FAMILY_ID}/settingsByUser`).get();
const teamIdsByChild = {};
for (const doc of settingsSnap.docs) {
  const ids = doc.data()?.fussballDeTeamIds ?? {};
  for (const [childId, teamId] of Object.entries(ids)) {
    if (teamId) teamIdsByChild[childId] = teamId;
  }
}

const entries = Object.entries(teamIdsByChild);
if (entries.length === 0) {
  console.log('Keine fussball.de-Team-ID hinterlegt, nichts zu tun.');
} else {
  for (const [childId, teamId] of entries) {
    try {
      await syncChild(childId, teamId);
    } catch (e) {
      console.error(`  Fehler bei ${childId}:`, e.message);
    }
  }
}
