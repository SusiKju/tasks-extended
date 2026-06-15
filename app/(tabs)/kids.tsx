import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/utils/theme';
import { useStore } from '../../src/store';
import {
  ChildTask,
  ActivityEntry, ActivityAction,
  ChildReward, RewardType, REWARD_TYPES,
  subscribeToChildTasks, addTask, updateTask, deleteTask, deleteCompletedTasks, rejectTask,
  releaseTaskReward,
  getReminderTimes, setReminderTimes, getActivityLog,
} from '../../src/services/kinderTasks';
import { useFamily } from '../../src/hooks/useFamily';
import { sendHtmlMail } from '../../src/services/googleMail';
import { sendReminderToAllChildren, sendReminderToChild } from '../../src/services/pushNotifications';
import { writePushTrigger, writePushTriggerAll } from '../../src/services/kinderTasks';
import uuid from 'react-native-uuid';
import { format } from 'date-fns';

const TODAY = format(new Date(), 'yyyy-MM-dd');

type ThemeColors = ReturnType<typeof useTheme>['colors'];

/** Darstellung je Aktivitäts-Typ im Verlauf (Icon, Label, Farbe). */
const ACTIVITY_UI: Record<ActivityAction, {
  icon: string;
  label: string;
  color: (c: ThemeColors) => string;
}> = {
  created:   { icon: 'add-circle',         label: 'Erstellt',   color: (c) => c.accentNeon },
  completed: { icon: 'checkmark-circle',   label: 'Abgehakt',   color: (c) => c.success },
  reopened:  { icon: 'arrow-undo-circle',  label: 'Reaktiviert', color: (c) => c.textMuted },
  edited:    { icon: 'create',             label: 'Bearbeitet', color: (c) => c.accentNeon },
  deleted:   { icon: 'trash',              label: 'Gelöscht',   color: (c) => c.danger },
};

