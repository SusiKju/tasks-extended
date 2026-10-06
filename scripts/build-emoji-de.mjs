// Erzeugt src/data/emojiDe.ts aus emojibase-data (deutsche CLDR-Labels + Schlagwörter).
// Einmalig bzw. bei neuer Emoji-Version ausführen: node scripts/build-emoji-de.mjs
// Das 50-MB-Paket wird bewusst nicht installiert – nur die eine Datei geladen.
import { writeFileSync } from 'node:fs';

const VERSION = '17.0.0';
const url = `https://cdn.jsdelivr.net/npm/emojibase-data@${VERSION}/de/compact.json`;
const data = await (await fetch(url)).json();

const lines = data
  .filter((e) => e.group !== 2) // 2 = Komponenten (Hautfarben, Haarteile) – keine eigenständigen Bilder
  // Mann/Frau- und Richtungs-Varianten raus: die neutrale Form reicht, sonst füllen 6 Radfahrer die Vorschläge.
  .filter((e) => !/\u200D[\u2640\u2642\u27A1]/.test(e.unicode))
  .map((e) => {
    const words = [...new Set([e.label, ...(e.tags ?? [])].map((w) => w.toLowerCase()))];
    return `${e.unicode}\t${words.join('|')}`;
  });

writeFileSync(
  new URL('../src/data/emojiDe.ts', import.meta.url),
  `// GENERIERT von scripts/build-emoji-de.mjs (emojibase-data@${VERSION}, de) – nicht von Hand ändern.\n` +
    `// Format pro Zeile: Emoji \\t Label|Schlagwort|…\n` +
    `export const EMOJI_DE = ${JSON.stringify(lines.join('\n'))};\n`,
);
console.log(`${lines.length} Emojis geschrieben`);
