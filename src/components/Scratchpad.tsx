/**
 * Scratchpad.tsx (TE-104)
 *
 * Persönlicher Notizblock als farbige Notiz-Bubbles. Früher inline im
 * DashboardScreen definiert – jetzt eigenständig, damit er an zwei Stellen
 * verwendet werden kann:
 *   - Dashboard: nur Anzeige (readOnly) mit besserem, ruhigem Card-Look.
 *   - Tasks-Tab: voll bearbeitbar (Anlegen, Bearbeiten, Farben, Löschen).
 *
 * Die Daten liegen weiterhin als ein serialisierter String im Store
 * (siehe hooks/useScratchpad.ts + services/scratchpadService.ts).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../utils/theme';
import { DatePickerModal } from './DatePickerModal';
import { formatDate, isOverdue, isDueToday } from '../utils/dateFormat';
import { useStore } from '../store';

// TE-141: Personal Tasks – pro Eintrag optional ein Wichtig-Label und ein
// Fälligkeitsdatum (lokaler Mittag als ISO-String, wie bei den normalen Tasks).
export interface ScratchEntry {
  id?: string;
  text: string;
  color: string;
  done?: boolean;
  important?: boolean;
  dueDate?: string | null;
}

// TE-141: Rot des Wichtig-Labels (Toggle + Punkt), identisch zum NotesScreen.
const IMPORTANT_RED = '#EF4444';

// TE-141: ein Date auf lokalen Mittag normalisieren, damit Zeitzonen das Datum
// nicht um einen Tag verschieben (gleiche Logik wie utils/dateFormat).
function localNoonISO(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString();
}

// TE-144: Fälligkeits-Gruppe für die Sortierung – überfällig (0) → heute (1) →
// später/mit Datum (2) → ohne Datum (3).
function dueRank(entry: ScratchEntry): number {
  if (!entry.dueDate) return 3;
  if (isOverdue(entry.dueDate)) return 0;
  if (isDueToday(entry.dueDate)) return 1;
  return 2;
}

// TE-144: intelligente Sortierung – wichtig zuerst, dann nach Fälligkeits-Gruppe,
// innerhalb einer Gruppe früheres Datum zuerst. Stabil (gleichwertige behalten
// ihre Reihenfolge). Erledigte Einträge existieren in der Liste nicht mehr
// (Häkchen archiviert sie in die History).
export function sortScratch(entries: ScratchEntry[]): ScratchEntry[] {
  return [...entries].sort((a, b) => {
    if (!!a.important !== !!b.important) return a.important ? -1 : 1;
    const ra = dueRank(a), rb = dueRank(b);
    if (ra !== rb) return ra - rb;
    if (a.dueDate && b.dueDate) {
      const da = new Date(a.dueDate).getTime();
      const db = new Date(b.dueDate).getTime();
      if (da !== db) return da - db;
    }
    return 0;
  });
}

// Zwei Eintragslisten haben dieselbe Reihenfolge? (Vergleich per id, fällt auf
// Text zurück.) Verhindert überflüssige Speicher-Schreibvorgänge beim Sortieren.
function sameOrder(a: ScratchEntry[], b: ScratchEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i].id ?? a[i].text) !== (b[i].id ?? b[i].text)) return false;
  }
  return true;
}

// TE-112/TE-144: ein im Verlauf archivierter Eintrag (gelöscht ODER erledigt).
// important/dueDate werden mitgeführt, damit „wieder aktivieren" alles zurückholt.
export interface ScratchHistoryEntry {
  id: string;
  text: string;
  color: string;
  archivedAt: string;
  important?: boolean;
  dueDate?: string | null;
}

/** Maximale Anzahl Verlaufseinträge – ältere fallen hinten raus. */
export const SCRATCH_HISTORY_MAX = 50;

export function parseScratchHistory(raw: string): ScratchHistoryEntry[] {
  if (!raw || raw.trim() === '') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((e) => e && typeof e.text === 'string');
  } catch {}
  return [];
}

