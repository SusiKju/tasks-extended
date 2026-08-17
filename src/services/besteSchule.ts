/**
 * besteSchule.ts
 * Live-Abruf des Stundenplans aus beste.schule für automatisch synchronisierte
 * Kinder (siehe timetable.ts). Schema gegen eine echte Antwort verifiziert
 * (Netzwerk-Mitschnitt der beste.schule-Weboberfläche, 2026-08-17):
 *
 *   GET /api/time-tables?filter[student]={id}
 *     -> [{ id, valid_from, valid_to, ... }]  – aktuell gültigen Plan wählen
 *
 *   GET /api/time-tables/{timeTableId}?include=lessons.times&filter[student]={id}
 *     -> { data: { lessons: [
 *          { weekday: 1-5, nr, subject: { name }, rooms: [{local_id}],
 *            teachers: [{local_id, name}], time: {from, to} }, ...
 *        ] } }
 *
 * Kein JSON:API-Format (kein data[]/attributes/included) – schlichtes
 * verschachteltes JSON.
 */

import { TimetableMap, key as slotKey } from './timetable';

const API_BASE = 'https://beste.schule/api';

export class BesteSchuleError extends Error {}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

interface TimeTableListItem {
  id: number;
  valid_from: string;
  valid_to: string;
}

interface RawLesson {
  weekday: number; // 1=Montag..5=Freitag
  nr: number;
  subject?: { name?: string; local_id?: string } | null;
  rooms?: { local_id?: string }[];
  teachers?: { local_id?: string; name?: string }[];
}

/** Wählt den zum heutigen Datum passenden Stundenplan (mehrere Halbjahres-Pläne möglich). */
function pickActiveTimeTable(list: TimeTableListItem[]): TimeTableListItem | null {
  const today = new Date().toISOString().slice(0, 10);
  const current = list.find((t) => t.valid_from <= today && today <= t.valid_to);
  if (current) return current;
  // Fallback: neuester Plan, dessen Gültigkeit schon begonnen hat.
  const started = list.filter((t) => t.valid_from <= today).sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  return started[0] ?? list[0] ?? null;
}

function mapLesson(lesson: RawLesson): { slotKey: string; fach: string; raum: string; lehrer: string } | null {
  const dayIdx = Number(lesson.weekday) - 1; // 1-5 -> 0-4
  if (!Number.isFinite(dayIdx) || dayIdx < 0 || dayIdx > 4) return null;
  if (lesson.nr == null) return null;
  const fach = lesson.subject?.name ?? lesson.subject?.local_id;
  if (!fach) return null;
  const raum = (lesson.rooms ?? []).map((r) => r.local_id).filter(Boolean).join(', ');
  const lehrer = (lesson.teachers ?? []).map((t) => t.local_id ?? t.name).filter(Boolean).join(', ');
  return { slotKey: slotKey(dayIdx, String(lesson.nr)), fach: String(fach), raum, lehrer };
}

/** Holt den aktuellen Stundenplan eines Schülers frisch von beste.schule. */
export async function fetchBesteSchuleTimetable(token: string, studentId: string): Promise<TimetableMap> {
  const filterQs = new URLSearchParams({ 'filter[student]': studentId }).toString();

  const listRes = await fetch(`${API_BASE}/time-tables?${filterQs}`, { headers: authHeaders(token) });
  if (!listRes.ok) throw new BesteSchuleError(`beste.schule (Stundenplan-Liste): HTTP ${listRes.status}`);
  const listJson = await listRes.json();
  const active = pickActiveTimeTable(listJson.data ?? []);
  if (!active) throw new BesteSchuleError('Kein Stundenplan für dieses Kind bei beste.schule gefunden.');

  const detailQs = new URLSearchParams({ include: 'lessons.times', 'filter[student]': studentId }).toString();
  const res = await fetch(`${API_BASE}/time-tables/${active.id}?${detailQs}`, { headers: authHeaders(token) });
  if (!res.ok) throw new BesteSchuleError(`beste.schule: HTTP ${res.status}`);
  const json = await res.json();
  const lessons: RawLesson[] = json.data?.lessons ?? [];

  const map: TimetableMap = {};
  for (const raw of lessons) {
    const mapped = mapLesson(raw);
    if (!mapped) continue;
    // A/B-Wochen-Rotation kann denselben Slot mehrfach belegen (verschiedene
    // Fächer je Woche) – wir zeigen nur die erste gefundene Belegung.
    // ponytail: kein A/B-Umschalten, bei Bedarf später nachrüsten.
    if (!map[mapped.slotKey]) {
      map[mapped.slotKey] = { fach: mapped.fach, raum: mapped.raum, lehrer: mapped.lehrer };
    }
  }
  return map;
}
