import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGoogleDate } from '../dateFormat';
import { isDashboardTask, isDueTodayOrOverdue, isUndatedOrSoon, showsAsTimedEvent, showsInTaskList, sortTodayTodos } from '../dashboardTasks';

// Google liefert Fälligkeiten als "YYYY-MM-DDT00:00:00.000Z"; der Sync macht
// daraus lokalen Mittag (fromGoogleDate). Genau so testen.
const due = (ymd: string) => fromGoogleDate(`${ymd}T00:00:00.000Z`);
const task = (dueDate: string | null, extra: { completed?: boolean; dueTime?: string | null } = {}) => ({
  completed: false,
  dueTime: null,
  dueDate,
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 9, 30)); // 4. Nov. 2026, 09:30 lokal
});
afterEach(() => vi.useRealTimers());

describe('isUndatedOrSoon', () => {
  it('ohne Datum, heute und morgen → true', () => {
    expect(isUndatedOrSoon(null)).toBe(true);
    expect(isUndatedOrSoon(due('2026-11-04'))).toBe(true);
    expect(isUndatedOrSoon(due('2026-11-05'))).toBe(true);
  });
  it('gestern und übermorgen → false', () => {
    expect(isUndatedOrSoon(due('2026-11-03'))).toBe(false);
    expect(isUndatedOrSoon(due('2026-11-06'))).toBe(false);
  });
});

describe('isDashboardTask', () => {
  it('zeigt überfällige, nicht erledigte Google Tasks', () => {
    expect(isDashboardTask(task(due('2026-11-03')))).toBe(true);
    expect(isDashboardTask(task(due('2026-10-01')))).toBe(true);
  });
  it('zeigt undatierte und heute/morgen fällige', () => {
    expect(isDashboardTask(task(null))).toBe(true);
    expect(isDashboardTask(task(due('2026-11-04')))).toBe(true);
    expect(isDashboardTask(task(due('2026-11-05')))).toBe(true);
  });
  it('blendet erledigte und später fällige aus', () => {
    expect(isDashboardTask(task(due('2026-11-03'), { completed: true }))).toBe(false);
    expect(isDashboardTask(task(due('2026-11-10')))).toBe(false);
  });
});

describe('Task mit Uhrzeit: Termin oder Listeneintrag', () => {
  it('heute mit Uhrzeit → Termin, nicht in der Liste', () => {
    const t = task(due('2026-11-04'), { dueTime: '14:00' });
    expect(showsAsTimedEvent(t)).toBe(true);
    expect(showsInTaskList(t)).toBe(false);
  });
  it('überfällig mit Uhrzeit → in der Liste, kein Termin', () => {
    const t = task(due('2026-11-02'), { dueTime: '14:00' });
    expect(showsAsTimedEvent(t)).toBe(false);
    expect(showsInTaskList(t)).toBe(true);
  });
  it('ohne Uhrzeit → immer in der Liste', () => {
    expect(showsInTaskList(task(due('2026-11-04')))).toBe(true);
    expect(showsAsTimedEvent(task(due('2026-11-04')))).toBe(false);
  });
});

describe('Heute zu erledigen (Uhr-Karte)', () => {
  it('isDueTodayOrOverdue: heute und überfällig → true, sonst false', () => {
    expect(isDueTodayOrOverdue(due('2026-11-04'))).toBe(true);
    expect(isDueTodayOrOverdue(due('2026-10-25'))).toBe(true);
    expect(isDueTodayOrOverdue(due('2026-11-05'))).toBe(false);
    expect(isDueTodayOrOverdue(null)).toBe(false);
  });
  it('sortTodayTodos: überfällige zuerst (älteste vorn), dann heutige', () => {
    const list = sortTodayTodos([
      { id: 'a', title: 'heute', dueDate: due('2026-11-04') },
      { id: 'b', title: 'Okt', dueDate: due('2026-10-25') },
      { id: 'c', title: 'Nov3', dueDate: due('2026-11-03') },
    ]);
    expect(list.map((t) => [t.id, t.overdue])).toEqual([['b', true], ['c', true], ['a', false]]);
  });
});