export function serializeScratchHistory(entries: ScratchHistoryEntry[]): string {
  return JSON.stringify(entries);
}

/** Stabile, kollisionsarme ID für eine neue Notiz (siehe TE-95-Migration unten). */
export function makeNoteId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// TE-142: Das wählbare Farbschema wurde entfernt – Wichtig-Label + Fälligkeit
// steuern jetzt die Darstellung. Für Altdaten und das Datenmodell bleibt ein
// neutraler Default erhalten.
const NOTE_DEFAULT_COLOR = '#9E9E9E';

// TE-112: kurze, deutsche Relativzeit für den Verlauf ("gerade", "vor 3 Min.",
// "vor 2 Std.", "gestern", sonst Datum).
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return 'gerade';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'gestern';
  if (diffD < 7) return `vor ${diffD} Tagen`;
  return new Date(then).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

// TE-85: Farben werden jetzt explizit pro Notiz gewählt (Default Dunkles Pink),
// daher keine Theme-abhängige Auto-Vergabe und kein Erzwingen der ersten Farbe.
export function parseScratchpad(raw: string): ScratchEntry[] {
  if (!raw || raw.trim() === '') return [{ text: '', color: NOTE_DEFAULT_COLOR }];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  const lines = raw.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('─'));
  if (lines.length === 0) return [{ text: '', color: NOTE_DEFAULT_COLOR }];
  return lines.map((text) => ({ text, color: NOTE_DEFAULT_COLOR }));
}

export function serializeScratchpad(entries: ScratchEntry[]): string {
  return JSON.stringify(entries);
}

