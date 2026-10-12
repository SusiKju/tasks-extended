/**
 * QuickAddModal.tsx (TE-70)
 *
 * Einheitliches Schnell-Anlegen-Modal: mittig zentriert, mehrzeilige Textarea,
 * Speichern im Farbverlauf des Typs. Genutzt im Dashboard (Aufgabe/Idee/
 * Geistesblitz), im Tasks-Tab (Aufgaben/Ideen) und im Kinder-Tab.
 *
 * Text ist kontrolliert (value/onChangeText), damit bestehende Submit-Handler
 * ihren State behalten. Optional: Fälligkeit (Heute/Morgen/Datum, TE-69) und
 * `children` für Zusatzfelder unter der Textarea (z. B. Belohnung im Kinder-Tab).
 * Tippen daneben / Zurück speichert statt zu verwerfen (TE-13).
 */

import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors, ButtonGradient } from '../utils/theme';
import { GradientButton } from './GradientButton';
import { DatePickerModal } from './DatePickerModal';
import { localDateStr } from '../utils/dateFormat';

interface Props {
  visible: boolean;
  title: string;
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  colors: ThemeColors;
  gradient?: ButtonGradient;
  placeholder?: string;
  /** Fälligkeit anzeigen (nur wenn beides gesetzt). */
  due?: Date;
  onDueChange?: (d: Date) => void;
  children?: React.ReactNode;
}

export function QuickAddModal({
  visible, title, value, onChangeText, onSubmit, colors, gradient,
  placeholder = 'Text eingeben …', due, onDueChange, children,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const dueRow = due && onDueChange && (() => {
    const todayStr = localDateStr(new Date().toISOString());
    const tm = new Date(); tm.setDate(tm.getDate() + 1);
    const tomorrowStr = localDateStr(tm.toISOString());
    const dueStr = localDateStr(due.toISOString());
    const custom = dueStr !== todayStr && dueStr !== tomorrowStr;
    const chip = (label: string, active: boolean, onPress: () => void, icon?: boolean) => (
      <Pressable
        key={label}
        onPress={onPress}
        style={[s.dueChip, { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accent : colors.surface }]}
      >
        {icon && <Ionicons name="calendar-outline" size={14} color={active ? colors.accentFg : colors.text} />}
        <Text style={[s.dueText, { color: active ? colors.accentFg : colors.text }]}>{label}</Text>
      </Pressable>
    );
    return (
      <View style={s.dueRow}>
        {chip('Heute', dueStr === todayStr, () => onDueChange(new Date()))}
        {chip('Morgen', dueStr === tomorrowStr, () => onDueChange(tm))}
        {chip(custom ? due.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Datum…', custom, () => setPickerOpen(true), true)}
      </View>
    );
  })();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onSubmit}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onSubmit} />
        <View style={[s.card, { backgroundColor: colors.background }]}>
          <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <Text style={[s.title, { color: colors.text }]}>{title}</Text>
            <TextInput
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor={colors.textMuted}
              style={[s.input, { color: colors.text, borderColor: colors.border }]}
              autoFocus
              multiline
              textAlignVertical="top"
            />
            {dueRow}
            {children}
            <GradientButton
              gradient={gradient}
              onPress={onSubmit}
              style={s.saveBtn}
              fallbackStyle={{ backgroundColor: colors.accent }}
            >
              <Text style={[s.saveText, { color: gradient ? gradient.fg : colors.accentFg }]}>Speichern</Text>
            </GradientButton>
          </ScrollView>
        </View>
      </View>
      {/* TE-69: verschachtelt, damit iOS nicht zwei Modals parallel präsentieren muss. */}
      {due && onDueChange && (
        <DatePickerModal
          visible={pickerOpen}
          value={due}
          onConfirm={(d) => { onDueChange(d); setPickerOpen(false); }}
          onCancel={() => setPickerOpen(false)}
          colors={colors}
        />
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  card: { borderRadius: 16, maxHeight: '85%', width: '88%', maxWidth: 520, alignSelf: 'center' },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, minHeight: 140, maxHeight: 320,
  },
  dueRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dueChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
  },
  dueText: { fontSize: 13, fontWeight: '600' },
  saveBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  saveText: { fontWeight: '600', fontSize: 14 },
});
