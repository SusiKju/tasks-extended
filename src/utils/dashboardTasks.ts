import { format } from 'date-fns';
import { Task } from '../types';
import { isOverdue, localDateStr } from './dateFormat';

/** TE-5: Kurzübersicht zeigt nur Einträge ohne Datum oder mit Datum heute/morgen. */
export function isUndatedOrSoon(dateStr?: string | null): boolean {
  if (!dateStr) return true;
  const d = localDateStr(dateStr);
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
  return d === today || d === tomorrow;
}

type DashTask = Pick<Task, 'completed' | 'dueDate' | 'dueTime'>;

/** TE-150: Google Task gehört aufs Dashboard – offen und ohne Datum, heute/morgen
 *  fällig oder überfällig (abgelaufen, aber nicht abgehakt). */
export function isDashboardTask(t: DashTask): boolean {
  return !t.completed && (isUndatedOrSoon(t.dueDate) || isOverdue(t.dueDate ?? null));
}

/** Tasks mit Uhrzeit laufen wie Termine (Uhr / „Als Nächstes“) – außer
 *  überfällige: ein vergangener Termin würde nirgends mehr angezeigt. */
export function showsAsTimedEvent(t: DashTask): boolean {
  return !!t.dueDate && !!t.dueTime && !isOverdue(t.dueDate);
}

/** Gegenstück zu showsAsTimedEvent: alles andere steht in der Task-Liste. */
export function showsInTaskList(t: DashTask): boolean {
  return !t.dueTime || isOverdue(t.dueDate ?? null);
}
