import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { DateFormat } from '../types';

export function formatDate(isoDate: string | null, dateFormat: DateFormat): string {
  if (!isoDate) return '';

  const date = parseISO(isoDate);

  switch (dateFormat) {
    case 'iso':
      return format(date, 'yyyy-MM-dd');
    case 'de':
      return format(date, 'dd.MM.yyyy');
    case 'us':
      return format(date, 'MM/dd/yyyy');
    case 'relative': {
      if (isToday(date)) return 'Heute';
      if (isTomorrow(date)) return 'Morgen';
      if (isYesterday(date)) return 'Gestern';
      return formatDistanceToNow(date, { addSuffix: true, locale: de });
    }
  }
}

export function isDueToday(isoDate: string | null): boolean {
  if (!isoDate) return false;
  return isToday(parseISO(isoDate));
}

export function isOverdue(isoDate: string | null): boolean {
  if (!isoDate) return false;
  const date = parseISO(isoDate);
  return date < new Date() && !isToday(date);
}

// ── Timezone-sichere Datumshilfen für Google-API-Sync ─────────────────────────

/**
 * Gibt das lokale Datum als "YYYY-MM-DD" zurück.
 * new Date(iso).toISOString().split('T')[0] ist FALSCH — das gibt das UTC-Datum,
 * das bei UTC+ Timezones um einen Tag verschoben sein kann.
 */
export function localDateStr(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Konvertiert ein lokales ISO-Datum zu Mitternacht UTC des lokalen Datums.
 * Wird beim Senden zu Google Tasks/Calendar verwendet.
 * Beispiel: "2026-06-01T22:00:00Z" (= 2. Juni Mitternacht UTC+2)
 *        → "2026-06-02T00:00:00.000Z" (Google versteht: 2. Juni)
 */
export function toGoogleDateISO(iso: string): string {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
}

/**
 * Importiert ein Google-Datum ("YYYY-MM-DDT00:00:00.000Z") als lokalen Mittag.
 * Mittag (12:00) statt Mitternacht verhindert, dass Sommerzeit-Übergänge
 * oder UTC+ Offsets das Datum um einen Tag verschieben.
 * Beispiel: "2026-06-02T00:00:00.000Z" → 2. Juni 12:00 Lokalzeit
 */
export function fromGoogleDate(googleDue: string): string {
  const datePart = googleDue.split('T')[0]; // "2026-06-02"
  const [y, m, day] = datePart.split('-').map(Number);
  return new Date(y, m - 1, day, 12, 0, 0).toISOString();
}

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  iso: 'ISO (2026-05-28)',
  de: 'Deutsch (28.05.2026)',
  us: 'US-Format (05/28/2026)',
  relative: 'Relativ (Heute, Morgen, …)',
};
