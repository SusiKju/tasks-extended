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
  getActivityLog,
  getEmailReminderConfig, setEmailReminderConfig,
} from '../../src/services/kinderTasks';
import { useFamily } from '../../src/hooks/useFamily';
import {
  AllowanceMonth, subscribeToAllowanceMonths, monthKey, setAllowanceReceived,
  formatEuro, formatMonthLabel, nextAllowanceMonth, effectiveAllowance,
} from '../../src/services/allowance';
import { sendTaskMailToChild as sendTaskMailCore } from '../../src/services/taskMail';
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
  // Taschengeld-Verlauf pro Kind, echtzeit-synchron mit der Kinder-App (TE-72).
  const [allowanceByChild, setAllowanceByChild] = useState<Record<string, Record<string, AllowanceMonth>>>({});
  const [newTaskTitle, setNewTaskTitle] = useState('');
  // Modus-Umschalter (TE-93): Einzelne | Gruppe | Extras. groupMode wird daraus
  // abgeleitet, damit der bestehende Code unverändert auf groupMode zugreifen kann.
  const [mode, setMode] = useState<'single' | 'group' | 'extras'>('single');
  const groupMode = mode === 'group';
  const [groupSelection, setGroupSelection] = useState<Record<string, boolean>>({});
  const [mailingChild, setMailingChild] = useState<string | null>(null);
  const [sendingAllMail, setSendingAllMail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [setupModalVisible, setSetupModalVisible] = useState(false);
  // Bearbeiten inkl. Belohnung (TE-63). rewardType=null → keine Belohnung.
  // groupId merken, damit Änderungen an Gruppenaufgaben auf alle Kopien wirken.
  const [editingTask, setEditingTask] = useState<{
    id: string;
    title: string;
    groupId?: string | null;
    rewardType: RewardType | null;
    rewardDetail: string;
  } | null>(null);
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

  // Taschengeld-Verlauf jedes Kindes live mitlesen (TE-72). Gleiche onSnapshot-
  // Quelle wie die Kinder-App, daher kein veralteter Cache: hakt das Kind ab,
  // ist der Bestätigungs-Timestamp hier sofort sichtbar.
  useEffect(() => {
    if (!fid || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToAllowanceMonths(fid, child.id, (months) => {
        setAllowanceByChild((prev) => ({ ...prev, [child.id]: months }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [fid, familyChildren]);

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

  // Verschickt Push & E-Mail für genau ein Kind (HTML-Aufbau + Versand lebt in
  // taskMail.ts, damit der automatische Versand ihn auch ohne gemountete
  // Kinder-Tab nutzen kann, TE-163). Wird sowohl vom Einzel-Button als auch
  // vom "Mail Push für alle"-Button genutzt (TE-118).
  // Gibt zurück, ob tatsächlich gesendet wurde ('sent'), das Kind keine E-Mail/Token hat
  // ('skipped') oder ein Fehler auftrat ('error').
  const sendTaskMailToChild = useCallback(async (childId: string): Promise<'sent' | 'skipped' | 'error'> => {
    const email = (settings.childEmails ?? {})[childId];
    if (!email || !settings.googleAccessToken || !fid) return 'skipped';

    const name = childName(childId);
    const openTasks = (tasksByChild[childId] ?? []).filter((t) => !t.done);
    const doneTasks = (tasksByChild[childId] ?? []).filter((t) => t.done);
    return sendTaskMailCore(fid, childId, name, email, settings.googleAccessToken, openTasks, doneTasks);
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
  // silent=true unterdrückt das Abschluss-Popup — für den automatischen
  // Versand (TE-149), der ohne Nutzer-Interaktion läuft.
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
      crossInfo('✓ Mail Push für alle', parts.join(' · '));
    } finally {
      setSendingAllMail(false);
    }
  }, [familyChildren, sendTaskMailToChild]);

  // ─── Automatischer täglicher Versand (TE-149) ──────────────────────────────
  // Nur noch die Konfiguration (An/Aus + Uhrzeiten) lebt hier. Der eigentliche
  // Scheduler läuft app-weit im RootLayout (TE-163) — vorher lief er lokal in
  // diesem Tab und feuerte nie, wenn die Kinder-Tab in der Session nicht
  // geöffnet wurde, obwohl "An" eingestellt war.
  const [emailAutoEnabled, setEmailAutoEnabled] = useState(false);
  const [emailTimes, setEmailTimes] = useState<string[]>(['06:00', '14:00']);
  const [newTimeInput, setNewTimeInput] = useState('');

  // Konfiguration einmal pro Familie laden.
  useEffect(() => {
    if (!fid) return;
    getEmailReminderConfig(fid)
      .then((c) => { setEmailAutoEnabled(c.enabled); setEmailTimes(c.times); })
      .catch(() => {});
  }, [fid]);

  const persistEmailConfig = useCallback((enabled: boolean, times: string[]) => {
    if (!fid) return;
    setEmailReminderConfig(fid, { enabled, times }).catch(() => {});
  }, [fid]);

  const toggleEmailAuto = useCallback(() => {
    const next = !emailAutoEnabled;
    setEmailAutoEnabled(next);
    persistEmailConfig(next, emailTimes);
  }, [emailAutoEnabled, emailTimes, persistEmailConfig]);

  const addEmailTime = useCallback(() => {
    const t = newTimeInput.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
      crossInfo('Ungültige Zeit', 'Bitte im Format HH:MM eingeben, z. B. 06:00.');
      return;
    }
    if (emailTimes.includes(t)) { setNewTimeInput(''); return; }
    const next = [...emailTimes, t].sort();
    setEmailTimes(next);
    setNewTimeInput('');
    persistEmailConfig(emailAutoEnabled, next);
  }, [newTimeInput, emailTimes, emailAutoEnabled, persistEmailConfig]);

  const removeEmailTime = useCallback((t: string) => {
    const next = emailTimes.filter((x) => x !== t);
    setEmailTimes(next);
    persistEmailConfig(emailAutoEnabled, next);
  }, [emailTimes, emailAutoEnabled, persistEmailConfig]);

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

  const handleDeleteTask = useCallback((task: ChildTask) => {
    // Gruppenaufgabe (TE-146): in einem Rutsch bei allen beteiligten Kindern
    // löschen – kein Einzellöschen einer Kopie pro Kind mehr.
    if (task.groupId) {
      const members: { childId: string; taskId: string }[] = [];
      for (const child of familyChildren) {
        for (const t of tasksByChild[child.id] ?? []) {
          if (t.groupId === task.groupId) members.push({ childId: child.id, taskId: t.id });
        }
      }
      handleDeleteGroupTask({ title: task.title, members });
      return;
    }
    crossAlert('Aufgabe löschen?', '', async () => {
      try {
        await deleteTask(fid, selectedChild, task.id, { actor: 'parent', title: task.title });
      } catch (e: any) {
        crossInfo('Fehler beim Löschen', e?.message ?? String(e));
      }
    }, true);
  }, [fid, selectedChild, familyChildren, tasksByChild, handleDeleteGroupTask]);

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
    const detail = editingTask.rewardDetail.trim();
    // Neue Belohnung aus dem Formular (kein undefined — TE-40).
    const newReward: ChildReward | null = editingTask.rewardType
      ? (detail ? { type: editingTask.rewardType, title: detail } : { type: editingTask.rewardType })
      : null;

    const sameReward = (a?: ChildReward | null, b?: ChildReward | null) => {
      const an = a ?? null, bn = b ?? null;
      if (!an && !bn) return true;
      if (!an || !bn) return false;
      return an.type === bn.type && (an.title ?? '') === (bn.title ?? '');
    };

    // Eine Kopie aktualisieren. Hat sich die Belohnung geändert, Freigabe zurücksetzen.
    const applyTo = (childId: string, task: ChildTask) => {
      const updates: Partial<ChildTask> = { title, reward: newReward };
      if (!sameReward(task.reward, newReward)) updates.rewardReleased = false;
      return updateTask(fid, childId, task.id, updates, { actor: 'parent', title });
    };

    try {
      if (editingTask.groupId) {
        // Gruppenaufgabe: alle Kopien (über alle Kinder) mit gleicher groupId anpassen.
        const targets: { childId: string; task: ChildTask }[] = [];
        for (const child of familyChildren) {
          for (const t of tasksByChild[child.id] ?? []) {
            if (t.groupId === editingTask.groupId) targets.push({ childId: child.id, task: t });
          }
        }
        await Promise.all(targets.map(({ childId, task }) => applyTo(childId, task)));
      } else {
        const task = (tasksByChild[selectedChild] ?? []).find((t) => t.id === editingTask.id);
        if (task) await applyTo(selectedChild, task);
      }
      setEditingTask(null);
    } catch (e: any) {
      crossInfo('Fehler', e?.message ?? 'Aufgabe konnte nicht gespeichert werden.');
    }
  }, [fid, selectedChild, editingTask, familyChildren, tasksByChild]);

  // Belohnung einer abgehakten Aufgabe freigeben/zurückziehen (TE-61).
  const handleToggleRewardRelease = useCallback(async (childId: string, task: ChildTask) => {
    try {
      await releaseTaskReward(fid, childId, task.id, !task.rewardReleased);
    } catch (e: any) {
      crossInfo('Fehler', e?.message ?? 'Belohnung konnte nicht freigegeben werden.');
    }
  }, [fid]);

  // Taschengeld-Übergabe direkt im Kindertab bestätigen/widerrufen (TE-92).
  const handleToggleAllowanceReceived = useCallback(async (month: string, received: boolean, amount: number) => {
    try {
      await setAllowanceReceived(fid, selectedChild, month, !received, amount);
    } catch (e: any) {
      crossInfo('Fehler', e?.message ?? 'Taschengeld-Status konnte nicht gespeichert werden.');
    }
  }, [fid, selectedChild]);

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


  const tasks = tasksByChild[selectedChild] ?? [];
  const done = tasks.filter((t) => t.done).length;

  // Taschengeld des ausgewählten Kindes (TE-72): konfigurierter Betrag, Verlauf
  // absteigend (neuster Monat zuerst) und der nächste fällige Monat.
  const selectedChildConfig = familyChildren.find((c) => c.id === selectedChild);
  const allowanceAmount = selectedChildConfig?.allowance ?? 0;
  const allowanceMonths = allowanceByChild[selectedChild] ?? {};
  const allowanceHistory = Object.entries(allowanceMonths)
    .sort(([a], [b]) => b.localeCompare(a));
  const allowanceTotal = allowanceHistory.reduce(
    (sum, [, m]) => sum + (m.received ? m.amount : 0), 0);
  const nextAllowance = nextAllowanceMonth(allowanceMonths);
  const nextAllowanceReceived = allowanceMonths[nextAllowance]?.received ?? false;

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(false)} />}
    >
      {/* Modus-Umschalter ganz oben (TE-56/TE-93): steuert die gesamte Seite —
          Einzelne = Aufgaben pro Kind, Gruppe = Gruppenaufgaben für mehrere Kinder,
          Extras = Push-/Geräte-Aktionen. */}
      <View style={s.topToggle}>
        <TouchableOpacity
          style={[s.topToggleBtn, mode === 'single' && s.topToggleBtnActive]}
          onPress={() => setMode('single')}
        >
          <Ionicons name="person" size={16} color={mode === 'single' ? '#000' : colors.textMuted} />
          <Text style={[s.topToggleText, mode === 'single' && s.topToggleTextActive]}>Einzelne</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.topToggleBtn, mode === 'group' && s.topToggleBtnActive]}
          onPress={() => setMode('group')}
        >
          <Ionicons name="people" size={16} color={mode === 'group' ? '#000' : colors.textMuted} />
          <Text style={[s.topToggleText, mode === 'group' && s.topToggleTextActive]}>Gruppe</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.topToggleBtn, mode === 'extras' && s.topToggleBtnActive]}
          onPress={() => setMode('extras')}
        >
          <Ionicons name="apps" size={16} color={mode === 'extras' ? '#000' : colors.textMuted} />
          <Text style={[s.topToggleText, mode === 'extras' && s.topToggleTextActive]}>Extras</Text>
        </TouchableOpacity>
      </View>

      {/* Haupt-Inhalt nur in Einzelne/Gruppe — im Extras-Tab ausgeblendet (TE-93) */}
      {mode !== 'extras' && (
        <>
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
                  <View style={s.headerBtnRow}>
                    <TouchableOpacity onPress={() => setEditingTask({
                      id: g.members[0]?.taskId ?? '',
                      title: g.title,
                      groupId: g.groupId,
                      rewardType: g.reward?.type ?? null,
                      rewardDetail: g.reward?.title ?? '',
                    })}>
                      <Ionicons name="pencil-outline" size={18} color={colors.accentNeon} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteGroupTask(g)}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
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
              <TouchableOpacity onPress={() => setEditingTask({
                id: task.id,
                title: task.title,
                groupId: task.groupId ?? null,
                rewardType: task.reward?.type ?? null,
                rewardDetail: task.reward?.title ?? '',
              })}>
                <Ionicons name="pencil-outline" size={18} color={colors.accentNeon} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteTask(task)}>
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

      {/* Taschengeld-Verlauf (TE-72) — echtzeit-synchron mit der Kinder-App */}
      <View style={s.section}>
        <View style={s.row}>
          <Text style={s.sectionTitle}>💶 Taschengeld — {childName(selectedChild)}</Text>
          {allowanceTotal > 0 && (
            <Text style={s.allowanceTotal}>{formatEuro(allowanceTotal)} erhalten</Text>
          )}
        </View>

        {allowanceAmount > 0 ? (
          // Noch kein Eintrag für den fälligen Monat (TE-155): ohne diese Zeile
          // gäbe es hier nur den Info-Text unten und keinen Weg für Eltern, das
          // Taschengeld eines Kindes anzuhaken, das den Erhalt nie selbst im
          // Kind-Screen bestätigt (z. B. weil es die App nicht selbst nutzt) —
          // die History-Liste zeigt erst ab dem ersten Eintrag einen Haken an.
          allowanceMonths[nextAllowance] === undefined ? (
            <View style={s.allowanceRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.allowanceMonth}>{formatMonthLabel(nextAllowance)}</Text>
                <Text style={s.allowanceConfirmed}>Noch nicht bestätigt</Text>
              </View>
              <Text style={s.allowanceAmount}>{formatEuro(allowanceAmount)}</Text>
              <TouchableOpacity
                style={s.allowanceStatus}
                onPress={() => handleToggleAllowanceReceived(nextAllowance, false, allowanceAmount)}
              >
                <Ionicons name="ellipse-outline" size={13} color={colors.textMuted} />
                <Text style={[s.allowanceStatusText, { color: colors.textMuted }]}>übergeben?</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={s.allowanceNext}>
              {nextAllowanceReceived
                ? `${formatMonthLabel(nextAllowance)} steht aus · ${formatEuro(allowanceAmount)}`
                : `Nächstes Taschengeld: ${formatMonthLabel(nextAllowance)} · ${formatEuro(allowanceAmount)}`}
            </Text>
          )
        ) : (
          <Text style={s.hint}>Kein Taschengeld konfiguriert. In den Einstellungen pro Kind festlegen.</Text>
        )}

        {allowanceHistory.length === 0 ? (
          <Text style={s.empty}>Noch keine Taschengeld-Einträge.</Text>
        ) : (
          allowanceHistory.map(([key, m]) => {
            // Effektiver Betrag statt m.amount (TE-154): eine reine Monats-Korrektur
            // ohne bestätigten Erhalt legt keinen amount-Wert an – m.amount wäre dann
            // undefined und formatEuro würde crashen (weißer Bildschirm im Kinder-Tab).
            const amount = effectiveAllowance(allowanceAmount, m);
            return (
            <View key={key} style={s.allowanceRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.allowanceMonth}>{formatMonthLabel(key)}</Text>
                {m.received && m.confirmedAt && (
                  <Text style={s.allowanceConfirmed}>
                    Abgehakt am {format(new Date(m.confirmedAt), 'dd.MM.yyyy, HH:mm')}
                  </Text>
                )}
              </View>
              <Text style={s.allowanceAmount}>{formatEuro(amount)}</Text>
              <TouchableOpacity
                style={[s.allowanceStatus, m.received && s.allowanceStatusOk]}
                onPress={() => handleToggleAllowanceReceived(key, m.received, amount)}
              >
                <Ionicons
                  name={m.received ? 'checkmark-circle' : 'ellipse-outline'}
                  size={13}
                  color={m.received ? colors.success : colors.textMuted}
                />
                <Text style={[s.allowanceStatusText, { color: m.received ? colors.success : colors.textMuted }]}>
                  {m.received ? 'erhalten' : 'übergeben?'}
                </Text>
              </TouchableOpacity>
            </View>
            );
          })
        )}
      </View>

        </>
      )}
        </>
      )}

      {/* Edit-Modal — Titel + Belohnung (TE-63) */}
      <Modal visible={!!editingTask} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={() => setEditingTask(null)}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>
              {editingTask?.groupId ? 'Gruppenaufgabe bearbeiten' : 'Aufgabe bearbeiten'}
            </Text>
            <TextInput
              style={s.input}
              value={editingTask?.title ?? ''}
              onChangeText={(t) => setEditingTask((e) => e ? { ...e, title: t } : e)}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveEdit}
              placeholderTextColor={colors.placeholder}
            />

            {/* Belohnung ändern (TE-63) */}
            <Text style={s.rewardPickerLabel}>Belohnung (optional)</Text>
            <View style={s.rewardPickerRow}>
              <TouchableOpacity
                style={[s.rewardPickerChip, !editingTask?.rewardType && s.rewardPickerChipActive]}
                onPress={() => setEditingTask((e) => e ? { ...e, rewardType: null } : e)}
              >
                <Text style={[s.rewardPickerChipText, !editingTask?.rewardType && s.rewardPickerChipTextActive]}>Keine</Text>
              </TouchableOpacity>
              {(Object.keys(REWARD_TYPES) as RewardType[]).map((type) => {
                const sel = editingTask?.rewardType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[s.rewardPickerChip, sel && s.rewardPickerChipActive]}
                    onPress={() => setEditingTask((e) => e ? { ...e, rewardType: type } : e)}
                  >
                    <Text style={s.rewardPickerEmoji}>{REWARD_TYPES[type].emoji}</Text>
                    <Text style={[s.rewardPickerChipText, sel && s.rewardPickerChipTextActive]}>
                      {REWARD_TYPES[type].label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!!editingTask?.rewardType && (
              <TextInput
                style={s.input}
                value={editingTask?.rewardDetail ?? ''}
                onChangeText={(t) => setEditingTask((e) => e ? { ...e, rewardDetail: t } : e)}
                placeholder="Detail (optional), z.B. 1 Folge Paw Patrol"
                placeholderTextColor={colors.placeholder}
                returnKeyType="done"
              />
            )}

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

      {/* Extras-Tab (TE-93): Push-/Mail-Aktionen an alle + Gerät einrichten.
          Vorher dauerhaft am Seitenende, jetzt nur im Extras-Tab sichtbar.
          "App-Push an alle" (Firestore-Trigger ohne Mail) entfernt (TE-163):
          funktionierte für diese Familie nur bei offener App, da der native
          Hintergrund-Push nur auf Nicht-Web-Plattformen ausgelöst wird und
          hier ausschließlich die Web-App genutzt wird. */}
      {mode === 'extras' && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Extras</Text>

          {/* Mail Push für alle (TE-118, TE-163 umbenannt von "Push & Mail an alle") */}
          <TouchableOpacity
            style={s.pushBtn}
            onPress={handleSendAllMail}
            disabled={sendingAllMail}
          >
            {sendingAllMail ? (
              <ActivityIndicator color={colors.textMuted} />
            ) : (
              <>
                <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
                <Text style={s.pushBtnText}>Mail Push für alle</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Automatischer täglicher Versand (TE-149) */}
          <View style={s.autoMailBox}>
            <View style={s.autoMailHeader}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={s.autoMailTitle}>Automatisch täglich senden</Text>
              <TouchableOpacity
                style={[s.autoToggle, emailAutoEnabled && s.autoToggleOn]}
                onPress={toggleEmailAuto}
              >
                <Text style={[s.autoToggleText, emailAutoEnabled && s.autoToggleTextOn]}>
                  {emailAutoEnabled ? 'An' : 'Aus'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={s.autoMailHint}>
              Löst „Mail Push für alle" automatisch zu diesen Zeiten aus – nur solange die App geöffnet ist.
            </Text>
            <View style={s.timeChips}>
              {emailTimes.map((t) => (
                <View key={t} style={s.timeChip}>
                  <Text style={s.timeChipText}>{t}</Text>
                  <TouchableOpacity onPress={() => removeEmailTime(t)} hitSlop={8}>
                    <Ionicons name="close" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
              {emailTimes.length === 0 && (
                <Text style={s.autoMailHint}>Keine Zeiten – bitte unten hinzufügen.</Text>
              )}
            </View>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder="HH:MM (z. B. 06:00)"
                placeholderTextColor={colors.placeholder}
                value={newTimeInput}
                onChangeText={setNewTimeInput}
                onSubmitEditing={addEmailTime}
                keyboardType="numbers-and-punctuation"
              />
              <TouchableOpacity style={s.addBtn} onPress={addEmailTime}>
                <Ionicons name="add" size={20} color="#000" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Kinder-Gerät einrichten — bewusst dezent (TE-89), damit er nicht versehentlich angetippt wird */}
          <TouchableOpacity style={s.setupBtn} onPress={() => setSetupModalVisible(true)}>
            <Ionicons name="phone-portrait-outline" size={14} color={colors.textMuted} />
            <Text style={s.setupBtnText}>Dieses Gerät als Kinder-Gerät einrichten</Text>
          </TouchableOpacity>
        </View>
      )}
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
    // Automatischer täglicher Versand (TE-149)
    autoMailBox: {
      marginTop: 10, gap: 8, padding: 12, borderRadius: 12,
      backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.border,
    },
    autoMailHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    autoMailTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
    autoMailHint: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
    autoToggle: {
      paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    },
    autoToggleOn: { backgroundColor: colors.accentNeon, borderColor: colors.accentNeon },
    autoToggleText: { fontSize: 13, fontWeight: '800', color: colors.textMuted },
    autoToggleTextOn: { color: '#000' },
    timeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    timeChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: colors.border, borderRadius: 8,
      paddingLeft: 10, paddingRight: 6, paddingVertical: 5, backgroundColor: colors.surface,
    },
    timeChipText: { fontSize: 14, fontWeight: '700', color: colors.text, letterSpacing: 0.5 },
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
    // Taschengeld-Verlauf (TE-72)
    allowanceTotal: { fontSize: 12, fontWeight: '700', color: colors.success },
    allowanceNext: { fontSize: 13, color: colors.accentNeon, fontWeight: '600' },
    allowanceRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
      borderTopWidth: 1, borderColor: colors.border,
    },
    allowanceMonth: { fontSize: 14, fontWeight: '600', color: colors.text },
    allowanceConfirmed: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
    allowanceAmount: { fontSize: 14, fontWeight: '700', color: colors.text },
    allowanceStatus: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      minWidth: 78, justifyContent: 'flex-end',
      paddingVertical: 6, paddingHorizontal: 4,
    },
    allowanceStatusOk: {},
    allowanceStatusText: { fontSize: 12, fontWeight: '700' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    hint: { fontSize: 12, color: colors.textMuted },
    saveBtn: {
      backgroundColor: colors.accentNeon, borderRadius: 10,
      paddingVertical: 10, alignItems: 'center',
    },
    saveBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
    pushBtn: {
      flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border,
      paddingVertical: 11, justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8,
    },
    pushBtnText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
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
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
      paddingVertical: 10, marginTop: 16,
    },
    setupBtnText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
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
