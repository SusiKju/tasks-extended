/**
 * Weckmodus-Zeitfenster (in Minuten seit Mitternacht), in den Settings einstellbar.
 * Die Karte erscheint nur Mo–Fr innerhalb [start, end) und nie an schulfreien Tagen
 * in Sachsen (Ferien/Feiertage, siehe isSchulfrei).
 */
import { isSchulfrei } from './schulferien';

export const WECK_DEFAULT_START = 5 * 60;
export const WECK_DEFAULT_END = 8 * 60;
/** Schrittweite der Einstellung. */
export const WECK_STEP = 30;

/** Gültiges Fenster: ganze Vielfache von WECK_STEP, 0 ≤ start < end ≤ 24:00. */
export function sanitizeWeckWindow(start: unknown, end: unknown): { start: number; end: number } {
  const snap = (v: unknown, fallback: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(24 * 60, Math.max(0, Math.round(n / WECK_STEP) * WECK_STEP));
  };
  const s = snap(start, WECK_DEFAULT_START);
  const e = snap(end, WECK_DEFAULT_END);
  return s < e ? { start: s, end: e } : { start: WECK_DEFAULT_START, end: WECK_DEFAULT_END };
}

/** true an Schultagen (Mo–Fr, nicht schulfrei in Sachsen) innerhalb des Fensters. */
export function isInWeckWindow(d: Date, start: number, end: number): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6 || isSchulfrei(d)) return false;
  const min = d.getHours() * 60 + d.getMinutes();
  return min >= start && min < end;
}

/** 300 → "5:00", 450 → "7:30". */
export function formatWeckTime(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}
