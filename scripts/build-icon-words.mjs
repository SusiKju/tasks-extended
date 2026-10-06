// Erzeugt src/data/iconWords.ts: Schlagwörter (deutsch + englisch, aus emojibase-data / CLDR)
// → MaterialCommunityIcons-Name + Emoji-Kategorie. Das Emoji selbst wird nicht angezeigt,
// es dient nur als Brücke zwischen Wörtern und einem klaren Vektor-Icon.
// Einmalig bzw. bei neuer Emoji-/Icon-Version ausführen: node scripts/build-icon-words.mjs
// Das 50-MB-Paket emojibase-data wird bewusst nicht installiert – nur die zwei Dateien geladen.
import { readFileSync, writeFileSync } from 'node:fs';

const VERSION = '17.0.0';
const load = async (lang) =>
  (await fetch(`https://cdn.jsdelivr.net/npm/emojibase-data@${VERSION}/${lang}/compact.json`)).json();
const [de, en] = await Promise.all([load('de'), load('en')]);
const enByHex = new Map(en.map((e) => [e.hexcode, e]));

const glyphs = JSON.parse(readFileSync(new URL(
  '../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json',
  import.meta.url,
)));
// Varianten/Zustände ("-off", "-plus", "-outline" …) taugen nicht als Themen-Icon.
const SKIP = new Set('off remove plus minus check alert cancel outline circle box variant multiple lock sync edit settings cog arrow network question sharp thick thin marker search export import cloud'.split(' '));
// Wörter, die allein kein Thema tragen.
const GENERIC = new Set('face person man woman people hand symbol sign button mark black white small large light dark red blue green yellow purple orange brown with of the and on in medium skin tone'.split(' '));
const iconNames = Object.keys(glyphs).filter((n) => !n.split('-').some((t) => SKIP.has(t)));

/** Bestes Icon für ein Emoji: alle Namensteile müssen in Label/Tags vorkommen. */
function pickIcon(e) {
  const lw = e.label.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const tw = (e.tags ?? []).flatMap((t) => t.toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean);
  const labelPos = new Map(lw.map((w, i) => [w, i]));
  // Komposita aus Nachbarwörtern: "light bulb" → "lightbulb".
  lw.slice(1).forEach((w, i) => labelPos.set(lw[i] + w, i));
  const tags = new Set(tw);
  let best = null;
  let bestScore = 0;
  for (const n of iconNames) {
    let score = 0;
    let specific = 0;
    let fromLabel = 0;
    let firstPos = 99;
    let ok = true;
    for (const t of n.split('-')) {
      if (labelPos.has(t)) { score += 3; firstPos = Math.min(firstPos, labelPos.get(t)); if (!GENERIC.has(t)) fromLabel++; }
      else if (tags.has(t)) score += 2;
      else { ok = false; break; }
      if (!GENERIC.has(t)) specific++;
    }
    // Mindestens ein tragendes Wort aus dem Emoji-Namen selbst – Tags allein führen
    // zu Fehlgriffen ("locomotive" → engine, "partying face" → eye).
    if (!ok || !specific || !fromLabel) continue;
    if (n === lw.join('-')) score += 5;
    // Gleichstand: früheres Label-Wort gewinnt ("camera with flash" → camera).
    score -= firstPos * 0.01;
    if (score > bestScore) { bestScore = score; best = n; }
  }
  return best;
}

const lines = de
  .filter((e) => e.group !== undefined && e.group !== 2) // ohne Gruppe = Buchstaben-Indikatoren, 2 = Komponenten
  .filter((e) => !/‍[♀♂➡]/.test(e.unicode)) // Mann/Frau-/Richtungs-Varianten
  .map((e) => {
    const e2 = enByHex.get(e.hexcode);
    const icon = e2 && pickIcon(e2);
    if (!icon) return null;
    const words = [e.label, ...(e.tags ?? []), e2.label, ...(e2.tags ?? [])].map((w) => w.toLowerCase());
    return `${icon}\t${e.group}\t${[...new Set(words)].join('|')}`;
  })
  .filter(Boolean);

writeFileSync(
  new URL('../src/data/iconWords.ts', import.meta.url),
  `// GENERIERT von scripts/build-icon-words.mjs (emojibase-data@${VERSION}, de+en) – nicht von Hand ändern.\n` +
    `// Format pro Zeile: MaterialCommunityIcons-Name \\t Emoji-Gruppe \\t Label|Schlagwort|…\n` +
    `export const ICON_WORDS = ${JSON.stringify(lines.join('\n'))};\n`,
);
console.log(`${lines.length} Einträge geschrieben`);
