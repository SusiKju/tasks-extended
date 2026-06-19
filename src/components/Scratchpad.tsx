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
import { ThemeColors, neonGlow } from '../utils/theme';

export interface ScratchEntry { id?: string; text: string; color: string; }

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
  const isNeon = isDark && colors.accentNeon === '#00EEFF';
  // Erkennt beide monochromen Themes (dunkles Schwarz-Weiß UND sein helles
  // Negativ) – unabhängig von isDark, denn das Negativ-Theme ist hell.
  const isMono = colors.accentNeon === '#FFFFFF' || colors.accentNeon === '#000000';
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

  // TE-104: Im Lesemodus nur Notizen mit Inhalt zeigen; bei komplett leerem
  // Block eine ruhige Hinweiszeile statt einer leeren Eingabe-Bubble.
  if (readOnly) {
    const filled = entries.filter((e) => e.text.trim() !== '');
    if (filled.length === 0) {
      return (
        <View style={padStyles.container}>
          <View style={[padStyles.emptyRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="document-text-outline" size={15} color={colors.textMuted} />
            <Text style={[padStyles.emptyText, { color: colors.textMuted }]}>
              Noch keine Notizen – tippe oben auf +.
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View style={padStyles.container}>
        {filled.map((entry, idx) => {
          const fg = isNeon ? entry.color : isMono ? colors.text : readableText(entry.color);
          const bulletColor = isNeon || isMono ? entry.color : fg + '99';
          return (
            <View
              key={entry.id ?? idx}
              style={[
                padStyles.bubble,
                isNeon
                  ? { backgroundColor: entry.color + '14', borderWidth: 1.5, borderColor: entry.color, ...neonGlow(entry.color, 'soft') }
                  : isMono
                  ? { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border }
                  : { backgroundColor: entry.color },
              ]}
            >
              <View style={[padStyles.bullet, { backgroundColor: bulletColor }]} />
              <Text style={[padStyles.bubbleInput, { color: fg }]}>{entry.text}</Text>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={padStyles.container}>
      {entries.map((entry, idx) => {
        // Neon-Theme: Tasks-Tab-Stil – keine Füllung, Rahmen + Schrift in der
        // Bubble-Farbe + Glow. Bessere Lesbarkeit, einheitlicher Look.
        // Sonst (dark-soft/neutral): solide Bubble; Textfarbe wird per Luminanz
        // gewählt (TE-85), damit helle Farben wie Gelb dunklen Text bekommen.
        // Im monochromen Theme bleibt die Theme-Textfarbe, der gewählte Farbton
        // erscheint stattdessen im Bullet-Punkt.
        const fg = isNeon ? entry.color : isMono ? colors.text : readableText(entry.color);
        // Bullet zeigt die gewählte Farbe (Neon/Mono) bzw. einen Kontrastpunkt
        // (Neutral, dort ist die Bubble selbst schon eingefärbt).
        const bulletColor = isNeon || isMono ? entry.color : fg + '99';
        return (
        <View key={idx}>
        <View style={[
          padStyles.bubble,
          isNeon
            ? { backgroundColor: entry.color + '14', borderWidth: 1.5, borderColor: entry.color, ...neonGlow(entry.color, 'soft') }
            : isMono
            ? { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border }
            : { backgroundColor: entry.color },
        ]}>
          {/* Bullet ist zugleich der Farb-Picker-Auslöser (TE-85). */}
          <Pressable
            onPress={() => setPickerIdx((cur) => (cur === idx ? null : idx))}
            hitSlop={8}
          >
            <View style={[padStyles.bullet, { backgroundColor: bulletColor }]} />
          </Pressable>
          <TextInput
            ref={(r) => { inputRefs.current[idx] = r; }}
            style={[padStyles.bubbleInput, { color: fg }]}
            value={entry.text}
            onChangeText={(t) => updateEntry(idx, t)}
            onKeyPress={(e) => handleKeyPress(idx, e)}
            // TE-85: Enter legt keine neue Notiz mehr an (das macht der +-Button),
            // sondern schließt die Eingabe nur ab (blurOnSubmit).
            placeholder={idx === 0 && entries.length === 1 ? 'Notiz…' : ''}
            placeholderTextColor={fg + '55'}
            returnKeyType="done"
            blurOnSubmit
          />
          {/* X immer rechts, oben ausgerichtet damit er bei zweizeiligem Text sichtbar bleibt */}
          <Pressable
            onPress={() => removeEntry(idx)}
            hitSlop={8}
            style={[padStyles.deleteBtn, { backgroundColor: colors.danger + '22' }]}
          >
            <Ionicons name="close" size={16} color={colors.danger} />
          </Pressable>
        </View>
        {/* Farbauswahl: fünf feste Optionen, sichtbar beim Anlegen wie beim Bearbeiten. */}
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
        );
      })}
    </View>
  );
}

const padStyles = StyleSheet.create({
  container: {
    gap: 4,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  bullet: {
    width: 10,
    height: 10,
    borderRadius: 999,
    flexShrink: 0,
  },
  bubbleInput: {
    flex: 1,
    minWidth: 0,        // verhindert, dass langer Text den X-Button rausschiebt
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    padding: 0,
  },
  deleteBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // TE-85: Farbauswahl-Reihe unter der Notiz.
  palette: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 2,
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
  // TE-104: ruhige Hinweiszeile im Lesemodus, wenn der Block leer ist.
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  emptyText: { fontSize: 13 },
});
