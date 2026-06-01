import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SectionList,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { TaskCard } from '../components/TaskCard';
import { Task } from '../types';
import { isOverdue } from '../utils/dateFormat';
import { useTheme, ThemeColors, neonGlow } from '../utils/theme';
import { updateCalendarEvent, updateGoogleTask, listTaskLists } from '../services/googleCalendar';
import { useGoogleTasksSync } from '../hooks/useGoogleTasksSync';

function confirmDelete(title: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if ((window as any).confirm(`"${title}" löschen?`)) onConfirm();
  } else {
    Alert.alert('Task löschen', `"${title}" endgültig löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: onConfirm },
    ]);
  }
}

type FilterMode = 'all' | 'open' | 'overdue' | 'done';

export function TaskListScreen() {
  const router = useRouter();
  const { tasks, groups, settings, toggleTask, deleteTask, deleteTasks } = useStore();
  const { syncTasks } = useGoogleTasksSync();
  const [filter, setFilter] = useState<FilterMode>('open');
  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { colors, isDark, mono } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleToggle = useCallback(async (task: Task) => {
    const newCompleted = !task.completed;
    toggleTask(task.id);

    if (!settings.googleCalendarEnabled || !settings.googleAccessToken || !task.googleEventId) return;

    const token = settings.googleAccessToken;

    // Push completion status to Google Tasks API
    const lists = await listTaskLists(token).catch(() => []);
    const taskListId = lists[0]?.id;
    if (taskListId) {
      await updateGoogleTask(token, taskListId, task.googleEventId, {
        status: newCompleted ? 'completed' : 'needsAction',
      }).catch(() => {});
    }

    // Also update the Calendar event if one exists (best-effort)
    if (settings.googleCalendarId && task.dueDate) {
      await updateCalendarEvent(
        { ...task, completed: newCompleted },
        token,
        settings.googleCalendarId,
        task.googleEventId
      ).catch(() => {});
    }
  }, [toggleTask, settings]);

  const handleSingleDelete = useCallback(
    (id: string, title: string) => {
      confirmDelete(title, () => {
        deleteTask(id);
        setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        setTimeout(() => syncTasks().catch(() => {}), 300);
      });
    },
    [deleteTask, syncTasks]
  );

  const filtered = useMemo(() => {
    let list = tasks;

    if (filter === 'open') list = list.filter((t) => !t.completed);
    if (filter === 'overdue') list = list.filter((t) => isOverdue(t.dueDate) && !t.completed);
    if (filter === 'done') list = list.filter((t) => t.completed);
    if (selectedGroupId) list = list.filter((t) => t.groupId === selectedGroupId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    }

    return list;
  }, [tasks, filter, selectedGroupId, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id));

  const handleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((t) => t.id)));
    }
  }, [allFilteredSelected, filtered]);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    const label = `${count} Task${count !== 1 ? 's' : ''} löschen?`;
    const doDelete = () => {
      deleteTasks(Array.from(selectedIds));
      clearSelection();
      setTimeout(() => syncTasks().catch(() => {}), 300);
    };
    if (Platform.OS === 'web') {
      if ((window as any).confirm(label)) doDelete();
    } else {
      Alert.alert('Tasks löschen', label, [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [selectedIds, deleteTasks, clearSelection, syncTasks]);

  const sections = useMemo(() => {
    const byGroup: Record<string, Task[]> = {};
    const ungrouped: Task[] = [];

    for (const task of filtered) {
      if (task.groupId) {
        (byGroup[task.groupId] ??= []).push(task);
      } else {
        ungrouped.push(task);
      }
    }

    const result = groups
      .filter((g) => byGroup[g.id]?.length > 0)
      .map((g) => ({ title: g.name, data: byGroup[g.id], color: g.color }));

    if (ungrouped.length > 0) {
      result.push({ title: 'Ohne Gruppe', data: ungrouped, color: colors.textMuted });
    }

    return result;
  }, [filtered, groups, colors]);

  const hasSelection = selectedIds.size > 0;

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Suchen…"
          placeholderTextColor={colors.placeholder}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {(['all', 'open', 'overdue', 'done'] as FilterMode[]).map((f) => {
          const isActive = filter === f;
          const isDanger = f === 'overdue' && isActive;
          return (
            <TouchableOpacity
              key={f}
              style={[
                styles.chip,
                isActive && (isDanger ? styles.chipDanger : styles.chipActive),
              ]}
              onPress={() => setFilter(f)}
            >
              {f === 'overdue' ? (
                <Ionicons
                  name="alert-circle-outline"
                  size={12}
                  color={isActive ? '#fff' : colors.danger}
                />
              ) : null}
              <Text
                style={[
                  styles.chipText,
                  isActive && styles.chipTextActive,
                  !isActive && f === 'overdue' && { color: colors.danger },
                ]}
              >
                {f === 'all'
                  ? 'Alle'
                  : f === 'open'
                  ? 'Offen'
                  : f === 'overdue'
                  ? 'Abgelaufen'
                  : 'Erledigt'}
              </Text>
            </TouchableOpacity>
          );
        })}

        <View style={styles.divider} />

        <TouchableOpacity
          style={[styles.chip, !selectedGroupId && styles.chipActive]}
          onPress={() => setSelectedGroupId(null)}
        >
          <Text style={[styles.chipText, !selectedGroupId && styles.chipTextActive]}>
            Alle Gruppen
          </Text>
        </TouchableOpacity>

        {groups.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={[
              styles.chip,
              selectedGroupId === g.id && {
                backgroundColor: mono(g.color) + '22',
                borderColor: mono(g.color),
              },
            ]}
            onPress={() => setSelectedGroupId(g.id === selectedGroupId ? null : g.id)}
          >
            <View style={[styles.chipDot, { backgroundColor: mono(g.color) }]} />
            <Text
              style={[
                styles.chipText,
                selectedGroupId === g.id && { color: mono(g.color), fontWeight: '600' },
              ]}
            >
              {g.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-done-circle-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Keine Tasks</Text>
          <Text style={styles.emptySubtitle}>Tippe auf + um einen neuen Task anzulegen</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              onPress={() => router.push(`/task/${item.id}` as any)}
              onToggle={() => handleToggle(item)}
              onDelete={() => handleSingleDelete(item.id, item.title)}
              isSelected={selectedIds.has(item.id)}
              onSelectToggle={() => toggleSelection(item.id)}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: mono(section.color) }]} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          contentContainerStyle={[styles.list, hasSelection && styles.listWithBulkBar]}
          stickySectionHeadersEnabled={false}
        />
      )}

      {hasSelection ? (
        <View style={styles.bulkBar}>
          <TouchableOpacity style={styles.bulkSelectAll} onPress={handleSelectAll}>
            <Ionicons
              name={allFilteredSelected ? 'checkbox' : 'square-outline'}
              size={20}
              color={allFilteredSelected ? colors.accent : colors.textSecondary}
            />
            <Text style={styles.bulkSelectAllText}>
              {allFilteredSelected ? 'Alle abwählen' : 'Alle auswählen'}
            </Text>
          </TouchableOpacity>

          <View style={styles.bulkRight}>
            <TouchableOpacity onPress={clearSelection}>
              <Text style={styles.bulkCancelText}>Abbrechen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkDeleteBtn} onPress={handleBulkDelete}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.bulkDeleteText}>{selectedIds.size} löschen</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/task/new')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color={isDark ? colors.accentNeon : '#fff'} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 6,
      borderWidth: 1,
      borderColor: c.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: c.text,
    },
    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 6,
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      gap: 4,
    },
    chipActive: {
      backgroundColor: isDark ? c.accentNeon + '18' : c.accent,
      borderColor: isDark ? c.accentNeon : c.accent,
      borderWidth: isDark ? 1.5 : 1,
      ...(isDark ? neonGlow(c.accentNeon, 'medium') : {}),
    },
    chipDanger: {
      backgroundColor: isDark ? c.danger + '18' : c.danger,
      borderColor: c.danger,
      borderWidth: isDark ? 1.5 : 1,
      ...(isDark ? neonGlow(c.danger, 'medium') : {}),
    },
    chipDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    chipText: {
      fontSize: 13,
      color: c.textSecondary,
    },
    chipTextActive: {
      color: isDark ? c.accentNeon : '#fff',
      fontWeight: '600',
    },
    divider: {
      width: 1,
      height: 16,
      backgroundColor: c.border,
      marginHorizontal: 2,
    },
    list: { paddingBottom: 100 },
    listWithBulkBar: { paddingBottom: 90 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 6,
      gap: 6,
    },
    sectionDot: { width: 8, height: 8, borderRadius: 4 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: c.textSecondary, flex: 1 },
    sectionCount: {
      fontSize: 12,
      color: c.textSecondary,
      backgroundColor: c.surfaceHigh,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 8,
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingBottom: 60,
    },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: c.textSecondary },
    emptySubtitle: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 40,
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 32,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark ? 'transparent' : c.accent,
      borderWidth: isDark ? 1.5 : 0,
      borderColor: isDark ? c.accentNeon : 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      ...(isDark
        ? neonGlow(c.accentNeon, 'hard')
        : {
            shadowColor: c.accent,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 6,
          }),
    },
    bulkBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 28,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    bulkSelectAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    bulkSelectAllText: {
      fontSize: 14,
      color: c.textSecondary,
    },
    bulkRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    bulkCancelText: {
      fontSize: 14,
      color: c.textSecondary,
    },
    bulkDeleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.danger,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
    },
    bulkDeleteText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#fff',
    },
  });
}
