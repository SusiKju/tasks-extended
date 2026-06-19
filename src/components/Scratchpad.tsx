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

export interface ScratchEntry { id?: string; text: string; color: string; done?: boolean; }

/** Stabile, kollisionsarme ID für eine neue Notiz (siehe TE-95-Migration unten). */
export function makeNoteId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// TE-85: feste, vom Nutzer wählbare Notiz-Farben. Default ist Dunkles Pink.
// Die gewählte Farbe (entry.color) gewinnt ab jetzt über die Theme-Automatik.
const NOTE_COLOR_OPTIONS: { key: string; label: string; color: string }[] = [
  { key: 'pink',   label: 'Dunkles Pink', color: '#C2185B' },
  { key: 'blue',   label: 'Neonblau',     color: '#2299FF' },
  { key: 'green',  label: 'Neongrün',     color: '#00FF88' },
  { key: 'yellow', label: 'Neongelb',     color: '#FFE600' },
  { key: 'gray',   label: 'Grau',         color: '#9E9E9E' },
];
const NOTE_DEFAULT_COLOR = NOTE_COLOR_OPTIONS[0].color; // Dunkles Pink

// Lesbare Textfarbe für eine solide Bubble: helle Hintergründe (Gelb/Grün/Grau)
// brauchen dunklen Text, dunkle (Pink/Blau) weißen. Luminanz nach Rec. 601.
function readableText(bg: string): string {
  const hex = bg.replace('#', '');
  if (hex.length < 6) return '#FFFFFF';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? '#1A1A1A' : '#FFFFFF';
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
}) {
  const entries = useMemo(() => parseScratchpad(value), [value]);
  const inputRefs = useRef<(any)[]>([]);
  // TE-85: welche Notiz hat gerade die Farbauswahl offen (null = keine).
  const [pickerIdx, setPickerIdx] = useState<number | null>(null);

  const emit = useCallback((s: string) => { onChange?.(s); }, [onChange]);

  const updateEntry = useCallback((idx: number, text: string) => {
    const next = entries.map((e, i) => i === idx ? { ...e, text } : e);
    emit(serializeScratchpad(next));
  }, [entries, emit]);

  // TE-85: gewählte Farbe einer Notiz setzen.
  const updateColor = useCallback((idx: number, color: string) => {
    const next = entries.map((e, i) => i === idx ? { ...e, color } : e);
    emit(serializeScratchpad(next));
  }, [entries, emit]);

  // TE-109: erledigt-Status einer Notiz umschalten (runde Checkbox, wie bei Tasks).
  const toggleDone = useCallback((idx: number) => {
    const next = entries.map((e, i) => i === idx ? { ...e, done: !e.done } : e);
    emit(serializeScratchpad(next));
  }, [entries, emit]);

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

  const removeEntry = useCallback((idx: number) => {
    if (entries.length <= 1) { updateEntry(0, ''); return; }
    const next = entries.filter((_, i) => i !== idx);
    emit(serializeScratchpad(next));
    setTimeout(() => inputRefs.current[Math.max(0, idx - 1)]?.focus(), 40);
  }, [entries, emit, updateEntry]);

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
            <View style={[padStyles.colorDotCompact, { backgroundColor: entry.color }]} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={[padStyles.mergedList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {entries.map((entry, idx) => (
        <View
          key={entry.id ?? idx}
          style={idx < entries.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border } : undefined}
        >
          {/* Zeile im Task-Stil: runde Checkbox + Text + Farbpunkt + Trash (TE-109) */}
          <View style={padStyles.row}>
            <Pressable onPress={() => toggleDone(idx)} hitSlop={8}>
              <Ionicons
                name={entry.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={entry.done ? colors.success : colors.textMuted}
              />
            </Pressable>
            <TextInput
              ref={(r) => { inputRefs.current[idx] = r; }}
              style={[padStyles.rowText, { color: colors.text }, entry.done && { textDecorationLine: 'line-through', color: colors.textMuted }]}
              value={entry.text}
              onChangeText={(t) => updateEntry(idx, t)}
              onKeyPress={(e) => handleKeyPress(idx, e)}
              placeholder={idx === 0 && entries.length === 1 ? 'Notiz…' : ''}
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              blurOnSubmit
            />
            {/* Farbpunkt = Farb-Picker-Auslöser (TE-85/TE-109). */}
            <Pressable onPress={() => setPickerIdx((cur) => (cur === idx ? null : idx))} hitSlop={8}>
              <View style={[padStyles.colorDot, { backgroundColor: entry.color, borderColor: colors.border }]} />
            </Pressable>
            <Pressable onPress={() => removeEntry(idx)} hitSlop={8} style={padStyles.trashBtn}>
              <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Farbauswahl: fünf feste Optionen, unterhalb der Zeile. */}
          {pickerIdx === idx && (
            <View style={[padStyles.palette, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
              {NOTE_COLOR_OPTIONS.map((opt) => {
                const selected = entry.color === opt.color;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { updateColor(idx, opt.color); setPickerIdx(null); }}
                    hitSlop={6}
                    style={[
                      padStyles.swatch,
                      { backgroundColor: opt.color },
                      selected && { borderWidth: 2, borderColor: colors.text },
                    ]}
                  >
                    {selected && <Ionicons name="checkmark" size={12} color={readableText(opt.color)} />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ))}
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
  // TE-85: Farbauswahl-Reihe unter der Notiz.
  palette: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
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
});
