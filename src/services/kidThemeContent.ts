/**
 * kidThemeContent.ts (TE-65 / TE-69)
 *
 * Liefert pro Kind-Thema ein zufälliges Anzeige-Item für die Kinder-App.
 * Datenquelle: Wikipedia/Wikimedia – kostenlos, ohne API-Key, CORS-fähig.
 *
 * Hybrid-Ansatz (Jugendschutz + Datenqualität): Welche Spieler/Lego-Themen
 * gezeigt werden, bestimmt eine kuratierte, erweiterbare Namensliste hier im
 * Code. Bild + Kurztext kommen aus der Wikipedia-REST-Summary; für Fußball
 * werden Alter (aus Geburtsdatum) und aktueller Verein zusätzlich aus Wikidata
 * geholt. Schlägt Wikidata fehl, wird das Item trotzdem (ohne diese Fakten)
 * angezeigt – die Anzeige degradiert sauber.
 *
 * Erweiterbar: ein neues Thema braucht nur einen Eintrag in CURATED_TITLES
 * (und den passenden KidTheme-String in ../types).
 */

import { KidTheme } from '../types';

/** Ein einzelner Fakt als Label/Wert-Paar (z.B. "Alter" / "37 Jahre"). */
export interface KidThemeFact {
  label: string;
  value: string;
}

/** Anzeige-fertiges Themen-Item für die Kinder-App. */
export interface KidThemeItem {
  theme: KidTheme;
  /** Anzeigename, z.B. "Lionel Messi" oder "Lego Ninjago". */
  title: string;
  /** Bild-URL (Wikipedia-Originalbild oder Thumbnail), null wenn keins existiert. */
  imageUrl: string | null;
  /** Kurzer, kindgerechter Beschreibungstext aus der Wikipedia-Summary. */
  extract: string;
  /** Zusatzinfos (Fußball: Alter, Verein). Leer, wenn keine verfügbar. */
  facts: KidThemeFact[];
  /** Link zur Wikipedia-Seite (Quelle). */
  sourceUrl: string;
}

/**
 * Kuratierte, kindgerechte Wikipedia-Artikeltitel je Thema (deutsche Wikipedia).
 * Bewusst handverlesen, damit Kinder nur passende Inhalte sehen. Erweiterbar.
 */
const CURATED_TITLES: Record<KidTheme, string[]> = {
  fussball: [
    'Lionel Messi', 'Cristiano Ronaldo', 'Kylian Mbappé', 'Jamal Musiala',
    'Florian Wirtz', 'Jude Bellingham', 'Erling Haaland', 'Harry Kane',
    'Manuel Neuer', 'Joshua Kimmich', 'Antoine Griezmann', 'Vinícius Júnior',
    'Pedri', 'Robert Lewandowski', 'Kevin De Bruyne', 'Mohamed Salah',
    'Son Heung-min', 'Bukayo Saka', 'Phil Foden', 'Marc-André ter Stegen',
  ],
  // Lego: deutsche Wikipedia hat nur wenige bebilderte Artikel; viele Themen
  // existieren nur auf en.wikipedia. Daher Mischliste + de→en-Fallback in
  // fetchSummary, damit zu jedem Titel ein Bild gefunden wird.
  lego: [
    'Lego', 'Lego Technic', 'Lego Duplo', 'Lego Ninjago', 'Lego City',
    'Lego Star Wars', 'Lego Friends', 'Lego Mindstorms', 'Lego Creator',
    'Lego Harry Potter', 'The Lego Movie', 'Bionicle', 'Lego Minifigure',
  ],
};

/** Sprachreihenfolge für die Summary-Suche: deutsch bevorzugt, englisch als Fallback. */
const SUMMARY_LANGS = ['de', 'en'] as const;
const WIKIDATA_ENTITY_BASE = 'https://www.wikidata.org/wiki/Special:EntityData/';

/**
 * Beschreibender User-Agent – Wikimedia drosselt anonyme Requests ohne UA
 * stärker. In Web-Builds ignorieren Browser diesen Header (sie setzen ihren
 * eigenen), auf nativen Plattformen wird er gesendet.
 */
const UA = 'tasks-extended-kidcontent/1.0 (Kinder-Themen-Anzeige)';

interface WikiSummary {
  title?: string;
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  wikibase_item?: string;
  content_urls?: { desktop?: { page?: string } };
}

/** Kuratierte Titel eines Themas in zufälliger Reihenfolge (Fisher-Yates). */
function shuffledTitles(theme: KidTheme): string[] {
  const list = [...(CURATED_TITLES[theme] ?? [])];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Eine Wikipedia-Summary in einer Sprache laden. Liefert nur Treffer mit Text. */
async function fetchSummaryLang(lang: string, title: string): Promise<WikiSummary | null> {
  try {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url, { headers: { 'Api-User-Agent': UA } });
    if (!res.ok) return null;
    const data = (await res.json()) as WikiSummary & { type?: string };
    // Disambiguierungs- und Fehlerseiten verwerfen.
    if (!data.extract || data.type === 'disambiguation') return null;
    return data;
  } catch {
    // Nicht-JSON-Antworten (z.B. 429-Drosselung) landen hier → sauber überspringen.
    return null;
  }
}

/**
 * Wikipedia-Summary laden: deutsch bevorzugt, englisch als Fallback. Ein
 * deutscher Treffer ohne Bild wird zugunsten eines bebilderten englischen
 * Treffers verworfen (Kinder-Anzeige lebt vom Bild).
 */
