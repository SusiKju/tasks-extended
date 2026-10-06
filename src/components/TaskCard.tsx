import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../types';
import { GroupBadge } from './GroupBadge';
import { formatDate, isDueToday, isOverdue } from '../utils/dateFormat';
import { useStore } from '../store';
import { useTheme, ThemeColors } from '../utils/theme';

interface Props {
  task: Task;
  // TE-109: letzte Zeile in der verschmolzenen Liste bekommt keine Trennlinie.
  isLast?: boolean;
}

// TE-3: Google Tasks sind nur noch Anzeige – angelegt, abgehakt und gelöscht
// wird ausschließlich in Google, die App holt sie per Sync nur ab.
// TE-22: daher auch keine Checkbox und gedämpfte Schrift (Read-only-Look).
export function TaskCard({ task, isLast }: Props) {
  const { groups, settings } = useStore();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const group = groups.find((g) => g.id === task.groupId) ?? null;
  const overdue = isOverdue(task.dueDate) && !task.completed;
  const dueToday = isDueToday(task.dueDate) && !task.completed;

  const leftBorderColor = task.completed
    ? 'transparent'
    : overdue
    ? colors.danger
    : dueToday
    ? colors.warning
    : 'transparent';

  const isHighlighted = leftBorderColor !== 'transparent';

  return (
    <View
      style={[
        styles.card,
        !isLast && styles.rowDivider,
        task.completed && styles.completed,
        // TE-108: flache Listenzeile – nur ein dünner Akzent-Balken links bei
        // überfällig/heute, sonst keine eigene Umrandung.
        { borderLeftColor: leftBorderColor, borderLeftWidth: isHighlighted ? 3 : 0 },
      ]}
    >
      {/* TE-22: keine Checkbox – abgehakt wird nur in Google. */}
      <View style={styles.content}>
        <Text style={[styles.title, task.completed && styles.completedText]} numberOfLines={2}>
          {task.title}
        </Text>

        {task.description ? (
          <Text style={styles.description} numberOfLines={1}>
            {task.description}
          </Text>
        ) : null}

        <View style={styles.meta}>
          {group ? <GroupBadge group={group} small /> : null}

          {task.dueDate ? (
            <View style={styles.dateRow}>
              <Ionicons
                name="calendar-outline"
                size={12}
                color={overdue ? colors.danger : dueToday ? colors.warning : colors.textSecondary}
              />
              <Text
                style={[
                  styles.date,
                  overdue && { color: colors.danger, fontWeight: '600' },
                  dueToday && { color: colors.warning, fontWeight: '600' },
                ]}
              >
                {formatDate(task.dueDate, settings.dateFormat)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors, _isDark: boolean) {
  return StyleSheet.create({
    // TE-108/TE-109: flache Listenzeile in der verschmolzenen, gerahmten Liste.
    // Der Rahmen kommt vom Container; zwischen den Zeilen nur eine einfache Linie.
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 9,
      paddingHorizontal: 10,
      gap: 10,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    completed: {
      opacity: 0.55,
    },
    content: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: 15,
      fontWeight: '500',
      color: c.textSecondary,
    },
    completedText: {
      textDecorationLine: 'line-through',
      color: c.textSecondary,
    },
    description: {
      fontSize: 13,
      color: c.textSecondary,
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    date: {
      fontSize: 11,
      color: c.textSecondary,
    },
  });
}
