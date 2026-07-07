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