async function fetchSummary(title: string): Promise<WikiSummary | null> {
  let textOnly: WikiSummary | null = null;
  for (const lang of SUMMARY_LANGS) {
    const s = await fetchSummaryLang(lang, title);
    if (!s) continue;
    const hasImage = !!(s.originalimage?.source ?? s.thumbnail?.source);
    if (hasImage) return s;
    textOnly = textOnly ?? s; // ersten Text-Treffer merken, falls nirgends ein Bild existiert
  }
  return textOnly;
}

/** Alter aus einem Wikidata-Zeitwert ("+1987-06-24T00:00:00Z") berechnen. */
function ageFromWikidataTime(time: string): number | null {
  const m = /^[+-](\d{4})-(\d{2})-(\d{2})/.exec(time);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || !month || !day) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hadBirthday) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

/** Eine Wikidata-Entität als JSON laden. */
async function fetchWikidataEntity(qid: string): Promise<any | null> {
  try {
    const res = await fetch(`${WIKIDATA_ENTITY_BASE}${encodeURIComponent(qid)}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.entities?.[qid] ?? null;
  } catch {
    return null;
  }
}

/**
 * Aktuelle Vereins-QID aus den P54-Statements ("Mitglied der Sportmannschaft")
 * ermitteln: bevorzugt Statements ohne Enddatum (P582), davon das mit dem
 * jüngsten Startdatum (P580); sonst das mit Rang "preferred"; sonst das erste.
 */
function currentTeamQid(claims: any): string | null {
  const p54: any[] = claims?.P54;
  if (!Array.isArray(p54) || p54.length === 0) return null;

  const idOf = (st: any): string | null =>
    st?.mainsnak?.datavalue?.value?.id ?? null;
  const startOf = (st: any): string =>
    st?.qualifiers?.P580?.[0]?.datavalue?.value?.time ?? '';
  const hasEnd = (st: any): boolean => Array.isArray(st?.qualifiers?.P582);

  const ongoing = p54.filter((st) => !hasEnd(st) && idOf(st));
  const pool = ongoing.length > 0 ? ongoing : p54.filter((st) => idOf(st));
  if (pool.length === 0) return null;

  const preferred = pool.find((st) => st?.rank === 'preferred');
  const chosen =
    preferred ??
    pool.slice().sort((a, b) => startOf(b).localeCompare(startOf(a)))[0];
  return idOf(chosen);
}

/** Label einer Wikidata-Entität (de bevorzugt, sonst en). */
function entityLabel(entity: any): string | null {
  return entity?.labels?.de?.value ?? entity?.labels?.en?.value ?? null;
}

/**
 * Fußball-Zusatzfakten (Alter, aktueller Verein) aus Wikidata. Bei jedem
 * Fehler wird einfach weniger zurückgegeben – nie geworfen.
 */
async function fetchFussballFacts(qid: string): Promise<KidThemeFact[]> {
  const entity = await fetchWikidataEntity(qid);
  if (!entity) return [];
  const facts: KidThemeFact[] = [];

  const birthTime = entity?.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time;
  if (birthTime) {
    const age = ageFromWikidataTime(birthTime);
    if (age != null) facts.push({ label: 'Alter', value: `${age} Jahre` });
  }

  const teamQid = currentTeamQid(entity?.claims);
  if (teamQid) {
    const team = await fetchWikidataEntity(teamQid);
    const name = team && entityLabel(team);
    if (name) facts.push({ label: 'Verein', value: name });
  }

  return facts;
}

/** Höchstzahl an Titeln, die je Aufruf probiert werden, bis ein Bild gefunden ist. */
const MAX_TITLE_ATTEMPTS = 4;

/** Summary in ein Anzeige-Item überführen (inkl. Fußball-Fakten). */
async function toItem(theme: KidTheme, title: string, summary: WikiSummary): Promise<KidThemeItem> {
  const facts =
    theme === 'fussball' && summary.wikibase_item
      ? await fetchFussballFacts(summary.wikibase_item)
      : [];
  return {
    theme,
    title: summary.title ?? title,
    imageUrl: summary.originalimage?.source ?? summary.thumbnail?.source ?? null,
    extract: summary.extract ?? '',
    facts,
    sourceUrl:
      summary.content_urls?.desktop?.page ??
      `https://de.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

/**
 * Ein zufälliges Themen-Item laden. Probiert mehrere kuratierte Titel, bis
 * eines mit Bild gefunden ist (so erscheint pro Reload zuverlässig ein Bild,
 * auch wenn einzelne Artikel kein Vorschaubild haben). Findet sich kein Bild,
 * wird das erste Text-Item zurückgegeben; gibt `null` zurück, wenn gar nichts
 * geladen werden konnte (Aufrufer zeigt dann einen Fehlerzustand).
 */
export async function fetchKidThemeItem(theme: KidTheme): Promise<KidThemeItem | null> {
  const titles = shuffledTitles(theme).slice(0, MAX_TITLE_ATTEMPTS);
  if (titles.length === 0) return null;

  let textOnly: { title: string; summary: WikiSummary } | null = null;
  for (const title of titles) {
    const summary = await fetchSummary(title);
    if (!summary || !summary.extract) continue;
    if (summary.originalimage?.source ?? summary.thumbnail?.source) {
      return toItem(theme, title, summary);
    }
    textOnly = textOnly ?? { title, summary };
  }

  return textOnly ? toItem(theme, textOnly.title, textOnly.summary) : null;
}
