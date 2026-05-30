import React, { useState, useCallback } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../utils/theme';

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

interface DatePickerModalProps {
  visible: boolean;
  value: Date | null;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  colors: ThemeColors;
}

export function DatePickerModal({ visible, value, onConfirm, onCancel, colors }: DatePickerModalProps) {
  const today = new Date();

  const [viewYear, setViewYear] = useState(() => (value ?? today).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (value ?? today).getMonth());
  const [selected, setSelected] = useState<Date | null>(value);

  React.useEffect(() => {
    if (visible) {
      const d = value ?? today;
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setSelected(value);
    }
  }, [visible]);

  const prevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }, []);

  const handleSelectDay = useCallback(
    (day: number) => setSelected(new Date(viewYear, viewMonth, day)),
    [viewYear, viewMonth],
  );

  const handleConfirm = useCallback(() => {
    if (selected) onConfirm(selected);
  }, [selected, onConfirm]);

  const firstOffset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isSelected = (day: number) =>
    selected !== null &&
    selected.getFullYear() === viewYear &&
    selected.getMonth() === viewMonth &&
    selected.getDate() === day;

  const isTodayCell = (day: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth() === viewMonth &&
    today.getDate() === day;

  const s = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={s.container}>
          <View style={s.header}>
            <Pressable onPress={() => setViewYear((y) => y - 1)} style={s.yearBtn} hitSlop={8}>
              <Ionicons name="chevron-back-outline" size={18} color={colors.textSecondary} />
            </Pressable>

            <View style={s.monthNav}>
              <Pressable onPress={prevMonth} style={s.navBtn} hitSlop={8}>
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </Pressable>
              <Text style={s.monthLabel}>
                {MONTHS[viewMonth]} {viewYear}
              </Text>
              <Pressable onPress={nextMonth} style={s.navBtn} hitSlop={8}>
                <Ionicons name="chevron-forward" size={20} color={colors.text} />
              </Pressable>
            </View>

            <Pressable onPress={() => setViewYear((y) => y + 1)} style={s.yearBtn} hitSlop={8}>
              <Ionicons name="chevron-forward-outline" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={s.weekdayRow}>
            {WEEKDAYS.map((d) => (
              <Text key={d} style={s.weekday}>{d}</Text>
            ))}
          </View>

          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <View key={row} style={s.week}>
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => (
                <Pressable
                  key={col}
                  onPress={day ? () => handleSelectDay(day) : undefined}
                  style={[s.dayCell, day && isSelected(day) ? { backgroundColor: colors.accent, borderRadius: 20 } : null]}
                >
                  {day ? (
                    <Text
                      style={[
                        s.dayText,
                        isTodayCell(day) && !isSelected(day) && { color: colors.accent, fontWeight: '700' },
                        isSelected(day) && { color: '#fff', fontWeight: '700' },
                      ]}
                    >
                      {day}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ))}

          <View style={s.actions}>
            <Pressable onPress={onCancel} style={s.cancelBtn}>
              <Text style={[s.cancelText, { color: colors.textSecondary }]}>Abbrechen</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              style={[s.confirmBtn, { backgroundColor: selected ? colors.accent : colors.border }]}
              disabled={!selected}
            >
              <Text style={s.confirmText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    container: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      width: 320,
      borderWidth: 1,
      borderColor: c.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    yearBtn: {
      padding: 4,
    },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      justifyContent: 'center',
    },
    navBtn: { padding: 4 },
    monthLabel: { fontSize: 16, fontWeight: '600', color: c.text, minWidth: 150, textAlign: 'center' },
    weekdayRow: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    weekday: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
      paddingVertical: 4,
    },
    week: { flexDirection: 'row' },
    dayCell: {
      flex: 1,
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      margin: 1,
    },
    dayText: {
      fontSize: 14,
      color: c.text,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 14,
    },
    cancelBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    cancelText: { fontSize: 15, fontWeight: '500' },
    confirmBtn: {
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 10,
    },
    confirmText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  });
}
