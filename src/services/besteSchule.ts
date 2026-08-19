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
 *
 * Klassenbuch (Hausaufgaben/Vertretungen), Netzwerk-Mitschnitt 2026-08-18:
 *
 *   GET /api/journal/lessons?interpolate=true&include=notes.type,day
 *       &filter[range]={von},{bis}&filter[student]={id}
 *     -> { data: [{ day: {date}, status: 'initial'|'hold'|'canceled',
 *          source: 'journal'|'substitutionplan', subject: {name}|null,
 *          group: {name}|null, notes: [{ description, type: {local_id} }] }] }
 *     Hausaufgaben stecken als Notiz mit type.local_id "HAU" an der Stunde,
 *     an der sie eingetragen wurden (kein separates Fälligkeitsdatum).
 *     status "canceled" + source "substitutionplan" = Stunde fällt aus.
 *
 *   GET /api/journal/days?interpolate=true&include=notes.type
 *       &filter[range]={von},{bis}&filter[student]={id}
 *     -> { data: [{ date, notes: [{ description, source: 'substitutionplan' }] }] }
 *     Ganztägige Vertretungsplan-Hinweise ohne Fachbezug (z.B. "Bitte
 *     Sonderplan beachten.").
 */

import { TimetableMap, key as slotKey } from './timetable';
import { GradeEntry, GradesMap } from './grades';
import { JournalNote, JournalData } from './journal';

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
  // Kurs-Stunden (z.B. Sport-Gruppen wie "7SPO14m") tragen kein `subject`
  // (immer null), sondern nur eine `group` mit dem Kurskürzel als Namen.
  group?: { name?: string; local_id?: string } | null;
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

// beste.schule trägt die Mittags-/Essenspause als Lektion ohne echtes Fach ein –
// subject/group tragen wörtlich den Kursnamen "07/1" der Aufsichtsgruppe
// (Netzwerk-Mitschnitt, 2026-08-19, per Screenshot bestätigt).
const MITTAGSPAUSE_CODE = '07/1';

function mapLesson(lesson: RawLesson): { slotKey: string; fach: string; raum: string; lehrer: string; pause?: boolean } | null {
  const dayIdx = Number(lesson.weekday) - 1; // 1-5 -> 0-4
  if (!Number.isFinite(dayIdx) || dayIdx < 0 || dayIdx > 4) return null;
  if (lesson.nr == null) return null;
  const fach = lesson.subject?.name ?? lesson.subject?.local_id ?? lesson.group?.name ?? lesson.group?.local_id;
  if (!fach) return null;
  const raum = (lesson.rooms ?? []).map((r) => r.local_id).filter(Boolean).join(', ');
  const lehrer = (lesson.teachers ?? []).map((t) => t.local_id ?? t.name).filter(Boolean).join(', ');
  const pause = String(fach) === MITTAGSPAUSE_CODE;
  return {
    slotKey: slotKey(dayIdx, String(lesson.nr)),
    fach: pause ? 'Mittagspause' : String(fach),
    raum,
    lehrer,
    ...(pause ? { pause: true } : {}),
  };
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
      map[mapped.slotKey] = {
        fach: mapped.fach,
        raum: mapped.raum,
        lehrer: mapped.lehrer,
        ...(mapped.pause ? { pause: true } : {}),
      };
    }
  }
  return map;
}

interface RawSubject {
  id: number;
  name: string;
}

/**
 * ACHTUNG: Lennys Schuljahr hat gerade erst begonnen, `grades` war zum
 * Zeitpunkt der Implementierung leer – das Feld-Mapping einer einzelnen Note
 * (value/type/date) ist daher unverifiziert (bestes Wissen aus dem Muster
 * der übrigen Endpunkte). `raw` wird immer mitgespeichert, damit bei falscher
 * Zuordnung nichts verloren geht und wir es nachträglich korrigieren können.
 */
function mapGrade(raw: any): GradeEntry {
  const value = String(raw?.value ?? raw?.grade ?? raw?.note ?? raw?.mark ?? '?');
  const type = raw?.type?.name ?? raw?.type ?? raw?.kind ?? undefined;
  const date = raw?.date ?? raw?.given_at ?? raw?.created_at ?? undefined;
  return { value, type, date, raw };
}

