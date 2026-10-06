/**
 * iconSuggest.ts
 *
 * Wählt für einen deutschen (oder englischen) Freitext ein klares
 * MaterialCommunityIcons-Symbol und eine Farbe – offline, ohne manuelle Wahl.
 * Quellen: eine kurze Grundliste häufiger Alltagswörter (unten) und die
 * generierte Langliste src/data/iconWords.ts (CLDR-Schlagwörter → Icon).
 * ponytail: reiner Wortabgleich; KI-Auswahl (Haiku via Firebase Function) als nächster Schritt, falls die Trefferquote nicht reicht.
 */

import { ICON_WORDS } from '../data/iconWords';

/** Emoji-Gruppen (emojibase) – bestimmen die Farbfamilie. */
const G = { smiley: 0, people: 1, nature: 3, food: 4, travel: 5, activity: 6, object: 7, symbol: 8 } as const;

/**
 * Grundliste: häufige Themen, die die CLDR-Daten nicht oder schlecht treffen.
 * Schlüssel = Wortanfang (trifft auch Komposita: "geburtstagsparty").
 */
const BASE_WORDS: Record<string, [icon: string, group: number]> = {
  idee: ['lightbulb-on', G.object],
  kaffee: ['coffee', G.food],
  haus: ['home', G.travel],
  wohnung: ['home', G.travel],
  zuhause: ['home', G.travel],
  urlaub: ['beach', G.travel],
  reise: ['airplane', G.travel],
  ausflug: ['map-marker', G.travel],
  berlin: ['city', G.travel],
  stadt: ['city', G.travel],
  zug: ['train', G.travel],
  bahn: ['train', G.travel],
  auto: ['car', G.travel],
  fahrrad: ['bicycle', G.travel],
  rad: ['bicycle', G.travel],
  massage: ['spa', G.people],
  beauty: ['lipstick', G.people],
  friseur: ['content-cut', G.people],
  familie: ['account-group', G.people],
  kind: ['human-child', G.people],
  kinder: ['human-child', G.people],
  arzt: ['doctor', G.people],
  gesundheit: ['heart-pulse', G.symbol],
  liebe: ['heart', G.symbol],
  hochzeit: ['ring', G.object],
  geschenk: ['gift', G.activity],
  geburtstag: ['cake-variant', G.food],
  party: ['party-popper', G.activity],
  feier: ['party-popper', G.activity],
  weihnacht: ['pine-tree', G.nature],
  foto: ['camera', G.object],
  bild: ['image-frame', G.object],
  film: ['movie-open', G.object],
  buch: ['book-open-page-variant', G.object],
  lesen: ['book-open-page-variant', G.object],
  musik: ['music', G.object],
  schule: ['school', G.travel],
  lernen: ['school', G.travel],
  arbeit: ['briefcase', G.object],
  job: ['briefcase', G.object],
  termin: ['calendar', G.object],
  einkauf: ['cart', G.object],
  kaufen: ['cart', G.object],
  geld: ['cash', G.object],
  steuer: ['file-document', G.object],
  versicherung: ['shield-check', G.object],
  bank: ['bank', G.travel],
  telefon: ['phone', G.object],
  anrufen: ['phone', G.object],
  mail: ['email', G.object],
  computer: ['laptop', G.object],
  handy: ['cellphone', G.object],
  putzen: ['broom', G.object],
  haushalt: ['broom', G.object],
  reparatur: ['wrench', G.object],
  reparieren: ['wrench', G.object],
  werkzeug: ['hammer-wrench', G.object],
  garten: ['flower', G.nature],
  pflanze: ['sprout', G.nature],
  hund: ['dog', G.nature],
  katze: ['cat', G.nature],
  kochen: ['chef-hat', G.food],
  rezept: ['chef-hat', G.food],
  essen: ['silverware-fork-knife', G.food],
  restaurant: ['silverware-fork-knife', G.food],
  wein: ['glass-wine', G.food],
  bier: ['beer', G.food],
  sport: ['run', G.activity],
  training: ['dumbbell', G.activity],
  fitness: ['dumbbell', G.activity],
  laufen: ['run', G.activity],
  wandern: ['hiking', G.activity],
  schwimmen: ['swim', G.activity],
  fußball: ['soccer', G.activity],
  bambini: ['soccer', G.activity],
  spiel: ['gamepad-variant', G.activity],
};

type Entry = { icon: string; group: number; words: string[] };

let index: Entry[] | null = null;
function getIndex(): Entry[] {
  if (!index) {
    index = ICON_WORDS.split('\n').map((line) => {
      const [icon, g, w] = line.split('\t');
      return { icon, group: Number(g), words: w.split('|') };
    });
  }
  return index;
}

