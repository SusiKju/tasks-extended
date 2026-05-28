import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task, Group } from '../types';
import { GroupBadge } from './GroupBadge';
import { formatDate, isDueToday, isOverdue } from '../utils/dateFormat';
import { useStore } from '../store';

interface Props {
  task: Task;
  onPress: () => void;
  onToggle: () => void;
}

export function TaskCard({ task, onPress, onToggle }: Props) {
  const { groups, settings } = useStore();
  const group = groups.find((g) => g.id === task.groupId) ?? null;
  const overdue = isOverdue(task.dueDate) && !task.completed;
  const dueToday = isDueToday(task.dueDate) && !task.completed;

  return (
    <TouchableOpacity style={[styles.card, task.completed && styles.completed]} onPress={onPress} activeOpacity={0.7}>
      <TouchableOpacity style={styles.checkbox} onPress={onToggle} hitSlop={8}>
        <Ionicons
          name={task.completed ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={task.completed ? '#34C759' : '#C7C7CC'}
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
                color={overdue ? '#FF3B30' : dueToday ? '#FF9500' : '#8E8E93'}
              />
              <Text style={[styles.date, overdue && styles.overdue, dueToday && styles.dueToday]}>
                {formatDate(task.dueDate, settings.dateFormat)}
              </Text>
            </View>
          ) : null}

          {task.attachments.length > 0 ? (
            <View style={styles.dateRow}>
              <Ionicons name="attach-outline" size={12} color="#8E8E93" />
              <Text style={styles.date}>{task.attachments.length}</Text>
            </View>
          ) : null}

          {task.googleEventId ? (
            <Ionicons name="calendar" size={12} color="#4F86F7" />
          ) : null}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  completed: {
    opacity: 0.55,
  },
  checkbox: {
    marginTop: 1,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#8E8E93',
  },
  description: {
    fontSize: 13,
    color: '#8E8E93',
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
    color: '#8E8E93',
  },
  overdue: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  dueToday: {
    color: '#FF9500',
    fontWeight: '600',
  },
});
