/**
 * emojiSuggest.ts
 *
 * Schlägt Emojis für einen deutschen Freitext vor – offline, über die
 * CLDR-Labels/Schlagwörter aus src/data/emojiDe.ts (generiert). Kein
 * Kontextverständnis: "Beauty" oder "Berlin+D" treffen nichts, dann bleibt
 * die manuelle Auswahl.
 * ponytail: reiner Wortabgleich; KI-Auswahl (Haiku via Firebase Function) als nächster Schritt, falls die Trefferquote nicht reicht.
 */

import { EMOJI_DE } from '../data/emojiDe';

type Entry = { e: string; group: number; words: string[] };

let index: Entry[] | null = null;
function getIndex(): Entry[] {
  if (!index) {
    index = EMOJI_DE.split('\n').map((line) => {
      const [e, g, w] = line.split('\t');
      return { e, group: Number(g), words: w.split('|') };
    });
  }
  return index;
}

const STOPWORDS = new Set(['und', 'oder', 'mit', 'für', 'der', 'die', 'das', 'ein', 'eine', 'den', 'dem', 'des', 'von', 'zum', 'zur', 'auf', 'aus', 'bei', 'noch', 'mal', 'evtl', 'ich', 'wir', 'nach', 'vor', 'über', 'unter', 'ohne', 'wie', 'was', 'wann', 'neu', 'alt', 'zweit']);

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
  // Komposita: "fotowand" ↔ "foto…", "lippenstifte" ↔ "lippenstift"
  if (t.startsWith(w) || w.startsWith(t)) return 4;
  // Gemeinsamer Wortanfang bei Komposita ("fotowand" ↔ "fotoapparat"): das Bestimmungswort
  // ist meist das Bildhafte. Nur für lange Tokens, sonst trifft "bauen" den "Bauer".
  if (t.length >= 7 && t.slice(0, 4) === w.slice(0, 4)) return 3;
  if (t.endsWith(w)) return 2;
  return 0;
}

/**
 * Bis zu `limit` Emojis, bestes zuerst. `primary` (z. B. das Kachel-Label)
 * zählt doppelt, weil es das Thema knapper benennt als der Freitext.
 */
export function suggestEmojis(primary: string, secondary = '', limit = 8): string[] {
  const weighted: [string, number][] = [
    ...tokens(primary).map((t) => [t, 2] as [string, number]),
    ...tokens(secondary).map((t) => [t, 1] as [string, number]),
  ];
  if (weighted.length === 0) return [];

  const scored: { e: string; score: number; pos: number }[] = [];
  getIndex().forEach(({ e, words }, pos) => {
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
    if (score > 0) scored.push({ e, score, pos });
  });

  // Gleichstand: frühere Position = gebräuchlicheres Emoji.
  scored.sort((a, b) => b.score - a.score || a.pos - b.pos);
  return scored.slice(0, limit).map((s) => s.e);
}

// Farben nach Emoji-Kategorie (emojibase-Gruppen), je zwei kräftige Töne, damit
// benachbarte Kacheln derselben Kategorie trotzdem unterscheidbar bleiben.
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

let groupByEmoji: Map<string, number> | null = null;
/** Emoji-Kategorie; Varianten-Selektor (U+FE0F) wird ignoriert. */
function emojiGroup(emoji: string): number | undefined {
  if (!groupByEmoji) {
    groupByEmoji = new Map();
    for (const { e, group } of getIndex()) groupByEmoji.set(e.replace(/\uFE0F/g, ''), group);
  }
  return groupByEmoji.get(emoji.replace(/\uFE0F/g, ''));
}

/**
 * Farbe aus dem Kontext: Kategorie des Emojis bestimmt die Farbfamilie
 * (Reise = blau, Natur = grün …), `seed` (Label/Text) wählt den Ton darin.
 * Unbekanntes Emoji → irgendeine kräftige Farbe, stabil pro seed.
 */
export function emojiColor(emoji: string, seed: string): string {
  const pair = GROUP_COLORS[emojiGroup(emoji) ?? -1];
  return pair ? pair[hash(seed) % 2] : ALL_COLORS[hash(seed + emoji) % ALL_COLORS.length];
}

/** true, wenn der gespeicherte Symbol-Wert ein Ionicons-Name (Altbestand) statt eines Emojis ist. */
export function isIoniconName(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value);
}
