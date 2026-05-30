import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import uuid from 'react-native-uuid';
import { useStore } from '../store';
import { Group } from '../types';
import { useTheme, ThemeColors, neonGlow } from '../utils/theme';

const PRESET_COLORS = [
  '#4F86F7',
  '#34C759',
  '#FF9500',
  '#FF3B30',
  '#AF52DE',
  '#FF2D55',
  '#5AC8FA',
  '#FFCC00',
  '#5856D6',
  '#32ADE6',
];

interface GroupFormState {
  name: string;
  color: string;
  keywords: string;
}

const EMPTY_FORM: GroupFormState = { name: '', color: PRESET_COLORS[0], keywords: '' };

export function GroupsScreen() {
  const { groups, tasks, addGroup, updateGroup, deleteGroup } = useStore();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GroupFormState>(EMPTY_FORM);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }, []);

  const openEdit = useCallback((group: Group) => {
    setEditingId(group.id);
    setForm({
      name: group.name,
      color: group.color,
      keywords: group.keywords.join(', '),
    });
    setModalVisible(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!form.name.trim()) {
      Alert.alert('Name fehlt', 'Bitte gib einen Gruppennamen ein.');
      return;
    }

    const keywords = form.keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    if (editingId) {
      updateGroup(editingId, { name: form.name.trim(), color: form.color, keywords });
    } else {
      const group: Group = {
        id: uuid.v4() as string,
        name: form.name.trim(),
        color: form.color,
        keywords,
        createdAt: new Date().toISOString(),
      };
      addGroup(group);
    }

    setModalVisible(false);
  }, [form, editingId, addGroup, updateGroup]);

  const handleDelete = useCallback(
    (group: Group) => {
      const taskCount = tasks.filter((t) => t.groupId === group.id).length;
      const msg =
        taskCount > 0
          ? `Diese Gruppe hat ${taskCount} Task${taskCount > 1 ? 's' : ''}. Diese werden auf "Keine Gruppe" gesetzt.`
          : 'Gruppe wirklich löschen?';

      Alert.alert(`Gruppe "${group.name}" löschen`, msg, [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: () => deleteGroup(group.id) },
      ]);
    },
    [tasks, deleteGroup]
  );

  const taskCountFor = useCallback(
    (groupId: string) => tasks.filter((t) => t.groupId === groupId).length,
    [tasks]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={56} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Keine Gruppen</Text>
            <Text style={styles.emptySubtitle}>Lege Gruppen an, um deine Tasks zu organisieren</Text>
          </View>
        }
        renderItem={({ item: group }) => (
          <View style={styles.groupRow}>
            <View style={[styles.colorStripe, { backgroundColor: group.color }]} />

            <View style={styles.groupInfo}>
              <View style={styles.groupNameRow}>
                <Text style={styles.groupName}>{group.name}</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{taskCountFor(group.id)}</Text>
                </View>
              </View>

              {group.keywords.length > 0 ? (
                <View style={styles.keywordRow}>
                  {group.keywords.slice(0, 5).map((kw) => (
                    <View key={kw} style={styles.kwBadge}>
                      <Text style={styles.kwText}>{kw}</Text>
                    </View>
                  ))}
                  {group.keywords.length > 5 ? (
                    <Text style={styles.kwMore}>+{group.keywords.length - 5}</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.noKeywords}>Keine Schlüsselwörter</Text>
              )}
            </View>

            <View style={styles.rowActions}>
              <TouchableOpacity onPress={() => openEdit(group)} hitSlop={8}>
                <Ionicons name="pencil-outline" size={18} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(group)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <TouchableOpacity style={[styles.fab, { backgroundColor: isDark ? 'transparent' : colors.accent }]} onPress={openCreate}>
        <Ionicons name="add" size={28} color={isDark ? colors.accentNeon : '#fff'} />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCancel}>Abbrechen</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingId ? 'Gruppe bearbeiten' : 'Neue Gruppe'}</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={styles.modalSave}>Speichern</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="Gruppenname"
                placeholderTextColor={colors.placeholder}
                autoFocus={!editingId}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Farbe</Text>
              <View style={styles.colorGrid}>
                {PRESET_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[styles.colorSwatch, { backgroundColor: color }, form.color === color && styles.colorSwatchSelected]}
                    onPress={() => setForm((f) => ({ ...f, color }))}
                  >
                    {form.color === color ? (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.previewCard, { borderLeftColor: form.color }]}>
              <View style={[styles.previewDot, { backgroundColor: form.color }]} />
              <Text style={[styles.previewName, { color: form.color }]}>
                {form.name || 'Vorschau'}
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Schlüsselwörter</Text>
              <Text style={styles.fieldHint}>
                Kommagetrennt. Diese Wörter werden beim automatischen Gruppieren erkannt.
              </Text>
              <TextInput
                style={[styles.fieldInput, styles.keywordInput]}
                value={form.keywords}
                onChangeText={(v) => setForm((f) => ({ ...f, keywords: v }))}
                placeholder="meeting, projekt, deadline, …"
                placeholderTextColor={colors.placeholder}
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    list: { padding: 16, gap: 10, paddingBottom: 100 },
    groupRow: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderRadius: 12,
      overflow: 'hidden',
      alignItems: 'stretch',
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    colorStripe: { width: 4 },
    groupInfo: { flex: 1, padding: 14, gap: 6 },
    groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    groupName: { fontSize: 16, fontWeight: '600', color: c.text },
    countBadge: {
      backgroundColor: c.surfaceHigh,
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 1,
    },
    countText: { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
    keywordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    kwBadge: {
      backgroundColor: c.surfaceHigh,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    kwText: { fontSize: 11, color: c.textSecondary },
    kwMore: { fontSize: 11, color: c.textMuted },
    noKeywords: { fontSize: 12, color: c.textMuted, fontStyle: 'italic' },
    rowActions: {
      flexDirection: 'column',
      justifyContent: 'space-around',
      paddingHorizontal: 14,
      gap: 12,
    },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 80,
      gap: 8,
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
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: isDark ? 1.5 : 0,
      borderColor: isDark ? c.accentNeon : 'transparent',
      ...(isDark ? neonGlow(c.accentNeon, 'hard') : {
        shadowColor: c.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
      }),
    },
    modal: { flex: 1, backgroundColor: c.background },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: c.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    modalCancel: { fontSize: 16, color: c.textSecondary },
    modalTitle: { fontSize: 17, fontWeight: '600', color: c.text },
    modalSave: { fontSize: 16, fontWeight: '600', color: c.accent },
    modalContent: { flex: 1 },
    modalScrollContent: { padding: 16, gap: 16, paddingBottom: 60 },
    field: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      gap: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    fieldHint: { fontSize: 13, color: c.textSecondary },
    fieldInput: {
      fontSize: 15,
      color: c.text,
      backgroundColor: c.surfaceHigh,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    keywordInput: { minHeight: 70, textAlignVertical: 'top' },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    colorSwatch: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorSwatchSelected: {
      borderWidth: 3,
      borderColor: '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
    previewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      gap: 8,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: c.border,
    },
    previewDot: { width: 10, height: 10, borderRadius: 5 },
    previewName: { fontSize: 16, fontWeight: '600' },
  });
}
