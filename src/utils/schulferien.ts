/**
 * schulferien.ts (TE-8)
 *
 * Schulfreie Tage in Sachsen: Schulferien, unterrichtsfreie Tage und
 * gesetzliche Feiertage. Quelle: openholidaysapi.org (DE-SN), Stand 2026-10-06.
 *
 * ponytail: feste Liste bis Sommer 2028 – danach erkennt isSchulfrei() keine
 * Ferien mehr (Karte erscheint wieder an allen Wochentagen). Dann neue Termine
 * von openholidaysapi.org nachtragen.
 */

/** [von, bis] inklusive, ISO yyyy-MM-dd. Einzeltage haben von === bis. */
const SCHULFREI_SN: [string, string][] = [
  // Schulferien + unterrichtsfreie Tage
  ['2025-12-22', '2026-01-02'],
  ['2026-02-09', '2026-02-21'],
  ['2026-04-03', '2026-04-10'],
  ['2026-05-15', '2026-05-15'],
  ['2026-07-04', '2026-08-14'],
  ['2026-10-12', '2026-10-24'],
  ['2026-12-23', '2027-01-02'],
  ['2027-02-08', '2027-02-19'],
  ['2027-03-26', '2027-04-02'],
  ['2027-05-07', '2027-05-07'],
  ['2027-05-15', '2027-05-18'],
  ['2027-07-10', '2027-08-20'],
  ['2027-10-11', '2027-10-23'],
  ['2027-12-23', '2028-01-01'],
  ['2028-02-14', '2028-02-26'],
  ['2028-04-14', '2028-04-22'],
  ['2028-05-26', '2028-05-26'],
  ['2028-07-22', '2028-09-01'],
  // Gesetzliche Feiertage Sachsen (nur die außerhalb der Ferien sind relevant)
  ...[
    '2026-01-01', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25', '2026-10-03',
    '2026-10-31', '2026-11-18', '2026-12-25', '2026-12-26',
    '2027-03-29', '2027-05-01', '2027-05-06', '2027-05-17', '2027-10-03', '2027-10-31',
    '2027-11-17', '2027-12-25', '2027-12-26',
    '2028-01-01', '2028-04-17', '2028-05-01', '2028-05-25', '2028-06-05',
  ].map((d): [string, string] => [d, d]),
];

function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** true, wenn `date` in Sachsen ein Ferien- oder Feiertag ist. */
export function isSchulfrei(date: Date = new Date()): boolean {
  const iso = isoLocal(date);
  return SCHULFREI_SN.some(([von, bis]) => iso >= von && iso <= bis);
}
