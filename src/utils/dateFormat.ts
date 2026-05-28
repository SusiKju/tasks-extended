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

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  iso: 'ISO (2026-05-28)',
  de: 'Deutsch (28.05.2026)',
  us: 'US-Format (05/28/2026)',
  relative: 'Relativ (Heute, Morgen, …)',
};