const STOPWORDS = new Set(['und', 'oder', 'mit', 'für', 'der', 'die', 'das', 'ein', 'eine', 'den', 'dem', 'des', 'von', 'zum', 'zur', 'auf', 'aus', 'bei', 'noch', 'mal', 'evtl', 'ich', 'wir', 'nach', 'vor', 'über', 'unter', 'ohne', 'wie', 'was', 'wann', 'neu', 'alt', 'zweit', 'the', 'and', 'for', 'with']);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zäöüß0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Punkte für ein Token gegen ein Schlagwort; 0 = kein Treffer. */
function matchScore(t: string, w: string): number {
  if (w === t) return 10;
  if (w.includes(' ') && w.split(' ').includes(t)) return 6;
  if (t.length < 4 || w.length < 4) return 0;
  // Komposita: "lippenstifte" ↔ "lippenstift"
  if (t.startsWith(w) || w.startsWith(t)) return 4;
  // Gemeinsamer Wortanfang bei langen Komposita ("fotowand" ↔ "fotoapparat");
  // nur für lange Tokens, sonst trifft "bauen" den "Bauer".
  if (t.length >= 7 && t.slice(0, 4) === w.slice(0, 4)) return 3;
  if (t.endsWith(w)) return 2;
  return 0;
}

function baseScore(t: string): [string, number, number] | null {
  let best: [string, number, number] | null = null;
  for (const [key, [icon, group]] of Object.entries(BASE_WORDS)) {
    // Grundliste schlägt die Langliste: exakt 14, Wortanfang/Kompositum 12.
    const s = t === key ? 14 : t.startsWith(key) && key.length >= 4 ? 12 : 0;
    if (s && (!best || s > best[2])) best = [icon, group, s];
  }
  return best;
}

const groupOf = new Map<string, number>();

/**
 * Bis zu `limit` Icon-Namen, bestes zuerst. `primary` (Kachel-Label) zählt
 * doppelt, weil es das Thema knapper benennt als der Freitext.
 */
export function suggestIcons(primary: string, secondary = '', limit = 8): string[] {
  const weighted: [string, number][] = [
    ...tokens(primary).map((t) => [t, 2] as [string, number]),
    ...tokens(secondary).map((t) => [t, 1] as [string, number]),
  ];
  if (weighted.length === 0) return [];

  const scores = new Map<string, { score: number; pos: number }>();
  const add = (icon: string, group: number, score: number, pos: number) => {
    groupOf.set(icon, group);
    const prev = scores.get(icon);
    if (!prev) scores.set(icon, { score, pos });
    else { prev.score = Math.max(prev.score, score); prev.pos = Math.min(prev.pos, pos); }
  };

  for (const [t, weight] of weighted) {
    const base = baseScore(t);
    if (base) add(base[0], base[1], base[2] * weight, -1);
  }
  getIndex().forEach(({ icon, group, words }, pos) => {
    let score = 0;
    for (const [t, weight] of weighted) {
      let best = 0;
      words.forEach((w, i) => {
        const s = matchScore(t, w);
        // Label (i === 0) ist treffsicherer als ein Schlagwort.
        if (s) best = Math.max(best, i === 0 ? s + 2 : s);
      });
      score += best * weight;
    }
    if (score > 0) add(icon, group, score, pos);
  });

  // Gleichstand: frühere Position = gebräuchlicheres Symbol.
  return [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[1].pos - b[1].pos)
    .slice(0, limit)
    .map(([icon]) => icon);
}

export const DEFAULT_ICON = 'lightbulb-on';

/** Das passendste Icon für Label + Text, sonst die Glühbirne. */
export function autoIcon(label: string, text: string): string {
  return suggestIcons(label, text, 1)[0] ?? DEFAULT_ICON;
}

// Farben nach Kategorie, je zwei kräftige Töne, damit benachbarte Kacheln
// derselben Kategorie trotzdem unterscheidbar bleiben.
const GROUP_COLORS: Record<number, [string, string]> = {
  0: ['#FFC83D', '#FF8A3D'], // Smileys
  1: ['#FF6B9D', '#E879F9'], // Menschen
  3: ['#4ADE80', '#2DD4BF'], // Tiere & Natur
  4: ['#FB923C', '#F87171'], // Essen & Trinken
  5: ['#60A5FA', '#2DD4BF'], // Reisen & Orte
  6: ['#A78BFA', '#F472B6'], // Aktivitäten
  7: ['#FACC15', '#22D3EE'], // Objekte
  8: ['#C084FC', '#34D399'], // Symbole
  9: ['#F87171', '#60A5FA'], // Flaggen
};
const ALL_COLORS = Object.values(GROUP_COLORS).flat();

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Farbe aus dem Kontext: Kategorie des Icons bestimmt die Farbfamilie
 * (Reise = blau, Natur = grün …), `seed` (Label/Text) wählt den Ton darin.
 * Unbekannt (z. B. Glühbirne als Fallback) → kräftige Farbe, stabil pro seed.
 */
export function iconColor(icon: string, seed: string): string {
  if (!groupOf.has(icon)) {
    const e = getIndex().find((x) => x.icon === icon);
    if (e) groupOf.set(icon, e.group);
  }
  const pair = GROUP_COLORS[groupOf.get(icon) ?? -1];
  return pair ? pair[hash(seed) % 2] : ALL_COLORS[hash(seed + icon) % ALL_COLORS.length];
}

/** Für Tests: alle Icon-Namen der Grundliste. */
export const BASE_ICON_NAMES = [...new Set(Object.values(BASE_WORDS).map(([icon]) => icon))];
