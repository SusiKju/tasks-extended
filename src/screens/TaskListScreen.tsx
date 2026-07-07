import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
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
import { updateGoogleTask, listTaskLists } from '../services/googleCalendar';
import { useGoogleTasksSync } from '../hooks/useGoogleTasksSync';
import { Scratchpad } from '../components/Scratchpad';
import { useScratchpad } from '../hooks/useScratchpad';

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
  const { tasks, settings, toggleTask, deleteTask, deleteTasks } = useStore();
  const { syncTasks } = useGoogleTasksSync();
  const [filter, setFilter] = useState<FilterMode>('open');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  // TE-104: persönlicher Notizblock – hier voll bearbeitbar (auf dem Dashboard nur Anzeige).
  const {
    scratchpad,
    onChange: onScratchpadChange,
    history: scratchpadHistory,
    archiveNote,
    removeHistory,
    clearHistory,
  } = useScratchpad();
  const scratchAddRef = useRef<(() => void) | null>(null);

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

    return list;
  }, [tasks, filter]);

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

  const hasSelection = selectedIds.size > 0;

  return (
    <View style={styles.container}>
      {/* TE-106: Notizblock- und Tasks-Bereich als zwei klar getrennte, gleich
          gestaltete Boxen in einem ScrollView. Die Task-Liste liegt innerhalb
          der Tasks-Box, damit der Bereich als geschlossene Einheit lesbar ist. */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, hasSelection && styles.listWithBulkBar]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Tasks-Bereich ── */}
        <View style={styles.groupCard}>
          <View style={styles.groupHeader}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.text} />
            <Text style={styles.groupTitle}>Google Tasks</Text>
            <TouchableOpacity
              onPress={() => router.push('/task/new')}
              style={styles.bigAddBtn}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={26} color={isDark ? colors.accentNeon : '#fff'} />
            </TouchableOpacity>
          </View>

          <View style={styles.groupBody}>
            {/* Kompakter Status-Filter (kein Gruppen-/Label-Filter mehr, TE-106) */}
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
            </View>

            {/* Verschmolzene, gerahmte Task-Liste – gleicher Look wie der Notizblock (TE-109) */}
            {filtered.length === 0 ? (
              <View style={styles.emptyInline}>
                <Ionicons name="checkmark-done-circle-outline" size={44} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Keine Tasks</Text>
                <Text style={styles.emptySubtitle}>Tippe auf + um einen neuen Task anzulegen</Text>
              </View>
            ) : (
              <View style={styles.mergedList}>
                {filtered.map((item, i) => (
                  <TaskCard
                    key={item.id}
                    task={item}
                    onPress={() => router.push(`/task/${item.id}` as any)}
                    onToggle={() => handleToggle(item)}
                    onDelete={() => handleSingleDelete(item.id, item.title)}
                    isSelected={selectedIds.has(item.id)}
                    onSelectToggle={() => toggleSelection(item.id)}
                    isLast={i === filtered.length - 1}
                  />
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Notizblock-Bereich ── */}
        {/* TE-117: card streckt sich über den restlichen Platz, statt Leerraum
            unterhalb der Karte als nackten Hintergrund stehen zu lassen. */}
        <View style={[styles.groupCard, styles.groupCardGrow]}>
          <View style={styles.groupHeader}>
            <Ionicons name="document-text-outline" size={18} color={colors.text} />
            <Text style={styles.groupTitle}>Personal Tasks</Text>
            <TouchableOpacity
              onPress={() => scratchAddRef.current?.()}
              style={styles.bigAddBtn}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={26} color={isDark ? colors.accentNeon : '#fff'} />
            </TouchableOpacity>
          </View>
          <View style={[styles.groupBody, styles.groupBodyGrow]}>
            <Scratchpad
              value={scratchpad}
              onChange={onScratchpadChange}
              isDark={isDark}
              colors={colors}
              registerAdd={(fn) => { scratchAddRef.current = fn; }}
              history={scratchpadHistory}
              onArchive={archiveNote}
              onRemoveHistory={removeHistory}
              onClearHistory={clearHistory}
            />
          </View>
        </View>
      </ScrollView>

      {hasSelection && (
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
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    // TE-117: flexGrow, damit die Tasks-Karte unten den Rest der Bildschirmhöhe
    // füllen kann, statt nackten Leerraum unter den Karten zu lassen.
    scrollContent: { paddingTop: 4, paddingBottom: 32, flexGrow: 1 },
    // TE-106: kompakter Status-Filter (kleinere Chips, kein H-Padding – sitzt in der Box).
    filterRow: {
      flexDirection: 'row',
      gap: 6,
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 11,
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
    chipText: {
      fontSize: 12,
      color: c.textSecondary,
    },
    chipTextActive: {
      color: isDark ? c.accentNeon : '#fff',
      fontWeight: '600',
    },
    listWithBulkBar: { paddingBottom: 90 },
    // TE-105/TE-106: gemeinsamer Box-Look für die zwei klar getrennten Bereiche.
    groupCard: {
      marginHorizontal: 12,
      marginTop: 10,
      marginBottom: 2,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    // Header sitzt oben in der Box, durch eine Trennlinie klar vom Inhalt abgesetzt.
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surfaceHigh,
    },
    groupBody: { padding: 12, gap: 8 },
    groupCardGrow: { flex: 1 },
    groupBodyGrow: { flex: 1 },
    groupTitle: { fontSize: 16, fontWeight: '700', color: c.text, flex: 1 },
    // TE-109: verschmolzene, gerahmte Liste (gleicher Look wie der Notizblock).
    mergedList: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: c.surface,
    },
    // Großer, einheitlicher +-Button (ersetzt FAB + kleinen Notizblock-+).
    // Look identisch zum vorherigen FAB: Neon-Rahmen+Glow im Dark, gefüllt im Light.
    bigAddBtn: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? 'transparent' : c.accent,
      borderWidth: isDark ? 1.5 : 0,
      borderColor: c.accentNeon,
      ...(isDark ? neonGlow(c.accentNeon, 'hard') : {}),
    },
    // Leere Task-Liste innerhalb der Tasks-Box (TE-104/TE-106).
    emptyInline: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingTop: 24,
      paddingBottom: 24,
    },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: c.textSecondary },
    emptySubtitle: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 40,
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
      color: c.dangerFg,
    },
  });
}
