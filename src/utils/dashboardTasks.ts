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

/** Fällig heute oder überfällig – das, was „heute zu erledigen“ ist (Uhr-Karte).
 *  Undatierte zählen nicht: die haben keinen Tagesbezug. */
export function isDueTodayOrOverdue(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  return localDateStr(dateStr) <= format(new Date(), 'yyyy-MM-dd');
}

export interface TodayTodo {
  id: string;
  title: string;
  dueDate: string;
  overdue: boolean;
}

/** Überfällige zuerst (älteste vorn), danach die heute fälligen. */
export function sortTodayTodos(items: { id: string; title: string; dueDate: string }[]): TodayTodo[] {
  return items
    .map((t) => ({ ...t, overdue: isOverdue(t.dueDate) }))
    .sort((a, b) => localDateStr(a.dueDate).localeCompare(localDateStr(b.dueDate)));
}
