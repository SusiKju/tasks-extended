import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, RefreshControl, Modal, Pressable, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Alert funktioniert auf Web nicht — window.confirm als Fallback */
function crossAlert(title: string, message: string, onConfirm: () => void, destructive = false) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}${message ? '\n' + message : ''}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: destructive ? 'Löschen' : 'OK', style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }
}

function crossInfo(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/utils/theme';
import { useStore } from '../../src/store';
import {
  ChildId, CHILDREN, CHILD_NAMES, ChildTask,
  subscribeToChildTasks, addTask, updateTask, deleteTask,
  getReminderTimes, setReminderTimes,
} from '../../src/services/kinderTasks';
import { sendHtmlMail } from '../../src/services/googleMail';
import { sendReminderToAllChildren, sendReminderToChild } from '../../src/services/pushNotifications';
import { writePushTrigger, writePushTriggerAll } from '../../src/services/kinderTasks';
import { format } from 'date-fns';

const TODAY = format(new Date(), 'yyyy-MM-dd');

export default function KinderScreen() {
  const { colors } = useTheme();
  const s = styles(colors);

  const { settings } = useStore();
  const [selectedChild, setSelectedChild] = useState<ChildId>('lenny');
  const [tasksByChild, setTasksByChild] = useState<Record<ChildId, ChildTask[]>>({
    lenny: [], emil: [], hannes: [], liddy: [],
  });
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [mailingChild, setMailingChild] = useState<ChildId | null>(null);
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
    const title = newTaskTitle.trim();
    await addTask(selectedChild, {
      title,
      done: false,
      date: TODAY,
      createdAt: new Date().toISOString(),
    });
    setNewTaskTitle('');
  }, [selectedChild, newTaskTitle]);

  const handlePushMail = useCallback(async (childId: ChildId) => {
    const email = (settings.childEmails ?? {})[childId];
    if (!email || !settings.googleAccessToken) {
      crossInfo('E-Mail nicht konfiguriert', 'Bitte E-Mail-Adresse in den Einstellungen eintragen und Google-Konto verbinden.');
      return;
    }
    setMailingChild(childId);
    try {
      // Firestore-Push (App offen)
      await writePushTrigger(childId);
      if (Platform.OS !== 'web') {
        await sendReminderToChild(childId).catch(() => {});
      }

      // Offene Aufgaben für heute
      const openTasks = tasksByChild[childId].filter((t) => !t.done);
      const doneTasks = tasksByChild[childId].filter((t) => t.done);
      const name = CHILD_NAMES[childId];
      const appUrl = `https://susikju.github.io/tasks-extended/kinder?child=${childId}`;

      const taskRows = (tasks: ChildTask[], done: boolean) =>
        tasks.map((t) => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:15px;color:${done ? '#aaa' : '#1a1a2e'};${done ? 'text-decoration:line-through;' : ''}">
              <span style="font-size:18px;margin-right:8px">${done ? '✅' : '⭕'}</span>${t.title}
            </td>
          </tr>`).join('');

      const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(79,134,247,0.12)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f86f7,#6ea3ff);padding:32px 28px;text-align:center">
      <div style="font-size:48px;margin-bottom:8px">📋</div>
      <h1 style="margin:0;color:white;font-size:22px;font-weight:800">Hey ${name}! 👋</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px">
        ${openTasks.length === 0
          ? 'Du hast heute alles erledigt! 🎉'
          : `Du hast noch <strong>${openTasks.length} Aufgabe${openTasks.length !== 1 ? 'n' : ''}</strong> für heute`}
      </p>
    </div>

    <!-- Aufgabenliste -->
    <div style="padding:20px 16px">
      ${openTasks.length > 0 ? `
        <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px">Noch offen</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid #eee">
          ${taskRows(openTasks, false)}
        </table>` : ''}

      ${doneTasks.length > 0 ? `
        <p style="margin:${openTasks.length > 0 ? '20px' : '0'} 0 12px;font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px">Schon geschafft 🏆</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid #eee">
          ${taskRows(doneTasks, true)}
        </table>` : ''}

      ${openTasks.length === 0 && doneTasks.length === 0 ? `
        <p style="text-align:center;color:#aaa;font-size:15px;padding:20px 0">Noch keine Aufgaben für heute.</p>` : ''}
    </div>

    <!-- CTA Button -->
    <div style="padding:8px 28px 32px;text-align:center">
      <a href="${appUrl}" style="display:inline-block;background:#4f86f7;color:white;text-decoration:none;border-radius:14px;padding:14px 32px;font-size:16px;font-weight:700">
        Aufgaben ansehen →
      </a>
    </div>

    <!-- Footer -->
    <div style="background:#f8f9ff;padding:16px 28px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:12px;color:#aaa">Gesendet von Papa ❤️</p>
    </div>
  </div>
</body>
</html>`;

      await sendHtmlMail(
        settings.googleAccessToken,
        email,
        openTasks.length > 0
          ? `📋 ${openTasks.length} Aufgabe${openTasks.length !== 1 ? 'n' : ''} für heute, ${name}!`
          : `🎉 Alles erledigt, ${name}!`,
        html
      );

      crossInfo('✓ Gesendet', `Push + E-Mail an ${name} verschickt.`);
    } catch (e: any) {
      crossInfo('Fehler', e?.message ?? 'Konnte nicht senden.');
    } finally {
      setMailingChild(null);
    }
  }, [settings, tasksByChild]);

  const handleDeleteTask = useCallback((taskId: string) => {
    crossAlert('Aufgabe löschen?', '', async () => {
      try {
        await deleteTask(selectedChild, taskId);
      } catch (e: any) {
        crossInfo('Fehler beim Löschen', e?.message ?? String(e));
      }
    }, true);
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
      // Web: Firestore-Trigger (App muss offen sein)
      // Native: Expo Push Service (echter Hintergrund-Push)
      await writePushTriggerAll();
      if (Platform.OS !== 'web') {
        await sendReminderToAllChildren().catch(() => {});
      }
      crossInfo('✓ Push gesendet', 'Alle Kinder wurden benachrichtigt.');
    } catch (e: any) {
      crossInfo('Fehler', e?.message ?? 'Push konnte nicht gesendet werden.');
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
            <Ionicons name="add" size={22} color={colors.accentFg} />
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
            onPress={() => handlePushMail(selectedChild)}
            disabled={mailingChild === selectedChild}
          >
            {mailingChild === selectedChild
              ? <ActivityIndicator size="small" color={colors.accentNeon} />
              : <>
                  <Ionicons name="mail-outline" size={14} color={colors.accentNeon} />
                  <Text style={s.pushChildBtnText}>Push & Mail</Text>
                </>
            }
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
                  crossInfo(
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
          <ActivityIndicator color={colors.accentFg} />
        ) : (
          <>
            <Ionicons name="notifications-outline" size={20} color={colors.accentFg} />
            <Text style={s.pushBtnText}>App-Push an alle (nur wenn App offen)</Text>
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
    emailToggle: {
      flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4,
    },
    emailToggleText: { fontSize: 13, color: colors.textMuted },
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
    pushBtnText: { color: colors.accentFg, fontWeight: '700', fontSize: 15 },
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
