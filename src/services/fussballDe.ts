/**
 * fussballDe.ts
 * Vereinsspielplan von fussball.de (DFBnet) pro Kind – analog zu besteSchule.ts,
 * aber ohne Login: der Spielplan einer Mannschaft ist eine öffentliche,
 * serverseitig gerenderte HTML-Tabelle (kein JSON-API). Endpunkt gegen die
 * echte Team-Seite verifiziert (2026-08-17):
 *
 *   GET /ajax.team.matchplan/-/mode/PAGE/team-id/{teamId}
 *     -> HTML-Fragment, ein <tr class="row-headline visible-small"> pro Spiel
 *        mit "Wochentag, TT.MM.JJJJ - HH:MM Uhr | Wettbewerb", gefolgt von
 *        zwei .club-name (Heim/Gast) und einem Link "Zum Spiel".
 *
 * Ergebnisse (score-left/-right) sind über ein Icon-Font-Mapping obfuskiert
 * und daher nicht zuverlässig auslesbar – wird bewusst nicht geparst, nur
 * Termine (Datum/Zeit/Gegner/Wettbewerb).
 */

import { doc, updateDoc, setDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

const API_BASE = 'https://www.fussball.de';

export class FussballDeError extends Error {}

export interface Match {
  /** ISO-Datum YYYY-MM-DD. */
  date: string;
  /** "HH:MM". */
  time: string;
  competition: string;
  home: string;
  away: string;
  isHome: boolean;
  link?: string;
}

/** Key = Spiel-Link (stabil), sonst Datum+Zeit als Fallback. */
export type MatchesMap = Record<string, Match>;

/** Akzeptiert die volle Team-URL oder bereits die nackte Team-ID. */
export function parseTeamIdFromUrl(input: string): string | null {
  const trimmed = input.trim();
  const m = trimmed.match(/team-id\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{10,}$/.test(trimmed) ? trimmed : null;
}

function extractHeadline(chunk: string): { date: string; time: string; competition: string } | null {
  const head = chunk.match(/<td colspan="6">([^<]+)<\/td>/);
  if (!head) return null;
  const m = head[1].match(/(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2}):(\d{2})\s*Uhr\s*\|\s*(.+)/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min, competition] = m;
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}`, competition: decodeEntities(competition.trim()) };
}

/** Minimal-Decode für die paar Entities, die in Vereins-/Wettbewerbsnamen vorkommen. */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function extractClubNames(chunk: string): [string, string] | null {
  const names = [...chunk.matchAll(/class="club-name">\s*([^<]+?)\s*<\/div>/g)].map((m) => decodeEntities(m[1].trim()));
  return names.length >= 2 ? [names[0], names[1]] : null;
}

function extractTeamIds(chunk: string): string[] {
  return [...chunk.matchAll(/href="[^"]*team-id\/([A-Za-z0-9]+)"[^>]*class="club-wrapper"/g)].map((m) => m[1]);
}

function extractLink(chunk: string): string | undefined {
  return chunk.match(/href="(https:\/\/www\.fussball\.de\/spiel\/[^"]+)"/)?.[1];
}

function parseMatchplan(html: string, teamId: string): Match[] {
  const chunks = html.split('<tr class="row-headline visible-small">').slice(1);
  const matches: Match[] = [];
  for (const chunk of chunks) {
    const headline = extractHeadline(chunk);
    const names = extractClubNames(chunk);
    if (!headline || !names) continue;
    const teamIds = extractTeamIds(chunk);
    matches.push({
      ...headline,
      home: names[0],
      away: names[1],
      // ponytail: falls die team-id-Extraktion mal leer läuft, nehmen wir
      // "Heimspiel" an (steht in der HTML-Reihenfolge zuerst) statt zu
      // verwerfen — bei Bedarf auf "skip" ändern, falls das mal falsch anzeigt.
      isHome: teamIds[0] ? teamIds[0] === teamId : true,
      link: extractLink(chunk),
    });
  }
  return matches;
}

/** Holt den aktuellen Spielplan einer Mannschaft frisch von fussball.de. */
export async function fetchFussballDeMatches(teamId: string): Promise<Match[]> {
  const res = await fetch(`${API_BASE}/ajax.team.matchplan/-/mode/PAGE/team-id/${encodeURIComponent(teamId)}`);
  if (!res.ok) throw new FussballDeError(`fussball.de: HTTP ${res.status}`);
  const html = await res.text();
  return parseMatchplan(html, teamId);
}

function childDoc(familyId: string, childId: string) {
  return doc(db, 'families', familyId, 'children', childId);
}

/** Echtzeit-Listener auf den Spielplan eines Kindes. */
export function subscribeToMatches(
  familyId: string,
  childId: string,
  onChange: (matches: Match[]) => void,
): Unsubscribe {
  return onSnapshot(
    childDoc(familyId, childId),
    (snap) => onChange((snap.data()?.fussballMatches as Match[] | undefined) ?? []),
    () => onChange([]),
  );
}

/** Ersetzt den kompletten Spielplan eines Kindes (nach einem Sync). */
export async function replaceMatches(familyId: string, childId: string, matches: Match[]): Promise<void> {
  const ref = childDoc(familyId, childId);
  try {
    await updateDoc(ref, { fussballMatches: matches });
  } catch {
    await setDoc(ref, { fussballMatches: matches }, { merge: true });
  }
}