export function Scratchpad({
  value, onChange, isDark, colors, registerAdd, readOnly = false,
  history = [], onArchive, onRemoveHistory, onClearHistory,
}: {
  value: string;
  // Im readOnly-Modus nicht erforderlich – die Anzeige verändert nichts.
  onChange?: (t: string) => void;
  isDark: boolean;
  colors: ThemeColors;
  // TE-85: erlaubt dem Header-Plus-Button, eine Notiz oben anzulegen.
  registerAdd?: (fn: () => void) => void;
  // TE-104: Dashboard zeigt den Notizblock nur an (kein Anlegen/Bearbeiten/Löschen).
  readOnly?: boolean;
  // TE-112: Verlauf gelöschter Notizen (nur im editierbaren Block sichtbar).
  history?: ScratchHistoryEntry[];
  onArchive?: (entry: ScratchEntry) => void;
  onRemoveHistory?: (id: string) => void;
  onClearHistory?: () => void;
}) {
  const entries = useMemo(() => parseScratchpad(value), [value]);
  const inputRefs = useRef<(any)[]>([]);
  const dateFormat = useStore((s) => s.settings.dateFormat);
  // TE-141: welcher Eintrag hat gerade die Fälligkeits-Auswahl offen (null = keiner)
  // bzw. den vollen Kalender geöffnet.
  const [dueIdx, setDueIdx] = useState<number | null>(null);
  const [datePickerIdx, setDatePickerIdx] = useState<number | null>(null);
  // TE-112: ist der Verlaufs-Bereich aufgeklappt?
  const [historyOpen, setHistoryOpen] = useState(false);

  const emit = useCallback((s: string) => { onChange?.(s); }, [onChange]);

  const updateEntry = useCallback((idx: number, text: string) => {
    const next = entries.map((e, i) => i === idx ? { ...e, text } : e);
    emit(serializeScratchpad(next));
  }, [entries, emit]);

  // TE-144: Häkchen = erledigt → Eintrag wandert in die History (dort
  // reaktivierbar) und verschwindet aus der Liste. Ersetzt das frühere
  // „durchgestrichen anzeigen".
  const completeEntry = useCallback((idx: number) => {
    const entry = entries[idx];
    if (entry && entry.text.trim() !== '') onArchive?.(entry);
    if (entries.length <= 1) {
      emit(serializeScratchpad([{ id: makeNoteId(), text: '', color: NOTE_DEFAULT_COLOR }]));
      return;
    }
    emit(serializeScratchpad(entries.filter((_, i) => i !== idx)));
  }, [entries, emit, onArchive]);

  // TE-141/TE-144: Wichtig-Label umschalten – danach neu sortieren (diskrete Aktion).
  const toggleImportant = useCallback((idx: number) => {
    const next = entries.map((e, i) => i === idx ? { ...e, important: !e.important } : e);
    emit(serializeScratchpad(sortScratch(next)));
  }, [entries, emit]);

  // TE-141/TE-144: Fälligkeitsdatum setzen (null = entfernen) – danach neu sortieren.
  const setDue = useCallback((idx: number, dueDate: string | null) => {
    const next = entries.map((e, i) => i === idx ? { ...e, dueDate } : e);
    emit(serializeScratchpad(sortScratch(next)));
  }, [entries, emit]);

  // TE-144: Liste neu sortieren, ohne beim Tippen zu springen – wird beim
  // Verlassen eines Textfelds (onBlur) aufgerufen, nicht bei jeder Eingabe.
  const sortNow = useCallback(() => {
    if (readOnly) return;
    const sorted = sortScratch(entries);
    if (!sameOrder(sorted, entries)) emit(serializeScratchpad(sorted));
  }, [readOnly, entries, emit]);

  // TE-85: neue Notiz mit höchster Priorität (Position 0) + Default-Pink.
  // Ist die einzige vorhandene Notiz noch leer, wird sie wiederverwendet statt
  // eine zweite leere Bubble zu erzeugen.
  const addEntryAtTop = useCallback(() => {
    if (entries.length === 1 && entries[0].text === '') {
      emit(serializeScratchpad([{ id: entries[0].id ?? makeNoteId(), text: '', color: NOTE_DEFAULT_COLOR }]));
    } else {
      emit(serializeScratchpad([{ id: makeNoteId(), text: '', color: NOTE_DEFAULT_COLOR }, ...entries]));
    }
    setTimeout(() => inputRefs.current[0]?.focus(), 40);
  }, [entries, emit]);

  useEffect(() => { if (!readOnly) registerAdd?.(addEntryAtTop); }, [registerAdd, addEntryAtTop, readOnly]);

  // TE-95: Notizen ohne stabile id (Alt-Daten, oder eine vor dieser Migration
  // angelegte Notiz) bekommen einmalig eine – sonst hängen sich Feed-Highlight
  // und manuelle Feed-Sortierung (beide referenzieren `note:${id}`) an die
  // Array-Position statt an die Notiz selbst, und eine neu eingefügte Notiz an
  // Position 0 "erbt" optisch das Highlight/die Position der alten Notiz 0.
  // Nur der bearbeitbare Block (Tasks-Tab) schreibt diese Migration zurück –
  // sonst würden zwei gemountete Instanzen (Dashboard + Tasks) konkurrieren.
  useEffect(() => {
    if (readOnly) return;
    if (entries.some((e) => !e.id)) {
      emit(serializeScratchpad(entries.map((e) => (e.id ? e : { ...e, id: makeNoteId() }))));
    }
  }, [entries, emit, readOnly]);

  // TE-144: einmalige Sortierung, sobald echte Daten geladen sind ("beim Öffnen"),
  // inklusive Migration alter erledigter Einträge in die History. Danach halten
  // die diskreten Sortierungen (Toggle/Datum/Blur) die Reihenfolge aktuell –
  // ohne beim Tippen zu springen.
  const didInitialSort = useRef(false);
  useEffect(() => {
    if (readOnly || didInitialSort.current) return;
    if (!entries.some((e) => e.text.trim() !== '')) return; // auf Daten warten
    didInitialSort.current = true;
    const doneEntries = entries.filter((e) => e.done && e.text.trim() !== '');
    doneEntries.forEach((e) => onArchive?.(e));
    const remaining = entries.filter((e) => !e.done);
    const sorted = sortScratch(remaining.length > 0 ? remaining : entries);
    if (doneEntries.length > 0 || !sameOrder(sorted, entries)) {
      emit(serializeScratchpad(sorted));
    }
  }, [readOnly, entries, emit, onArchive]);

  const removeEntry = useCallback((idx: number) => {
    // TE-112: Notiz mit Inhalt vor dem Entfernen in den Verlauf legen.
    const removed = entries[idx];
    if (removed && removed.text.trim() !== '') onArchive?.(removed);
    if (entries.length <= 1) { updateEntry(0, ''); return; }
    const next = entries.filter((_, i) => i !== idx);
    emit(serializeScratchpad(next));
    setTimeout(() => inputRefs.current[Math.max(0, idx - 1)]?.focus(), 40);
  }, [entries, emit, updateEntry, onArchive]);

  // TE-112/TE-144: archivierten Eintrag wieder aktivieren – inkl. Wichtig-Label
  // und Fälligkeitsdatum. Danach neu sortieren, damit er an die richtige Stelle
  // rutscht (nicht stur oben).
  const restoreFromHistory = useCallback((h: ScratchHistoryEntry) => {
    const note: ScratchEntry = {
      id: makeNoteId(), text: h.text, color: h.color,
      important: h.important, dueDate: h.dueDate ?? null,
    };
    // Eine einzelne leere Platzhalter-Notiz dabei ersetzen statt davor stapeln.
    const base = entries.length === 1 && entries[0].text === '' ? [] : entries;
    emit(serializeScratchpad(sortScratch([note, ...base])));
    onRemoveHistory?.(h.id);
  }, [entries, emit, onRemoveHistory]);

  const handleKeyPress = useCallback((idx: number, e: any) => {
    if (e.nativeEvent.key === 'Backspace' && entries[idx].text === '') {
      removeEntry(idx);
    }
  }, [entries, removeEntry]);

  // TE-104/TE-109: Im Lesemodus (Dashboard) nur Notizen mit Inhalt zeigen,
  // als gerahmte, verschmolzene Liste – gleiche Optik wie der bearbeitbare Block,
  // nur ohne Interaktion (Checkbox + Text, kein Trash/Farbe).
  if (readOnly) {
    const filled = entries.filter((e) => e.text.trim() !== '');
    if (filled.length === 0) {
      return (
        <View style={[padStyles.mergedList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={padStyles.emptyRow}>
            <Ionicons name="document-text-outline" size={15} color={colors.textMuted} />
            <Text style={[padStyles.emptyText, { color: colors.textMuted }]}>
              Noch keine Notizen – tippe oben auf +.
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View style={[padStyles.mergedList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {filled.map((entry, idx) => (
          <View
            key={entry.id ?? idx}
            style={[padStyles.rowCompact, idx < filled.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
          >
            <Ionicons
              name={entry.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={15}
              color={entry.done ? colors.success : colors.textMuted}
            />
            <Text
              style={[padStyles.rowTextCompact, { color: colors.text }, entry.done && { textDecorationLine: 'line-through', color: colors.textMuted }]}
              numberOfLines={1}
            >
              {entry.text}
            </Text>
            {/* TE-141: Wichtig-Punkt auch im Dashboard-Lesemodus. */}
            {entry.important ? <View style={padStyles.importantDotCompact} /> : null}
            <View style={[padStyles.colorDotCompact, { backgroundColor: entry.color }]} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View>
      <View style={[padStyles.mergedList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {entries.map((entry, idx) => (
        <View
          key={entry.id ?? idx}
          style={idx < entries.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border } : undefined}
        >
          {/* Zeile im Task-Stil: runde Checkbox + Text + Wichtig/Datum/Farbe/Trash. */}
          <View style={padStyles.row}>
            {/* TE-144: Häkchen erledigt den Eintrag → ab in die History. */}
            <Pressable onPress={() => completeEntry(idx)} hitSlop={8}>
              <Ionicons
                name="ellipse-outline"
                size={22}
                color={colors.textMuted}
              />
            </Pressable>
            <TextInput
              ref={(r) => { inputRefs.current[idx] = r; }}
              style={[padStyles.rowText, { color: colors.text }]}
              value={entry.text}
              onChangeText={(t) => updateEntry(idx, t)}
              onKeyPress={(e) => handleKeyPress(idx, e)}
              onBlur={sortNow}
              placeholder={idx === 0 && entries.length === 1 ? 'Personal Task…' : ''}
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              blurOnSubmit
            />
            {/* TE-141: gesetztes Fälligkeitsdatum inline, rot wenn überfällig. */}
            {entry.dueDate ? (
              <Pressable onPress={() => setDueIdx((cur) => (cur === idx ? null : idx))} hitSlop={6}>
                <Text
                  style={[padStyles.dueText, { color: isOverdue(entry.dueDate) ? IMPORTANT_RED : colors.textMuted }]}
                  numberOfLines={1}
                >
                  {formatDate(entry.dueDate, dateFormat)}
                </Text>
              </Pressable>
            ) : null}
            {/* TE-141: Wichtig-Label umschalten. */}
            <Pressable onPress={() => toggleImportant(idx)} hitSlop={8} style={padStyles.iconBtn}>
              <Ionicons
                name={entry.important ? 'flag' : 'flag-outline'}
                size={18}
                color={entry.important ? IMPORTANT_RED : colors.textMuted}
              />
            </Pressable>
            {/* TE-141: Fälligkeits-Auswahl auf-/zuklappen. */}
            <Pressable onPress={() => setDueIdx((cur) => (cur === idx ? null : idx))} hitSlop={8} style={padStyles.iconBtn}>
              <Ionicons
                name="calendar-outline"
                size={18}
                color={entry.dueDate ? colors.text : colors.textMuted}
              />
            </Pressable>
            <Pressable onPress={() => removeEntry(idx)} hitSlop={8} style={padStyles.trashBtn}>
              <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* TE-141: Fälligkeits-Auswahl – Quick-Buttons wie bei den normalen Tasks. */}
          {dueIdx === idx && (
            <View style={[padStyles.duePickerRow, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
              {[
                { label: 'Heute', days: 0 },
                { label: 'Morgen', days: 1 },
                { label: 'Übermorgen', days: 2 },
              ].map((q) => (
                <Pressable
                  key={q.label}
                  onPress={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + q.days);
                    setDue(idx, localNoonISO(d));
                    setDueIdx(null);
                  }}
                  style={[padStyles.quickBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                >
                  <Text style={[padStyles.quickBtnText, { color: colors.text }]}>{q.label}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setDatePickerIdx(idx)}
                style={[padStyles.quickBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <Ionicons name="calendar-outline" size={14} color={colors.text} />
                <Text style={[padStyles.quickBtnText, { color: colors.text }]}>Datum…</Text>
              </Pressable>
              {entry.dueDate ? (
                <Pressable
                  onPress={() => { setDue(idx, null); setDueIdx(null); }}
                  style={[padStyles.quickBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                >
                  <Ionicons name="close-circle" size={14} color={colors.textMuted} />
                  <Text style={[padStyles.quickBtnText, { color: colors.textMuted }]}>Entfernen</Text>
                </Pressable>
              ) : null}
            </View>
          )}

        </View>
      ))}
      </View>

      {/* TE-112: Verlauf gelöschter Notizen – aufklappbar, nur wenn vorhanden. */}
      {history.length > 0 && (
        <View style={padStyles.historyWrap}>
          <Pressable
            onPress={() => setHistoryOpen((v) => !v)}
            hitSlop={6}
            style={padStyles.historyHeader}
          >
            <Ionicons
              name={historyOpen ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={colors.textMuted}
            />
            <Ionicons name="time-outline" size={15} color={colors.textMuted} />
            <Text style={[padStyles.historyTitle, { color: colors.textMuted }]}>
              Verlauf ({history.length})
            </Text>
            {historyOpen && onClearHistory && (
              <Pressable onPress={onClearHistory} hitSlop={8} style={padStyles.historyClear}>
                <Text style={[padStyles.historyClearText, { color: colors.textMuted }]}>leeren</Text>
              </Pressable>
            )}
          </Pressable>

          {historyOpen && (
            <View style={[padStyles.mergedList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {history.map((h, idx) => (
                <View
                  key={h.id}
                  style={[padStyles.row, idx < history.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                >
                  <View style={[padStyles.colorDot, { backgroundColor: h.color, borderColor: colors.border }]} />
                  <Text
                    style={[padStyles.rowText, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {h.text}
                  </Text>
                  <Text style={[padStyles.historyTime, { color: colors.textMuted }]}>
                    {relativeTime(h.archivedAt)}
                  </Text>
                  <Pressable onPress={() => restoreFromHistory(h)} hitSlop={8} style={padStyles.trashBtn}>
                    <Ionicons name="arrow-undo-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => onRemoveHistory?.(h.id)} hitSlop={8} style={padStyles.trashBtn}>
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* TE-141: voller Kalender für einen Eintrag (über „Datum…"). */}
      <DatePickerModal
        visible={datePickerIdx !== null}
        value={
          datePickerIdx !== null && entries[datePickerIdx]?.dueDate
            ? new Date(entries[datePickerIdx].dueDate as string)
            : null
        }
        onConfirm={(d) => {
          if (datePickerIdx !== null) setDue(datePickerIdx, localNoonISO(d));
          setDatePickerIdx(null);
          setDueIdx(null);
        }}
        onCancel={() => setDatePickerIdx(null)}
        colors={colors}
      />
    </View>
  );
}

const padStyles = StyleSheet.create({
  // TE-109: zusammenhängende, gerahmte Liste – Items verschmolzen, nur eine
  // einfache Trennlinie zwischen den Zeilen (keine Doppel-Linie).
  mergedList: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    padding: 0,
  },
  // TE-113: kompakte Lesemodus-Zeile (~50% niedriger), da nicht bearbeitbar.
  rowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 10,
  },
  rowTextCompact: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    lineHeight: 15,
    padding: 0,
  },
  colorDotCompact: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  // TE-141: roter Wichtig-Punkt im kompakten Lesemodus (Dashboard).
  importantDotCompact: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: IMPORTANT_RED,
    flexShrink: 0,
  },
  // TE-141: Icon-Button (Wichtig/Datum) im bearbeitbaren Block.
  iconBtn: {
    padding: 2,
    flexShrink: 0,
  },
  // TE-141: inline angezeigtes Fälligkeitsdatum in der Zeile.
  dueText: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 0,
    maxWidth: 84,
  },
  // TE-141: aufklappbare Fälligkeits-Auswahl unter der Zeile.
  duePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickBtnText: {
    fontSize: 12,
    fontWeight: '500',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  trashBtn: {
    padding: 2,
    flexShrink: 0,
  },
  // Hinweiszeile im Lesemodus, wenn der Block leer ist.
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  emptyText: { fontSize: 13 },
  // TE-112: Verlaufs-Bereich unter dem Notizblock.
  historyWrap: {
    marginTop: 10,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  historyClear: {
    marginLeft: 'auto',
    paddingHorizontal: 4,
  },
  historyClearText: {
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  historyTime: {
    fontSize: 11,
    flexShrink: 0,
  },
});
