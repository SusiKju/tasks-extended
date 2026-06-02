import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, RefreshControl, Modal, Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/utils/theme';
import {
  ChildId, CHILDREN, CHILD_NAMES, ChildTask,
  subscribeToChildTasks, addTask, updateTask, deleteTask,
  getReminderTimes, setReminderTimes,
} from '../../src/services/kinderTasks';
import { sendReminderToAllChildren, sendReminderToChild } from '../../src/services/pushNotifications';
import { format } from 'date-fns';

const TODAY = format(new Date(), 'yyyy-MM-dd');

export default function KinderScreen() {
  const { colors } = useTheme();
  const s = styles(colors);

  const [selectedChild, setSelectedChild] = useState<ChildId>('lenny');
  const [tasksByChild, setTasksByChild] = useState<Record<ChildId, ChildTask[]>>({
    lenny: [], emil: [], hannes: [], liddy: [],
  });
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [reminderTimes, setReminderTimesState] = useState<string[]>(['15:00', '17:00']);
  const [editingTimes, setEditingTimes] = useState(false);
  const [timesInput, setTimesInput] = useState('15:00, 17:00');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [setupModalVisible, setSetupModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<{ id: string; title: string } | null>(null);

  // Firestore-Listener für alle Kinder
  useEffect(() => {
    const unsubs = CHILDREN.map((childId) =>
      subscribeToChildTasks(childId, TODAY, (tasks) => {
        setTasksByChild((prev) => ({ ...prev, [childId]: tasks }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    getReminderTimes().then((times) => {
      setReminderTimesState(times);
      setTimesInput(times.join(', '));
    });
  }, []);

  const handleAddTask = useCallback(async () => {
    if (!newTaskTitle.trim()) return;
    await addTask(selectedChild, {
      title: newTaskTitle.trim(),
      done: false,
      date: TODAY,
      createdAt: new Date().toISOString(),
    });
    setNewTaskTitle('');
  }, [selectedChild, newTaskTitle]);

  const handleDeleteTask = useCallback((taskId: string) => {
    Alert.alert('Aufgabe löschen?', '', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive', onPress: async () => {
          try {
            await deleteTask(selectedChild, taskId);
          } catch (e: any) {
            Alert.alert('Fehler beim Löschen', e?.message ?? String(e));
          }
        }
      },
    ]);
  }, [selectedChild]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingTask || !editingTask.title.trim()) return;
    await updateTask(selectedChild, editingTask.id, { title: editingTask.title.trim() });
    setEditingTask(null);
  }, [selectedChild, editingTask]);

  const handleSaveTimes = useCallback(async () => {
    const times = timesInput.split(',').map((t) => t.trim()).filter(Boolean);
    await setReminderTimes(times);
    setReminderTimesState(times);
    setEditingTimes(false);
  }, [timesInput]);

  const handleSendNow = useCallback(async () => {
    setSending(true);
    try {
      await sendReminderToAllChildren();
      Alert.alert('✓ Push gesendet', 'Alle Kinder wurden benachrichtigt.');
    } catch {
      Alert.alert('Fehler', 'Push konnte nicht gesendet werden.');
    } finally {
      setSending(false);
    }
  }, []);

  const tasks = tasksByChild[selectedChild];
  const done = tasks.filter((t) => t.done).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(false)} />}
    >
      {/* Kind-Auswahl */}
      <View style={s.childRow}>
        {CHILDREN.map((childId) => {
          const childTasks = tasksByChild[childId];
          const childDone = childTasks.filter((t) => t.done).length;
          const isSelected = childId === selectedChild;
          return (
            <TouchableOpacity
              key={childId}
              style={[s.childChip, isSelected && { backgroundColor: colors.accentNeon }]}
              onPress={() => setSelectedChild(childId)}
            >
              <Text style={[s.childName, isSelected && { color: '#000' }]}>
                {CHILD_NAMES[childId]}
              </Text>
              <Text style={[s.childProgress, isSelected && { color: '#000' }]}>
                {childDone}/{childTasks.length}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Neue Aufgabe */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Aufgabe für {CHILD_NAMES[selectedChild]} hinzufügen</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Neue Aufgabe..."
            placeholderTextColor={colors.placeholder}
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
            onSubmitEditing={handleAddTask}
            returnKeyType="done"
          />
          <TouchableOpacity style={s.addBtn} onPress={handleAddTask}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Aufgabenliste + Status */}
      <View style={s.section}>
        <View style={s.row}>
          <Text style={s.sectionTitle}>
            Heute — {done}/{tasks.length} erledigt
          </Text>
          <TouchableOpacity
            style={s.pushChildBtn}
            onPress={async () => {
              try {
                await sendReminderToChild(selectedChild);
                Alert.alert('✓ Push gesendet', `${CHILD_NAMES[selectedChild]} wurde benachrichtigt.`);
              } catch (e: any) {
                Alert.alert('Fehler', e?.message ?? 'Push fehlgeschlagen.');
              }
            }}
          >
            <Ionicons name="notifications-outline" size={14} color={colors.accentNeon} />
            <Text style={s.pushChildBtnText}>Push</Text>
          </TouchableOpacity>
        </View>
        {tasks.length === 0 && (
          <Text style={s.empty}>Noch keine Aufgaben für heute.</Text>
        )}
        {tasks.map((task) => (
          <View key={task.id} style={s.taskRow}>
            <Ionicons
              name={task.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={task.done ? colors.success : colors.textMuted}
            />
            <Text style={[s.taskTitle, task.done && s.taskDone]}>{task.title}</Text>
            <TouchableOpacity onPress={() => setEditingTask({ id: task.id, title: task.title })}>
              <Ionicons name="pencil-outline" size={18} color={colors.accentNeon} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteTask(task.id)}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Erinnerungszeiten */}
      <View style={s.section}>
        <View style={s.row}>
          <Text style={s.sectionTitle}>Erinnerungszeiten</Text>
          <TouchableOpacity onPress={() => setEditingTimes(!editingTimes)}>
            <Ionicons name="pencil-outline" size={18} color={colors.accentNeon} />
          </TouchableOpacity>
        </View>
        {editingTimes ? (
          <>
            <Text style={s.hint}>Kommagetrennt, z.B. "08:00, 15:00, 17:00"</Text>
            <TextInput
              style={s.input}
              value={timesInput}
              onChangeText={setTimesInput}
              placeholderTextColor={colors.placeholder}
            />
            <TouchableOpacity style={s.saveBtn} onPress={handleSaveTimes}>
              <Text style={s.saveBtnText}>Speichern</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={s.timesText}>{reminderTimes.join('  ·  ')}</Text>
        )}
      </View>

      {/* Edit-Modal */}
      <Modal visible={!!editingTask} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={() => setEditingTask(null)}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>Aufgabe bearbeiten</Text>
            <TextInput
              style={s.input}
              value={editingTask?.title ?? ''}
              onChangeText={(t) => setEditingTask((e) => e ? { ...e, title: t } : e)}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveEdit}
              placeholderTextColor={colors.placeholder}
            />
            <TouchableOpacity style={s.saveBtn} onPress={handleSaveEdit}>
              <Text style={s.saveBtnText}>Speichern</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Kinder-Gerät einrichten */}
      <TouchableOpacity style={s.setupBtn} onPress={() => setSetupModalVisible(true)}>
        <Ionicons name="phone-portrait-outline" size={18} color={colors.accentNeon} />
        <Text style={s.setupBtnText}>Dieses Gerät als Kinder-Gerät einrichten</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Setup-Modal: Kind auswählen */}
      <Modal visible={setupModalVisible} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={() => setSetupModalVisible(false)}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>Für wen ist dieses Gerät?</Text>
            <Text style={s.modalHint}>Danach wechselt die App in den Kinder-Modus.</Text>
            {CHILDREN.map((id) => (
              <TouchableOpacity
                key={id}
                style={s.modalChildBtn}
                onPress={async () => {
                  await AsyncStorage.setItem('kinder_child_id', id);
                  setSetupModalVisible(false);
                  Alert.alert(
                    `✓ Gerät für ${CHILD_NAMES[id]} eingerichtet`,
                    'Die App wechselt beim nächsten Start in den Kinder-Modus. Jetzt die App neu starten.'
                  );
                }}
              >
                <Text style={s.modalChildBtnText}>{CHILD_NAMES[id]}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Push jetzt senden */}
      <TouchableOpacity style={s.pushBtn} onPress={handleSendNow} disabled={sending}>
        {sending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="notifications-outline" size={20} color="#fff" />
            <Text style={s.pushBtnText}>Jetzt Push senden</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    container: { padding: 16, gap: 8, paddingBottom: 40 },
    childRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    childChip: {
      flex: 1, alignItems: 'center', paddingVertical: 10,
      borderRadius: 12, backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border,
    },
    childName: { fontSize: 14, fontWeight: '700', color: colors.text },
    childProgress: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    section: {
      backgroundColor: colors.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: colors.border, gap: 8,
    },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
    inputRow: { flexDirection: 'row', gap: 8 },
    input: {
      flex: 1, backgroundColor: colors.inputBackground, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, color: colors.text,
      borderWidth: 1, borderColor: colors.border, fontSize: 14,
    },
    addBtn: {
      backgroundColor: colors.accentNeon, borderRadius: 10,
      paddingHorizontal: 14, justifyContent: 'center',
    },
    taskRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6,
    },
    taskTitle: { flex: 1, fontSize: 14, color: colors.text },
    taskDone: { textDecorationLine: 'line-through', color: colors.textMuted },
    empty: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    hint: { fontSize: 12, color: colors.textMuted },
    timesText: { fontSize: 16, color: colors.accentNeon, fontWeight: '600' },
    saveBtn: {
      backgroundColor: colors.accentNeon, borderRadius: 10,
      paddingVertical: 10, alignItems: 'center',
    },
    saveBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
    pushBtn: {
      flexDirection: 'row', backgroundColor: colors.accent, borderRadius: 14,
      paddingVertical: 14, justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8,
    },
    pushBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    pushChildBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderWidth: 1, borderColor: colors.accentNeon, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 5,
    },
    pushChildBtnText: { fontSize: 12, fontWeight: '700', color: colors.accentNeon },
    setupBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: colors.border, marginTop: 8,
    },
    setupBtnText: { flex: 1, fontSize: 14, color: colors.accentNeon, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalBox: { backgroundColor: colors.surface, borderRadius: 20, padding: 24, width: 300, gap: 10 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
    modalHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: 4 },
    modalChildBtn: {
      backgroundColor: colors.inputBackground, borderRadius: 12,
      paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
    },
    modalChildBtnText: { fontSize: 18, fontWeight: '700', color: colors.text },
  });