/** Holt den aktuellen Notenstand eines Schülers, gruppiert nach Fach. */
export async function fetchBesteSchuleGrades(token: string, studentId: string): Promise<GradesMap> {
  const res = await fetch(
    `${API_BASE}/students/${encodeURIComponent(studentId)}?include=grades,subjects`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) throw new BesteSchuleError(`beste.schule (Noten): HTTP ${res.status}`);
  const json = await res.json();
  const subjects: RawSubject[] = json.data?.subjects ?? [];
  const gradesRaw: any[] = json.data?.grades ?? [];

  const bySubject: GradesMap = {};
  for (const s of subjects) bySubject[s.name] = [];
  for (const g of gradesRaw) {
    const subjectName = g?.subject?.name ?? subjects.find((s) => s.id === g?.subject_id)?.name ?? 'Sonstiges';
    if (!bySubject[subjectName]) bySubject[subjectName] = [];
    bySubject[subjectName].push(mapGrade(g));
  }
  return bySubject;
}

interface RawJournalNote {
  description?: string | null;
  type?: { local_id?: string } | null;
}

interface RawJournalLesson {
  day?: { date?: string } | null;
  status?: string;
  subject?: { name?: string; local_id?: string } | null;
  group?: { name?: string; local_id?: string } | null;
  notes?: RawJournalNote[];
}

interface RawJournalDay {
  date?: string;
  id?: string;
  notes?: (RawJournalNote & { source?: string })[];
}

/**
 * Holt Hausaufgaben und Vertretungen der nächsten 10 Tage. Kein Archiv:
 * die Range startet heute, Vergangenes wird nie angefragt.
 */
export async function fetchBesteSchuleJournal(token: string, studentId: string): Promise<JournalData> {
  const today = new Date();
  const until = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000);
  const range = `${today.toISOString().slice(0, 10)},${until.toISOString().slice(0, 10)}`;
  const qs = (include: string) =>
    new URLSearchParams({ interpolate: 'true', include, 'filter[range]': range, 'filter[student]': studentId }).toString();

  const [lessonsRes, daysRes] = await Promise.all([
    fetch(`${API_BASE}/journal/lessons?${qs('notes.type,day')}`, { headers: authHeaders(token) }),
    fetch(`${API_BASE}/journal/days?${qs('notes.type')}`, { headers: authHeaders(token) }),
  ]);
  if (!lessonsRes.ok) throw new BesteSchuleError(`beste.schule (Klassenbuch): HTTP ${lessonsRes.status}`);
  if (!daysRes.ok) throw new BesteSchuleError(`beste.schule (Klassenbuch): HTTP ${daysRes.status}`);
  const lessonsJson = await lessonsRes.json();
  const daysJson = await daysRes.json();

  const homework: JournalNote[] = [];
  const substitutions: JournalNote[] = [];

  const lessons: RawJournalLesson[] = lessonsJson.data ?? [];
  for (const lesson of lessons) {
    const date = lesson.day?.date;
    if (!date) continue;
    const fach = lesson.subject?.name ?? lesson.subject?.local_id ?? lesson.group?.name ?? lesson.group?.local_id ?? null;
    for (const note of lesson.notes ?? []) {
      if (note.type?.local_id === 'HAU' && note.description) {
        homework.push({ date, fach, text: note.description });
      }
    }
    if (lesson.status === 'canceled' && fach) {
      substitutions.push({ date, fach, text: 'Fällt aus' });
    }
  }

  const days: RawJournalDay[] = daysJson.data ?? [];
  for (const day of days) {
    const date = day.date ?? day.id;
    if (!date) continue;
    for (const note of day.notes ?? []) {
      if (note.source === 'substitutionplan' && note.description) {
        substitutions.push({ date, fach: null, text: note.description });
      }
    }
  }

  // Doppelstunden tragen dieselbe Hausaufgabe/denselben Ausfall an jeder
  // beteiligten Periode ein – als Liste soll das nur einmal auftauchen.
  const dedupe = (notes: JournalNote[]) => {
    const seen = new Set<string>();
    return notes.filter((n) => {
      const dupeKey = `${n.date}|${n.fach}|${n.text}`;
      if (seen.has(dupeKey)) return false;
      seen.add(dupeKey);
      return true;
    });
  };

  const homeworkUnique = dedupe(homework).sort((a, b) => a.date.localeCompare(b.date));
  const substitutionsUnique = dedupe(substitutions).sort((a, b) => a.date.localeCompare(b.date));
  return { homework: homeworkUnique, substitutions: substitutionsUnique };
}
