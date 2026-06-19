export const SAISON_STICHTAG_MONAT = 7; // August (0-indexiert)
export const BAMBINI_START_OFFSET = 4;
export const F_JUGEND_WECHSEL_OFFSET = 7;

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
  return {
    von: birthYear + BAMBINI_START_OFFSET,
    bis: birthYear + F_JUGEND_WECHSEL_OFFSET,
  };
}
