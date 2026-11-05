/**
 * Spielstärke-Bewertung der Bambini (1–5, 0 = nicht bewertet).
 * Regenbogen-Farben pro Stufe: 1 rot … 5 blau.
 */
export const RATING_MAX = 5;

export const RATING_COLORS: readonly string[] = ['#FF375F', '#FF9F0A', '#FFD60A', '#30D158', '#4A9EFF'];

/** Defensiv aus Firestore lesen: ganze Zahl 1–5, sonst 0. */
export function sanitizeRating(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const r = Math.trunc(n);
  return r >= 1 && r <= RATING_MAX ? r : 0;
}

/** Antippen derselben Stufe setzt die Bewertung zurück (0). */
export function toggleRating(current: number, tapped: number): number {
  return current === tapped ? 0 : sanitizeRating(tapped);
}
