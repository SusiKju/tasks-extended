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

const regeln = L.normalisiereRegeln({ zuteilung: { 'tisch-decken': 'emil', muell: 'emil' } });
const woche = {
  punkte: {
    a: { childId: 'emil', pts: 2, grund: null, at: '', markKey: null },
    b: { childId: 'emil', pts: 3, grund: null, at: '', markKey: null },
    c: { childId: 'lenny', pts: -1, grund: null, at: '', markKey: null },
  },
  marks: {
    'emil|tisch-decken|2026-10-12': 'ok',
    'emil|tisch-decken|2026-10-13': 'no',
    'emil|tisch-decken|2026-10-14': 'ok',
    'emil|muell|2026-10-12': 'ok',
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

// Quote: täglich Mo–Mi = 3 Soll, 2 ok; wöchentlich 1 Soll, 1 ok
assert.deepEqual(L.quote(regeln, woche, 'emil', '2026-10-12', '2026-10-14'), { ok: 3, soll: 4 });

// Rotation: zum nächsten Kind, letztes wieder zum ersten, unbekannte fallen raus
assert.deepEqual(L.rotiere({ x: 'lenny', y: 'liddy', z: 'weg' }, ['lenny', 'emil', 'liddy']), { x: 'emil', y: 'lenny' });

console.log('kinderPlanLogic: alle Prüfungen bestanden');
