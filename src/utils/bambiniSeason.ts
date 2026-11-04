export const SAISON_STICHTAG_MONAT = 7; // August (0-indexiert)
export const BAMBINI_START_OFFSET = 4;
export const F_JUGEND_WECHSEL_OFFSET = 7;
export const TRAINER_START_JAHR = 2024; // Trainer aktiv seit August 2024

export type JahrgangStatus = 'aktiv' | 'gewechselt';

/**
 * Saisonjahr von `now`: Saisons laufen von 1.8. bis 31.7. und werden nach
 * ihrem Endjahr benannt. Vor dem 1.8. zählt also noch das laufende Kalenderjahr,
 * ab dem 1.8. bereits das nächste.
 */
function getSaisonJahr(now: Date): number {
  const augustErster = new Date(now.getFullYear(), SAISON_STICHTAG_MONAT, 1);
  return now >= augustErster ? now.getFullYear() + 1 : now.getFullYear();
}

export function getJahrgangStatus(birthYear: number, now: Date = new Date()): JahrgangStatus {
  const wechselJahr = birthYear + F_JUGEND_WECHSEL_OFFSET;
  return getSaisonJahr(now) > wechselJahr ? 'gewechselt' : 'aktiv';
}

export function getBetreuungsZeitraum(birthYear: number): { von: number; bis: number } {
  const bis = birthYear + F_JUGEND_WECHSEL_OFFSET;
  // Math.min gegen `bis`: verhindert "betreut 2024–2022" für Jahrgänge, die schon
  // komplett vor dem Trainer-Start gewechselt sind.
  const von = Math.min(Math.max(birthYear + BAMBINI_START_OFFSET, TRAINER_START_JAHR), bis);
  return { von, bis };
}

/** TE-114: Wo eine Trainingsidee funktioniert. */
export type TrainingsOrt = 'draussen' | 'halle' | 'beides';

/** TE-114: Standard-Ort nach Saison – Oktober bis März Halle, sonst draußen. */
// ponytail: Monatsgrenzen fest, in Settings verschieben falls der Verein die Hallenzeit anders legt.
export function saisonOrt(now: Date): 'draussen' | 'halle' {
  const m = now.getMonth() + 1;
  return m >= 10 || m <= 3 ? 'halle' : 'draussen';
}

/** TE-114: Passt die Idee zum gewählten Filter? „beides“/ohne Ort passt immer. */
export function ortPasst(ort: TrainingsOrt | undefined, filter: 'draussen' | 'halle' | 'alle'): boolean {
  return filter === 'alle' || !ort || ort === 'beides' || ort === filter;
}

/**
 * TE-115: Reihenfolge der Karten „Übungen heute“. Nach vorne geholte Karten (heuteRang)
 * zuerst, die zuletzt geholte ganz vorne; Rest in Listenreihenfolge dahinter.
 */
export function sortHeute<T extends { heuteRang?: number }>(items: T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (b.item.heuteRang ?? -Infinity) - (a.item.heuteRang ?? -Infinity) || a.i - b.i)
    .map((x) => x.item);
}