export default function KinderScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const router = useRouter();

  const { familyId, children: familyChildren } = useFamily();
  const fid = familyId ?? '';
  // Lookup-Helfer für dynamische Kinder-Daten
  const childName = (id: string) => familyChildren.find((c) => c.id === id)?.name ?? id;
  const childShort = (id: string) => {
    const name = childName(id);
    return name.slice(0, 2);
  };

  const { settings } = useStore();
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [tasksByChild, setTasksByChild] = useState<Record<string, ChildTask[]>>({});
  const [newTaskTitle, setNewTaskTitle] = useState('');
  // Gruppenaufgabe (TE-111): dieselbe Aufgabe an mehrere ausgewählte Kinder.
  const [groupMode, setGroupMode] = useState(false);
  const [groupSelection, setGroupSelection] = useState<Record<string, boolean>>({});
  const [mailingChild, setMailingChild] = useState<string | null>(null);
  const [sendingAllMail, setSendingAllMail] = useState(false);
  const [reminderTimes, setReminderTimesState] = useState<string[]>(['15:00', '17:00']);
  const [editingTimes, setEditingTimes] = useState(false);
  const [timesInput, setTimesInput] = useState('15:00, 17:00');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [setupModalVisible, setSetupModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<{ id: string; title: string } | null>(null);
  const [historyChild, setHistoryChild] = useState<string | null>(null);
  const [history, setHistory] = useState<ActivityEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Belohnung pro Aufgabe (TE-61): Entwurf für die nächste neue Aufgabe.
  // Default immer "keine" (null) — wird nach jedem Anlegen wieder zurückgesetzt.
  const [draftReward, setDraftReward] = useState<ChildReward | null>(null);
  const [draftRewardTitle, setDraftRewardTitle] = useState('');

  // Erstes Kind als Standard auswählen sobald Kinder geladen sind
  useEffect(() => {
    if (familyChildren.length > 0 && !selectedChild) {
      setSelectedChild(familyChildren[0].id);
    }
  }, [familyChildren, selectedChild]);

  // Firestore-Listener für alle Kinder
  useEffect(() => {
    if (!fid || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToChildTasks(fid, child.id, TODAY, (tasks) => {
        setTasksByChild((prev) => ({ ...prev, [child.id]: tasks }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [fid, familyChildren]);

  useEffect(() => {
    if (!fid) return;
    getReminderTimes(fid).then((times) => {
      setReminderTimesState(times);
      setTimesInput(times.join(', '));
    });
  }, [fid]);

  // Aus dem Reward-Entwurf eine speicherbare Belohnung bauen (Detail optional).
  // null = keine Belohnung. Kein undefined-Feld (TE-40: Firebase 11 hängt sonst).
  const buildDraftReward = useCallback((): ChildReward | null => {
    if (!draftReward) return null;
    const title = draftRewardTitle.trim();
    return title ? { type: draftReward.type, title } : { type: draftReward.type };
  }, [draftReward, draftRewardTitle]);

  const resetDraftReward = useCallback(() => {
    setDraftReward(null);
    setDraftRewardTitle('');
  }, []);

  const handleAddTask = useCallback(async () => {
    if (!newTaskTitle.trim() || !fid || !selectedChild) return;
    const title = newTaskTitle.trim();
    const reward = buildDraftReward();
    await addTask(fid, selectedChild, {
      title,
      done: false,
      date: TODAY,
      createdAt: new Date().toISOString(),
      ...(reward ? { reward } : {}),
    });
    setNewTaskTitle('');
    resetDraftReward();
  }, [fid, selectedChild, newTaskTitle, buildDraftReward, resetDraftReward]);

  const toggleGroupChild = useCallback((childId: string) => {
    setGroupSelection((prev) => ({ ...prev, [childId]: !prev[childId] }));
  }, []);

  // Gruppenaufgabe an alle ausgewählten Kinder verteilen — eine gemeinsame groupId,
  // aber je Kind eine eigenständige Kopie (eigener Status, eigene Belohnungslogik). (TE-111)
  const handleAddGroupTask = useCallback(async () => {
    const title = newTaskTitle.trim();
    if (!title || !fid) return;
    const targets = familyChildren.filter((c) => groupSelection[c.id]).map((c) => c.id);
    if (targets.length === 0) {
      crossInfo('Keine Kinder gewählt', 'Bitte mindestens ein Kind für die Gruppenaufgabe auswählen.');
      return;
    }
    const groupId = uuid.v4() as string;
    const reward = buildDraftReward();
    try {
      await Promise.all(
        targets.map((id) =>
          addTask(fid, id, {
            title,
            done: false,
            date: TODAY,
            createdAt: new Date().toISOString(),
            groupId,
            groupChildren: targets,
            ...(reward ? { reward } : {}),
          })
        )
      );
      setNewTaskTitle('');
      resetDraftReward();
    } catch (e: any) {
      crossInfo('Fehler', e?.message ?? 'Gruppenaufgabe konnte nicht angelegt werden.');
    }
  }, [fid, familyChildren, newTaskTitle, groupSelection, buildDraftReward, resetDraftReward]);

  // Baut die HTML-Mail + verschickt Push & E-Mail für genau ein Kind.
  // Wird sowohl vom Einzel-Button als auch vom "Push & Mail an alle"-Button genutzt (TE-118).
  // Gibt zurück, ob tatsächlich gesendet wurde ('sent'), das Kind keine E-Mail/Token hat
  // ('skipped') oder ein Fehler auftrat ('error').
  const sendTaskMailToChild = useCallback(async (childId: string): Promise<'sent' | 'skipped' | 'error'> => {
    const email = (settings.childEmails ?? {})[childId];
    if (!email || !settings.googleAccessToken || !fid) return 'skipped';

    try {
      // Firestore-Push (App offen)
      const name = childName(childId);
      await writePushTrigger(fid, childId, name);
      if (Platform.OS !== 'web') {
        await sendReminderToChild(fid, childId, name).catch(() => {});
      }

      const openTasks = (tasksByChild[childId] ?? []).filter((t) => !t.done);
      const doneTasks = (tasksByChild[childId] ?? []).filter((t) => t.done);
      // family mitgeben, damit der Link self-contained ist: index.tsx persistiert
      // child + family, KindScreen kann die Aufgaben sofort laden (TE-46).
      const appUrl = `https://susikju.github.io/tasks-extended/?child=${childId}&family=${fid}`;

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
          ? 'Du hast alles erledigt! 🎉'
          : `Du hast noch <strong>${openTasks.length} Aufgabe${openTasks.length !== 1 ? 'n' : ''}</strong> offen`}
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
        <p style="text-align:center;color:#aaa;font-size:15px;padding:20px 0">Aktuell keine Aufgaben.</p>` : ''}
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
          ? `📋 ${openTasks.length} Aufgabe${openTasks.length !== 1 ? 'n' : ''} offen, ${name}!`
          : `🎉 Alles erledigt, ${name}!`,
        html
      );
      return 'sent';
    } catch (e: any) {
      return 'error';
    }
  }, [fid, settings, tasksByChild, familyChildren]);

  const handlePushMail = useCallback(async (childId: string) => {
    const email = (settings.childEmails ?? {})[childId];
    if (!email || !settings.googleAccessToken) {
      crossInfo('E-Mail nicht konfiguriert', 'Bitte E-Mail-Adresse in den Einstellungen eintragen und Google-Konto verbinden.');
      return;
    }
    setMailingChild(childId);
    try {
      const result = await sendTaskMailToChild(childId);
      if (result === 'sent') {
        crossInfo('✓ Gesendet', `Push + E-Mail an ${childName(childId)} verschickt.`);
      } else {
        crossInfo('Fehler', 'Konnte nicht senden.');
      }
    } finally {
      setMailingChild(null);
    }
  }, [settings, sendTaskMailToChild]);

  // "Push & Mail an alle" (TE-118): schickt Push + personalisierte Aufgaben-Mail
  // an jedes Kind mit hinterlegter E-Mail-Adresse, eines nach dem anderen.
  const handleSendAllMail = useCallback(async () => {
    setSendingAllMail(true);
    try {
      let sent = 0, skipped = 0, failed = 0;
      for (const child of familyChildren) {
        const result = await sendTaskMailToChild(child.id);
        if (result === 'sent') sent++;
        else if (result === 'skipped') skipped++;
        else failed++;
      }
      const parts = [`${sent} verschickt`];
      if (skipped > 0) parts.push(`${skipped} ohne E-Mail-Adresse übersprungen`);
      if (failed > 0) parts.push(`${failed} fehlgeschlagen`);
      crossInfo('✓ Push & Mail an alle', parts.join(' · '));
    } finally {
      setSendingAllMail(false);
    }
  }, [familyChildren, sendTaskMailToChild]);

  const handleDeleteTask = useCallback((taskId: string, title: string) => {
    crossAlert('Aufgabe löschen?', '', async () => {
      try {
        await deleteTask(fid, selectedChild, taskId, { actor: 'parent', title });
      } catch (e: any) {
        crossInfo('Fehler beim Löschen', e?.message ?? String(e));
      }
    }, true);
  }, [fid, selectedChild]);

  const handleRejectTask = useCallback((taskId: string, title: string) => {
    crossAlert(
      'Aufgabe ablehnen?',
      'Sie wird wieder auf „offen" gesetzt und beim Kind rot angezeigt.',
      async () => {
        try {
          await rejectTask(fid, selectedChild, taskId, { title });
        } catch (e: any) {
          crossInfo('Fehler', e?.message ?? String(e));
        }
      }
    );
  }, [fid, selectedChild]);

  const handleDeleteCompleted = useCallback(() => {
    const childTaskList = tasksByChild[selectedChild] ?? [];
    const count = childTaskList.filter((t) => t.done).length;
    crossAlert(
      `${count} erledigte Aufgabe${count !== 1 ? 'n' : ''} löschen?`,
      'Diese Aufgaben werden dauerhaft entfernt.',
      async () => {
        try {
          await deleteCompletedTasks(fid, selectedChild, childTaskList);
        } catch (e: any) {
          crossInfo('Fehler beim Löschen', e?.message ?? String(e));
        }
      },
      true
    );
  }, [fid, selectedChild, tasksByChild]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingTask || !editingTask.title.trim()) return;
    const title = editingTask.title.trim();
    await updateTask(fid, selectedChild, editingTask.id, { title }, { actor: 'parent', title });
    setEditingTask(null);
  }, [fid, selectedChild, editingTask]);

  // Belohnung einer abgehakten Aufgabe freigeben/zurückziehen (TE-61).
  const handleToggleRewardRelease = useCallback(async (childId: string, task: ChildTask) => {
    try {
      await releaseTaskReward(fid, childId, task.id, !task.rewardReleased);
    } catch (e: any) {
      crossInfo('Fehler', e?.message ?? 'Belohnung konnte nicht freigegeben werden.');
    }
  }, [fid]);

  const handleOpenHistory = useCallback(async (childId: string) => {
    setHistoryChild(childId);
    setHistoryLoading(true);
    setHistory([]);
    try {
      const items = await getActivityLog(fid, childId);
      setHistory(items);
    } catch (e: any) {
      crossInfo('Fehler', e?.message ?? 'Verlauf konnte nicht geladen werden.');
    } finally {
      setHistoryLoading(false);
    }
  }, [fid]);

  const handleSaveTimes = useCallback(async () => {
    const times = timesInput.split(',').map((t) => t.trim()).filter(Boolean);
    await setReminderTimes(fid, times);
    setReminderTimesState(times);
    setEditingTimes(false);
  }, [fid, timesInput]);

  const handleSendNow = useCallback(async () => {
    setSending(true);
    try {
      // Web: Firestore-Trigger (App muss offen sein)
      // Native: Expo Push Service (echter Hintergrund-Push)
      await writePushTriggerAll(fid, familyChildren);
      if (Platform.OS !== 'web') {
        await sendReminderToAllChildren(fid, familyChildren).catch(() => {});
      }
      crossInfo('✓ Push gesendet', 'Alle Kinder wurden benachrichtigt.');
    } catch (e: any) {
      crossInfo('Fehler', e?.message ?? 'Push konnte nicht gesendet werden.');
    } finally {
      setSending(false);
    }
  }, [fid, familyChildren]);

  const tasks = tasksByChild[selectedChild] ?? [];
  const done = tasks.filter((t) => t.done).length;

  // Teilnehmer-Kürzel einer Gruppenaufgabe (TE-113/TE-114): bevorzugt die auf der
  // Aufgabe gespeicherte Teilnehmerliste; Fallback (Alt-Aufgaben ohne groupChildren)
  // ist die Ableitung aus der gemeinsamen groupId über die heutigen Aufgaben.
  // Fälligkeitsanzeige (TE-117): "TT.MM." statt überfällig versteckter Aufgaben.
  const dueLabel = (task: ChildTask): string | null => {
    if (task.done || task.date === TODAY) return null;
    const [, m, d] = task.date.split('-');
    return `fällig ${d}.${m}.`;
  };

  const groupShorts = (task: ChildTask): string[] => {
    const allIds = familyChildren.map((c) => c.id);
    const ids = task.groupChildren?.length
      ? allIds.filter((id) => task.groupChildren!.includes(id))
      : allIds.filter((id) => (tasksByChild[id] ?? []).some((t) => t.groupId === task.groupId));
    return ids.map((id) => childShort(id));
  };

  // Gruppen-Modus (TE-56): alle heutigen Gruppenaufgaben über alle Kinder hinweg
  // nach groupId aggregieren. Pro Eintrag Titel + Teilnehmer mit Done-Status und
  // der jeweiligen taskId (fürs Löschen über alle Kinder hinweg).
  const groupTasks = useMemo(() => {
    const map = new Map<string, {
      groupId: string;
      title: string;
      reward: ChildReward | null;
      members: { childId: string; taskId: string; done: boolean; rewardReleased: boolean }[];
    }>();
    for (const child of familyChildren) {
      for (const t of tasksByChild[child.id] ?? []) {
        if (!t.groupId) continue;
        const entry = map.get(t.groupId)
          ?? { groupId: t.groupId, title: t.title, reward: t.reward ?? null, members: [] };
        entry.members.push({ childId: child.id, taskId: t.id, done: t.done, rewardReleased: !!t.rewardReleased });
        map.set(t.groupId, entry);
      }
    }
    return [...map.values()];
  }, [familyChildren, tasksByChild]);

  // Gruppenaufgabe bei allen Teilnehmern löschen (TE-56).
  const handleDeleteGroupTask = useCallback((entry: { title: string; members: { childId: string; taskId: string }[] }) => {
    crossAlert('Gruppenaufgabe löschen?', 'Wird bei allen beteiligten Kindern entfernt.', async () => {
      try {
        await Promise.all(
          entry.members.map((m) => deleteTask(fid, m.childId, m.taskId, { actor: 'parent', title: entry.title }))
        );
      } catch (e: any) {
        crossInfo('Fehler beim Löschen', e?.message ?? String(e));
      }
    }, true);
  }, [fid]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(false)} />}
    >
      {/* Modus-Umschalter ganz oben (TE-56): steuert die gesamte Seite —
          Einzelne = Aufgaben pro Kind, Gruppe = Gruppenaufgaben für mehrere Kinder. */}
      <View style={s.topToggle}>
        <TouchableOpacity
          style={[s.topToggleBtn, !groupMode && s.topToggleBtnActive]}
          onPress={() => setGroupMode(false)}
        >
          <Ionicons name="person" size={16} color={!groupMode ? '#000' : colors.textMuted} />
          <Text style={[s.topToggleText, !groupMode && s.topToggleTextActive]}>Einzelne</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.topToggleBtn, groupMode && s.topToggleBtnActive]}
          onPress={() => setGroupMode(true)}
        >
          <Ionicons name="people" size={16} color={groupMode ? '#000' : colors.textMuted} />
          <Text style={[s.topToggleText, groupMode && s.topToggleTextActive]}>Gruppe</Text>
        </TouchableOpacity>
      </View>

      {/* Auswahl: ein Kind (Einzelne) oder Kinder zusammenstellen (Gruppe) */}
      {groupMode ? (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Kinder für die Gruppenaufgabe</Text>
          <View style={s.groupChips}>
            {familyChildren.map((child) => {
              const sel = groupSelection[child.id] ?? false;
              return (
                <TouchableOpacity
                  key={child.id}
                  style={[s.groupChip, sel && { borderColor: colors.accentNeon, backgroundColor: colors.accentNeon }]}
                  onPress={() => toggleGroupChild(child.id)}
                >
                  <Ionicons
                    name={sel ? 'checkmark-circle' : 'ellipse-outline'}
                    size={15}
                    color={sel ? '#000' : colors.textMuted}
                  />
                  <Text style={[s.groupChipText, sel && { color: '#000' }]}>
                    {child.emoji ? `${child.emoji} ` : ''}{child.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={s.childRow}>
          {familyChildren.map((child) => {
            const childTaskList = tasksByChild[child.id] ?? [];
            const childDone = childTaskList.filter((t) => t.done).length;
            const isSelected = child.id === selectedChild;
            return (
              <TouchableOpacity
                key={child.id}
                style={[s.childChip, isSelected && { backgroundColor: colors.accentNeon }]}
                onPress={() => setSelectedChild(child.id)}
              >
                <Text style={[s.childName, isSelected && { color: '#000' }]}>
                  {child.emoji ? `${child.emoji} ` : ''}{child.name}
                </Text>
                <Text style={[s.childProgress, isSelected && { color: '#000' }]}>
                  {childDone}/{childTaskList.length}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Aufgabe hinzufügen — Einzel- oder Gruppenaufgabe (TE-56/TE-111) */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>
          {groupMode
            ? 'Gruppenaufgabe hinzufügen'
            : `Aufgabe für ${childName(selectedChild)} hinzufügen`}
        </Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder={groupMode ? 'Neue Gruppenaufgabe...' : 'Neue Aufgabe...'}
            placeholderTextColor={colors.placeholder}
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
            onSubmitEditing={groupMode ? handleAddGroupTask : handleAddTask}
            returnKeyType="done"
          />
          <TouchableOpacity style={s.addBtn} onPress={groupMode ? handleAddGroupTask : handleAddTask}>
            <Ionicons name="add" size={22} color={colors.accentFg} />
          </TouchableOpacity>
        </View>

        {/* Belohnung für diese Aufgabe (TE-61) — Default "Keine", nach Anlegen zurückgesetzt. */}
        <Text style={s.rewardPickerLabel}>Belohnung (optional)</Text>
        <View style={s.rewardPickerRow}>
          <TouchableOpacity
            style={[s.rewardPickerChip, !draftReward && s.rewardPickerChipActive]}
            onPress={() => setDraftReward(null)}
          >
            <Text style={[s.rewardPickerChipText, !draftReward && s.rewardPickerChipTextActive]}>Keine</Text>
          </TouchableOpacity>
          {(Object.keys(REWARD_TYPES) as RewardType[]).map((type) => {
            const sel = draftReward?.type === type;
            return (
              <TouchableOpacity
                key={type}
                style={[s.rewardPickerChip, sel && s.rewardPickerChipActive]}
                onPress={() => setDraftReward({ type })}
              >
                <Text style={s.rewardPickerEmoji}>{REWARD_TYPES[type].emoji}</Text>
                <Text style={[s.rewardPickerChipText, sel && s.rewardPickerChipTextActive]}>
                  {REWARD_TYPES[type].label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {draftReward && (
          <TextInput
            style={s.input}
            value={draftRewardTitle}
            onChangeText={setDraftRewardTitle}
            placeholder="Detail (optional), z.B. 1 Folge Paw Patrol"
            placeholderTextColor={colors.placeholder}
            returnKeyType="done"
          />
        )}
      </View>

      {/* Inhalt: Gruppenaufgaben-Liste (Gruppe) oder Aufgaben + Belohnung (Einzelne) (TE-56) */}
      {groupMode ? (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Gruppenaufgaben</Text>
          {groupTasks.length === 0 && (
            <Text style={s.empty}>
              Noch keine Gruppenaufgaben. Oben Kinder auswählen und eine Aufgabe hinzufügen.
            </Text>
          )}
          {groupTasks.map((g) => {
            const doneCount = g.members.filter((m) => m.done).length;
            const allDone = doneCount === g.members.length;
            return (
              <View key={g.groupId} style={s.groupTaskCard}>
                <View style={s.row}>
                  <Text style={[s.taskTitle, allDone && s.taskDone]}>{g.title}</Text>
                  <TouchableOpacity onPress={() => handleDeleteGroupTask(g)}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
                {g.reward && (
                  <Text style={s.taskRewardBadge}>
                    {REWARD_TYPES[g.reward.type].emoji} {REWARD_TYPES[g.reward.type].label}
                    {g.reward.title ? ` · ${g.reward.title}` : ''}
                  </Text>
                )}
                <View style={s.groupMemberRow}>
                  {g.members.map((m) => {
                    // Mit Belohnung: ein erledigtes Mitglied ist tippbar → Belohnung freigeben (TE-61).
                    const releasable = !!g.reward && m.done;
                    const Wrapper: any = releasable ? TouchableOpacity : View;
                    return (
                      <Wrapper
                        key={m.childId}
                        style={[s.groupMember, m.rewardReleased && s.groupMemberReleased]}
                        {...(releasable
                          ? { onPress: () => handleToggleRewardRelease(m.childId, { id: m.taskId, rewardReleased: m.rewardReleased } as ChildTask) }
                          : {})}
                      >
                        <Ionicons
                          name={m.rewardReleased ? 'gift' : m.done ? 'checkmark-circle' : 'ellipse-outline'}
                          size={14}
                          color={m.rewardReleased ? '#000' : m.done ? colors.success : colors.textMuted}
                        />
                        <Text style={[
                          s.groupMemberText,
                          m.done && { color: colors.success },
                          m.rewardReleased && { color: '#000' },
                        ]}>
                          {childName(m.childId)}{releasable ? (m.rewardReleased ? ' ✓' : ' · freigeben') : ''}
                        </Text>
                      </Wrapper>
                    );
                  })}
                </View>
                <Text style={s.groupTaskMeta}>{doneCount}/{g.members.length} erledigt</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <>
      {/* Aufgabenliste + Status */}
      <View style={s.section}>
        <View style={s.row}>
          <Text style={s.sectionTitle}>
            Aufgaben — {done}/{tasks.length} erledigt
          </Text>
          <View style={s.headerBtnRow}>
            <TouchableOpacity
              style={s.pushChildBtn}
              onPress={() => handleOpenHistory(selectedChild)}
            >
              <Ionicons name="time-outline" size={14} color={colors.accentNeon} />
              <Text style={s.pushChildBtnText}>Verlauf</Text>
            </TouchableOpacity>
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
        </View>
        {tasks.length === 0 && (
          <Text style={s.empty}>Aktuell keine offenen Aufgaben.</Text>
        )}
        {tasks.map((task) => (
          <View key={task.id} style={s.taskItem}>
            <View style={s.taskRow}>
              {/* Abgehakte Aufgaben sind antippbar → ablehnen (zurücksetzen). (TE-103) */}
              <TouchableOpacity
                onPress={() => task.done && handleRejectTask(task.id, task.title)}
                disabled={!task.done}
              >
                <Ionicons
                  name={task.done ? 'checkmark-circle' : task.rejected ? 'close-circle' : 'ellipse-outline'}
                  size={22}
                  color={task.done ? colors.success : task.rejected ? colors.danger : colors.textMuted}
                />
              </TouchableOpacity>
              <Text style={[s.taskTitle, task.done && s.taskDone, task.rejected && s.taskRejected]}>
                {task.title}
              </Text>
              {task.groupId && (
                <View style={s.groupTag}>
                  <Ionicons name="people" size={11} color={colors.accentNeon} />
                  <Text style={s.groupTagText}>{groupShorts(task).join('·')}</Text>
                </View>
              )}
              {task.rejected && <Text style={s.rejectedTag}>abgelehnt</Text>}
              {dueLabel(task) && <Text style={s.overdueTag}>{dueLabel(task)}</Text>}
              <TouchableOpacity onPress={() => setEditingTask({ id: task.id, title: task.title })}>
                <Ionicons name="pencil-outline" size={18} color={colors.accentNeon} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteTask(task.id, task.title)}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
            {/* Belohnung der Aufgabe + Eltern-Freigabe (TE-61) */}
            {task.reward && (
              <View style={s.taskRewardRow}>
                <Text style={s.taskRewardBadge}>
                  {REWARD_TYPES[task.reward.type].emoji} {REWARD_TYPES[task.reward.type].label}
                  {task.reward.title ? ` · ${task.reward.title}` : ''}
                </Text>
                {task.done ? (
                  <TouchableOpacity
                    style={[s.releaseBtn, task.rewardReleased && s.releaseBtnDone]}
                    onPress={() => handleToggleRewardRelease(selectedChild, task)}
                  >
                    <Ionicons
                      name={task.rewardReleased ? 'checkmark-circle' : 'gift-outline'}
                      size={13}
                      color={task.rewardReleased ? '#000' : colors.accentNeon}
                    />
                    <Text style={[s.releaseBtnText, task.rewardReleased && s.releaseBtnTextDone]}>
                      {task.rewardReleased ? 'freigegeben' : 'Freigeben'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={s.taskRewardPending}>nach Erledigen</Text>
                )}
              </View>
            )}
          </View>
        ))}
        {done > 0 && (
          <View style={{ alignItems: 'flex-end', paddingRight: 16, paddingBottom: 12, marginTop: 12 }}>
            <TouchableOpacity
              style={[s.pushChildBtn, { borderColor: colors.danger }]}
              onPress={handleDeleteCompleted}
            >
              <Ionicons name="trash-outline" size={14} color={colors.danger} />
              <Text style={[s.pushChildBtnText, { color: colors.danger }]}>Erledigt löschen</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

        </>
      )}

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

      {/* History-Modal */}
      <Modal visible={!!historyChild} transparent animationType="slide">
        <Pressable style={s.modalOverlay} onPress={() => setHistoryChild(null)}>
          <Pressable style={s.historyBox} onPress={() => {}}>
            <View style={s.row}>
              <Text style={s.modalTitle}>
                Verlauf{historyChild ? ` — ${childName(historyChild)}` : ''}
              </Text>
              <TouchableOpacity onPress={() => setHistoryChild(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {historyLoading ? (
              <ActivityIndicator color={colors.accentNeon} style={{ marginVertical: 24 }} />
            ) : history.length === 0 ? (
              <Text style={s.empty}>Noch keine Aktivität.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {(() => {
                  let lastDate = '';
                  return history.map((e) => {
                    const day = e.at.slice(0, 10); // "yyyy-MM-dd"
                    const showDate = day !== lastDate;
                    lastDate = day;
                    const [y, m, d] = day.split('-');
                    const time = format(new Date(e.at), 'HH:mm');
                    const ui = ACTIVITY_UI[e.action];
                    return (
                      <View key={e.id}>
                        {showDate && (
                          <Text style={s.historyDate}>{`${d}.${m}.${y}`}</Text>
                        )}
                        <View style={s.historyRow}>
                          <Ionicons name={ui.icon as any} size={18} color={ui.color(colors)} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.historyTitle} numberOfLines={2}>
                              {e.taskTitle || '(ohne Titel)'}
                            </Text>
                            <Text style={s.historyMeta}>
                              {ui.label} · {e.actor === 'child' ? '🧒 Kind' : '👤 Eltern'}
                            </Text>
                          </View>
                          <Text style={s.historyTime}>{time}</Text>
                        </View>
                      </View>
                    );
                  });
                })()}
              </ScrollView>
            )}
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
            {familyChildren.map((child) => (
              <TouchableOpacity
                key={child.id}
                style={s.modalChildBtn}
                onPress={async () => {
                  await AsyncStorage.setItem('kinder_child_id', child.id);
                  await AsyncStorage.setItem('kinder_family_id', fid);
                  setSetupModalVisible(false);
                  // Sofort in den Kinder-Modus wechseln (TE-64) – '/' rendert KindScreen.
                  // Auch nach einem späteren Reload greift der Guard im RootLayout.
                  router.replace('/');
                }}
              >
                <Text style={s.modalChildBtnText}>{child.emoji ? `${child.emoji} ` : ''}{child.name}</Text>
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

      {/* Push & Mail an alle (TE-118) */}
      <TouchableOpacity
        style={[s.pushBtn, { marginTop: 10, backgroundColor: colors.accentNeon }]}
        onPress={handleSendAllMail}
        disabled={sendingAllMail}
      >
        {sendingAllMail ? (
          <ActivityIndicator color="#000" />
        ) : (
          <>
            <Ionicons name="mail-outline" size={20} color="#000" />
            <Text style={[s.pushBtnText, { color: '#000' }]}>Push & Mail an alle</Text>
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
    // Top-Modus-Umschalter (TE-56): Einzelne | Gruppe — steuert die ganze Seite
    topToggle: {
      flexDirection: 'row', gap: 6, marginBottom: 4,
      backgroundColor: colors.surface, borderRadius: 14, padding: 6,
      borderWidth: 1, borderColor: colors.border,
    },
    topToggleBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 11, borderRadius: 10,
    },
    topToggleBtnActive: { backgroundColor: colors.accentNeon },
    topToggleText: { fontSize: 15, fontWeight: '800', color: colors.textMuted },
    topToggleTextActive: { color: '#000' },
    // Gruppenaufgabe (TE-111)
    groupChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    groupChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.inputBackground,
    },
    groupChipText: { fontSize: 13, fontWeight: '600', color: colors.text },
    groupTag: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      borderWidth: 1, borderColor: colors.accentNeon, borderRadius: 6,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    groupTagText: { fontSize: 11, fontWeight: '800', color: colors.accentNeon, letterSpacing: 0.3 },
    // Gruppenaufgaben-Liste im Gruppe-Modus (TE-56)
    groupTaskCard: {
      backgroundColor: colors.inputBackground, borderRadius: 12, padding: 12, gap: 8,
      borderWidth: 1, borderColor: colors.border,
    },
    groupMemberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    groupMember: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3,
    },
    groupMemberReleased: { backgroundColor: colors.accentNeon },
    groupMemberText: { fontSize: 13, color: colors.text },
    groupTaskMeta: { fontSize: 12, color: colors.textMuted },
    // Belohnung pro Aufgabe (TE-61)
    rewardPickerLabel: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
    rewardPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    rewardPickerChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderWidth: 1, borderColor: colors.border, borderRadius: 8,
      paddingHorizontal: 9, paddingVertical: 6, backgroundColor: colors.inputBackground,
    },
    rewardPickerChipActive: { borderColor: colors.accentNeon, backgroundColor: colors.accentNeon },
    rewardPickerEmoji: { fontSize: 14 },
    rewardPickerChipText: { fontSize: 12, fontWeight: '600', color: colors.text },
    rewardPickerChipTextActive: { color: '#000' },
    taskItem: { gap: 2, paddingVertical: 2 },
    taskRewardRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      gap: 8, paddingLeft: 32, paddingBottom: 4,
    },
    taskRewardBadge: { flex: 1, fontSize: 12, color: colors.accentNeon, fontWeight: '600' },
    taskRewardPending: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },
    releaseBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderWidth: 1, borderColor: colors.accentNeon, borderRadius: 8,
      paddingHorizontal: 9, paddingVertical: 4,
    },
    releaseBtnDone: { backgroundColor: colors.accentNeon },
    releaseBtnText: { fontSize: 12, fontWeight: '700', color: colors.accentNeon },
    releaseBtnTextDone: { color: '#000' },
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
    taskRejected: { color: colors.danger, fontWeight: '700' },
    rejectedTag: {
      fontSize: 10, fontWeight: '800', color: colors.dangerFg ?? '#fff',
      backgroundColor: colors.danger, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
      textTransform: 'uppercase', letterSpacing: 0.5, overflow: 'hidden',
    },
    // Fälligkeits-/Überfällig-Hinweis (TE-117): Aufgaben verschwinden nicht mehr
    // durch Tageswechsel, sondern bleiben sichtbar und werden als überfällig markiert.
    overdueTag: {
      fontSize: 10, fontWeight: '800', color: '#fff',
      backgroundColor: '#f59e0b', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
      textTransform: 'uppercase', letterSpacing: 0.3, overflow: 'hidden',
    },
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
    headerBtnRow: { flexDirection: 'row', gap: 8 },
    pushChildBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderWidth: 1, borderColor: colors.accentNeon, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 5,
    },
    pushChildBtnText: { fontSize: 12, fontWeight: '700', color: colors.accentNeon },
    historyBox: {
      backgroundColor: colors.surface, borderRadius: 20, padding: 20,
      width: 340, maxWidth: '92%', gap: 10,
    },
    historyDate: {
      fontSize: 12, fontWeight: '700', color: colors.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4,
    },
    historyRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6,
      borderBottomWidth: 1, borderColor: colors.border,
    },
    historyTitle: { fontSize: 14, color: colors.text },
    historyMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
    historyTime: { fontSize: 13, fontWeight: '600', color: colors.accentNeon },
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
