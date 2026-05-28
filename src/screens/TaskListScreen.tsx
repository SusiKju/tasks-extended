import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SectionList,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { TaskCard } from '../components/TaskCard';
import { Task } from '../types';

type FilterMode = 'all' | 'open' | 'done';

export function TaskListScreen() {
  const router = useRouter();
  const { tasks, groups, toggleTask } = useStore();
  const [filter, setFilter] = useState<FilterMode>('open');
  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = tasks;

    if (filter === 'open') list = list.filter((t) => !t.completed);
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
      result.push({ title: 'Ohne Gruppe', data: ungrouped, color: '#C7C7CC' });
    }

    return result;
  }, [filtered, groups]);

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Suchen…"
          placeholderTextColor="#C7C7CC"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#C7C7CC" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {(['all', 'open', 'done'] as FilterMode[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === 'all' ? 'Alle' : f === 'open' ? 'Offen' : 'Erledigt'}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={styles.divider} />

        <TouchableOpacity
          style={[styles.chip, !selectedGroupId && styles.chipActive]}
          onPress={() => setSelectedGroupId(null)}
        >
          <Text style={[styles.chipText, !selectedGroupId && styles.chipTextActive]}>Alle Gruppen</Text>
        </TouchableOpacity>

        {groups.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={[styles.chip, selectedGroupId === g.id && { backgroundColor: g.color + '22', borderColor: g.color }]}
            onPress={() => setSelectedGroupId(g.id === selectedGroupId ? null : g.id)}
          >
            <View style={[styles.chipDot, { backgroundColor: g.color }]} />
            <Text
              style={[
                styles.chipText,
                selectedGroupId === g.id && { color: g.color, fontWeight: '600' },
              ]}
            >
              {g.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-done-circle-outline" size={56} color="#C7C7CC" />
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
              onPress={() => router.push({ pathname: '/task/[id]', params: { id: item.id } })}
              onToggle={() => toggleTask(item.id)}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: section.color }]} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/task/new')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  searchIcon: {},
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1C1C1E',
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
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    gap: 4,
  },
  chipActive: {
    backgroundColor: '#1C1C1E',
    borderColor: '#1C1C1E',
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    fontSize: 13,
    color: '#3C3C43',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: '#E5E5EA',
    marginHorizontal: 2,
  },
  list: { paddingBottom: 100 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
    gap: 6,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#3C3C43', flex: 1 },
  sectionCount: {
    fontSize: 12,
    color: '#8E8E93',
    backgroundColor: '#E5E5EA',
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
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#3C3C43' },
  emptySubtitle: { fontSize: 14, color: '#8E8E93', textAlign: 'center', paddingHorizontal: 40 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4F86F7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F86F7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
});
