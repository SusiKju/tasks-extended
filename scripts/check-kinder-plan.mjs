// Selbsttest für src/utils/kinderPlanLogic.ts (Kinderplan-Tab).
// Aufruf im Projektordner: node scripts/check-kinder-plan.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const src = readFileSync(new URL('../src/utils/kinderPlanLogic.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const L = await import('data:text/javascript,' + encodeURIComponent(js));

// Woche beginnt montags
assert.equal(L.weekKey(new Date(2026, 9, 14)), '2026-10-12'); // Mi
assert.equal(L.weekKey(new Date(2026, 9, 18)), '2026-10-12'); // So
assert.equal(L.weekKey(new Date(2026, 9, 19)), '2026-10-19'); // Mo
assert.deepEqual(L.weekDays('2026-12-28').slice(-2), ['2027-01-02', '2027-01-03']);
assert.equal(L.kalenderwoche(new Date(2026, 9, 14)), 42);
assert.equal(L.kalenderwoche(new Date(2027, 0, 1)), 53);

// Altes Format (2.77) wird übernommen: takt → tage, zuteilung string → Liste
const alt = L.normalisiereRegeln({
  wochenaufgaben: [{ id: 'a', label: 'A', takt: 'taeglich' }, { id: 'b', label: 'B', takt: 'woechentlich' }],
  zuteilung: { a: 'emil', b: '' },
});
assert.deepEqual(alt.wochenaufgaben.map((w) => w.tage), [[0, 1, 2, 3, 4, 5, 6], [4]]);
assert.deepEqual(alt.zuteilung, { a: ['emil'], b: [] });

const regeln = L.normalisiereRegeln({
  wochenaufgaben: [
    { id: 'tisch', label: 'Tisch decken', tage: [0, 1, 2, 3, 4, 5, 6] },
    { id: 'zimmer', label: 'Zimmer aufräumen', tage: [4] },
    { id: 'muell', label: 'Müll', tage: [1] },
  ],
  zuteilung: { tisch: ['emil'], zimmer: ['lenny', 'emil', 'liddy'], muell: ['emil'] },
});
const woche = {
  punkte: {
    a: { childId: 'emil', pts: 2, grund: null, at: '', markKey: null },
    b: { childId: 'emil', pts: 3, grund: null, at: '', markKey: null },
    c: { childId: 'lenny', pts: -1, grund: null, at: '', markKey: null },
  },
  marks: {
    'emil|tisch|2026-10-12': 'ok',
    'emil|tisch|2026-10-13': 'no',
    'emil|tisch|2026-10-14': 'ok',
  },
};

// Punkte, nie negativ
assert.equal(L.punkte(woche, 'emil'), 5);
assert.equal(L.punkte(woche, 'lenny'), 0);

// Stufen: 5 Punkte = Stufe 1 fällig, bis vergeben
assert.deepEqual(L.faelligeStufen(regeln, 5, 'emil', '2026-10-12', []), [0]);
assert.deepEqual(L.faelligeStufen(regeln, 5, 'emil', '2026-10-12', [{ childId: 'emil', week: '2026-10-12', stufe: 0 }]), []);
assert.deepEqual(L.faelligeStufen(regeln, 9, 'emil', '2026-10-12', [{ childId: 'emil', week: '2026-10-05', stufe: 0 }]), [0, 1]);
assert.equal(L.bisNaechsteStufe(regeln, 5), 3);
assert.equal(L.bisNaechsteStufe(regeln, 8), null);

// Zuteilung an mehrere Kinder
assert.deepEqual(L.aufgabenVon(regeln, 'liddy').map((a) => a.id), ['zimmer']);
assert.deepEqual(L.aufgabenVon(regeln, 'emil').map((a) => a.id), ['tisch', 'zimmer', 'muell']);

// Quote Mi 14.10.: Tisch Mo–Mi (3 Soll, 2 ok), Müll Di (1 Soll, offen), Zimmer Fr zählt noch nicht
assert.deepEqual(L.quote(regeln, woche, 'emil', '2026-10-12', '2026-10-14'), { ok: 2, soll: 4 });
// Fr: Zimmer kommt dazu
assert.deepEqual(L.quote(regeln, woche, 'emil', '2026-10-12', '2026-10-16'), { ok: 2, soll: 7 });

// Maßgeblicher Tag
const [tisch, zimmer, muell] = regeln.wochenaufgaben;
assert.deepEqual(L.aktuellerTag(tisch, 'emil', woche, '2026-10-12', '2026-10-14'), { tag: 2, date: '2026-10-14', kommt: false, ueberfaellig: false });
assert.deepEqual(L.aktuellerTag(zimmer, 'emil', woche, '2026-10-12', '2026-10-14'), { tag: 4, date: '2026-10-16', kommt: true, ueberfaellig: false });
assert.deepEqual(L.aktuellerTag(muell, 'emil', woche, '2026-10-12', '2026-10-14'), { tag: 1, date: '2026-10-13', kommt: false, ueberfaellig: true });
assert.deepEqual(L.aktuellerTag(zimmer, 'emil', woche, '2026-10-12', '2026-10-18'), { tag: 4, date: '2026-10-16', kommt: false, ueberfaellig: true });

// Rotation: jedes Kind rückt weiter, „alle“ bleibt „alle“, unbekannte fallen raus
const kids = ['lenny', 'emil', 'liddy'];
assert.deepEqual(L.rotiere({ x: ['lenny'], y: ['liddy', 'weg'], z: [...kids] }, kids), { x: ['emil'], y: ['lenny'], z: ['emil', 'liddy', 'lenny'] });

console.log('kinderPlanLogic: alle Prüfungen bestanden');
