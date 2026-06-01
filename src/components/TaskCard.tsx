import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../types';
import { GroupBadge } from './GroupBadge';
import { formatDate, isDueToday, isOverdue } from '../utils/dateFormat';
import { useStore } from '../store';
import { useTheme, ThemeColors, neonGlow, neonBorder } from '../utils/theme';

interface Props {
  task: Task;
  onPress: () => void;
  onToggle: () => void;
  onDelete: () => void;
  isSelected?: boolean;
  onSelectToggle?: () => void;
}

export function TaskCard({ task, onPress, onToggle, onDelete, isSelected, onSelectToggle }: Props) {
  const { groups, settings } = useStore();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const group = groups.find((g) => g.id === task.groupId) ?? null;
  const overdue = isOverdue(task.dueDate) && !task.completed;
  const dueToday = isDueToday(task.dueDate) && !task.completed;

  const leftBorderColor = isSelected
    ? colors.accent
    : task.completed
    ? 'transparent'
    : overdue
    ? colors.danger
    : dueToday
    ? colors.warning
    : 'transparent';

  const isHighlighted = leftBorderColor !== 'transparent';
  const cardGlow = isDark && isHighlighted && !isSelected
    ? neonGlow(leftBorderColor, 'medium')
    : {};
  // Im Neon-Theme: jede Card bekommt einen dezenten Accent-Tint am Rand
  const neonCardBorder = isDark && !isHighlighted && !isSelected
    ? { borderColor: colors.border, borderWidth: 1 }
    : {};

  return (
    <TouchableOpacity
      style={[
        styles.card,
        task.completed && !isSelected && styles.completed,
        { borderLeftColor: leftBorderColor, borderLeftWidth: isHighlighted ? 4 : 1 },
        isSelected && styles.selectedCard,
        neonCardBorder,
        cardGlow,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <TouchableOpacity style={styles.toggleBtn} onPress={onToggle} hitSlop={8}>
        <Ionicons
          name={task.completed ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={task.completed ? colors.success : colors.textMuted}
        />
      </TouchableOpacity>

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

          {(task.attachments ?? []).length > 0 ? (
            <View style={styles.dateRow}>
              <Ionicons name="attach-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.date}>{task.attachments.length}</Text>
            </View>
          ) : null}

          {task.googleEventId ? (
            <Ionicons name="calendar" size={12} color={colors.accent} />
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onSelectToggle} hitSlop={8} style={styles.actionBtn}>
          <Ionicons
            name={isSelected ? 'checkbox' : 'square-outline'}
            size={18}
            color={isSelected ? colors.accent : colors.textMuted}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(c: ThemeColors, _isDark: boolean) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      marginHorizontal: 16,
      marginVertical: 4,
      gap: 10,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    completed: {
      opacity: 0.55,
    },
    selectedCard: {
      backgroundColor: c.accent + '15',
      borderColor: c.accent + '55',
    },
    toggleBtn: {
      marginTop: 1,
    },
    content: {
      flex: 1,
      gap: 4,
    },
    title: {
      fontSize: 15,
      fontWeight: '500',
      color: c.text,
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
    actions: {
      alignItems: 'center',
      gap: 8,
      paddingTop: 1,
    },
    actionBtn: {
      padding: 2,
    },
  });
}
