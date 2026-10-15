/**
 * kinderPlanLogic.ts
 * Reine Rechenlogik für den Kinderplan-Tab (Strafpunkte, Wochenaufgaben,
 * Strafaufgaben). Bewusst ohne Firebase/React-Imports, damit
 * scripts/check-kinder-plan.mjs sie direkt prüfen kann.
 */

export type Takt = 'taeglich' | 'woechentlich';
export type Mark = 'ok' | 'no' | '';

/** Nur ein Etikett – die Punkte werden auf der Übersicht per +1/+2/+3 vergeben. */
export interface Grund { id: string; label: string }
export interface Stufe { min: number; aufgaben: string[] }
export interface Wochenaufgabe { id: string; label: string; takt: Takt }

export interface KinderRegeln {
  gruende: Grund[];
  /** Strafpunkte für eine als „vergessen“ markierte Wochenaufgabe. */
  vergessenPts: number;
  /** Aufsteigend nach `min` sortiert. */
  stufen: Stufe[];
  wochenaufgaben: Wochenaufgabe[];
  /** Wochenaufgabe-ID → childId. */
  zuteilung: Record<string, string>;
  /** Jeden Montag alle Wochenaufgaben zum nächsten Kind weitergeben. */
  rotieren: boolean;
  /** weekKey der letzten automatischen Rotation. */
  letzteRotation: string | null;
}

export interface PunktEintrag {
  childId: string;
  pts: number;
  grund: string | null;
  at: string;
  /** Gesetzt, wenn der Eintrag aus einer vergessenen Wochenaufgabe stammt. */
  markKey: string | null;
}

export interface KinderWoche {
  punkte: Record<string, PunktEintrag>;
  marks: Record<string, Mark>;
}

export interface Strafaufgabe {
  childId: string;
  label: string;
  /** Index in regeln.stufen zum Zeitpunkt der Vergabe. */
  stufe: number;
  week: string;
  at: string;
  done: boolean;
  doneAt: string | null;
  /** ID der gespiegelten Aufgabe in der Kinder-App (children/{id}/tasks). */
  taskId: string | null;
}

export const DEFAULT_REGELN: KinderRegeln = {
  gruende: [
    { id: 'zaehne', label: 'Zähne nicht geputzt' },
    { id: 'zimmer', label: 'Zimmer nicht aufgeräumt' },
    { id: 'schuhe', label: 'Schuhe nicht ins Regal' },
    { id: 'jacke', label: 'Jacke / Ranzen liegen gelassen' },
  ],
  vergessenPts: 2,
  stufen: [
    { min: 4, aufgaben: ['Schuhregal putzen', 'Flur staubsaugen', 'Altpapier wegbringen'] },
    { min: 8, aufgaben: ['Bad sauber machen', 'Küche wischen', 'Auto aussaugen'] },
  ],
  wochenaufgaben: [
    { id: 'tisch-decken', label: 'Tisch decken', takt: 'taeglich' },
    { id: 'tisch-abdecken', label: 'Tisch abdecken', takt: 'taeglich' },
    { id: 'geschirrspueler', label: 'Geschirrspüler ausräumen', takt: 'taeglich' },
    { id: 'glaeser', label: 'Gläser wegbringen', takt: 'taeglich' },
    { id: 'muell', label: 'Müll rausbringen', takt: 'woechentlich' },
  ],
  zuteilung: {},
  rotieren: false,
  letzteRotation: null,
};

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Montag der Woche als "YYYY-MM-DD" (lokale Zeit). */
export function weekKey(d: Date = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return isoDate(x);
}

/** Die 7 Tage (Mo–So) einer Woche als "YYYY-MM-DD". */
export function weekDays(wk: string): string[] {
  const [y, m, d] = wk.split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => isoDate(new Date(y, m - 1, d + i)));
}

/** ISO-Kalenderwoche. */
export function kalenderwoche(d: Date = new Date()): number {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7));
  const jan4 = new Date(x.getFullYear(), 0, 4);
  return 1 + Math.round(((x.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

export const markKey = (childId: string, aufgabeId: string, date: string) => `${childId}|${aufgabeId}|${date}`;

/** Strafpunkte eines Kindes in dieser Woche, nie unter 0. */
export function punkte(woche: KinderWoche, childId: string): number {
  const sum = Object.values(woche.punkte).filter((e) => e.childId === childId).reduce((s, e) => s + e.pts, 0);
  return Math.max(0, sum);
}

/** Erreichte Stufen (Index), für die diese Woche noch keine Strafaufgabe vergeben wurde. */
export function faelligeStufen(regeln: KinderRegeln, pts: number, childId: string, wk: string, aufgaben: Strafaufgabe[]): number[] {
  return regeln.stufen
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => pts >= s.min && !aufgaben.some((a) => a.childId === childId && a.week === wk && a.stufe === i))
    .map(({ i }) => i);
}

/** Abstand zur nächsten Stufe, null wenn alle Stufen erreicht sind. */
export function bisNaechsteStufe(regeln: KinderRegeln, pts: number): number | null {
  const next = regeln.stufen.find((s) => s.min > pts);
  return next ? next.min - pts : null;
}

/** Erledigte vs. erwartete Wochenaufgaben bis einschließlich `today`. */
export function quote(regeln: KinderRegeln, woche: KinderWoche, childId: string, wk: string, today: string): { ok: number; soll: number } {
  const days = weekDays(wk).filter((d) => d <= today);
  let ok = 0, soll = 0;
  for (const a of regeln.wochenaufgaben.filter((a) => regeln.zuteilung[a.id] === childId)) {
    for (const d of a.takt === 'woechentlich' ? [wk] : days) {
      soll++;
      if (woche.marks[markKey(childId, a.id, d)] === 'ok') ok++;
    }
  }
  return { ok, soll };
}

/** Gibt jede zugeteilte Wochenaufgabe an das nächste Kind in `childIds` weiter. */
export function rotiere(zuteilung: Record<string, string>, childIds: string[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [aufgabe, child] of Object.entries(zuteilung)) {
    const i = childIds.indexOf(child);
    if (i >= 0) next[aufgabe] = childIds[(i + 1) % childIds.length];
  }
  return next;
}

/** Fehlende Felder (älteres Dokument) mit Defaults auffüllen, Stufen sortieren. */
export function normalisiereRegeln(raw: Partial<KinderRegeln> | undefined): KinderRegeln {
  const r = { ...DEFAULT_REGELN, ...(raw ?? {}) };
  return { ...r, stufen: [...r.stufen].sort((a, b) => a.min - b.min) };
}
