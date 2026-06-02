/**
 * KindScreen.tsx
 * Wird angezeigt wenn die App im Kind-Modus läuft.
 * Zeigt: Namensauswahl (Onboarding) → Aufgabenliste → PIN-Rückweg.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, TextInput, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../utils/theme';
import {
  ChildId, CHILDREN, CHILD_NAMES, ChildTask,
  subscribeToChildTasks, toggleTask, subscribeToPushTrigger,
} from '../services/kinderTasks';
import { registerPushToken } from '../services/pushNotifications';
import { Platform } from 'react-native';

async function requestWebNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}
import { format } from 'date-fns';

const TODAY = format(new Date(), 'yyyy-MM-dd');
const STORAGE_KEY = 'kinder_child_id';
const PARENT_PIN = '1234'; // TODO: aus Einstellungen lesen

interface Props {
  onExitChildMode?: () => void;
}

export default function KindScreen({ onExitChildMode }: Props) {
  const { colors } = useTheme();
  const s = styles(colors);

  const [childId, setChildId] = useState<ChildId | null>(null);
  const [tasks, setTasks] = useState<ChildTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('unsupported');
  const [toast, setToast] = useState(false);

  // Gespeicherte Kind-ID laden
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) setChildId(stored as ChildId);
      setLoading(false);
    });
  }, []);

  // Firestore-Listener sobald Kind bekannt
  useEffect(() => {
    if (!childId) return;
    const unsubTasks = subscribeToChildTasks(childId, TODAY, setTasks);
    // Push-Token immer registrieren (auch wenn Onboarding übersprungen wurde)
    if (Platform.OS !== 'web') {
      registerPushToken(childId).catch(console.warn);
    }
    // Web-Benachrichtigungen: Berechtigung anfragen + Status merken
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission as any);
      requestWebNotificationPermission().then(() => {
        setNotifPermission(Notification.permission as any);
      });
    }
    const unsubPush = subscribeToPushTrigger(childId, () => {
      setToast(true);
      setTimeout(() => setToast(false), 5000);
    });
    return () => { unsubTasks(); unsubPush(); };
  }, [childId]);

  const handleSelectChild = useCallback(async (id: ChildId) => {
    await AsyncStorage.setItem(STORAGE_KEY, id);
    setChildId(id);
    // Push-Token registrieren
    registerPushToken(id).catch(console.warn);
  }, []);

  const handleToggle = useCallback(async (task: ChildTask) => {
    if (!childId) return;
    await toggleTask(childId, task.id, !task.done);
  }, [childId]);

  const handlePinSubmit = useCallback(async () => {
    if (pinInput === PARENT_PIN) {
      setPinModalVisible(false);
      setPinInput('');
      setPinError(false);
      // Kind-Modus verlassen
      await AsyncStorage.removeItem(STORAGE_KEY);
      setChildId(null);
      onExitChildMode?.();
    } else {
      setPinError(true);
      setPinInput('');
    }
  }, [pinInput]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.accentNeon} />
      </View>
    );
  }

  // ── Onboarding: Name wählen ──────────────────────────────────────────────
  if (!childId) {
    return (
      <View style={s.onboarding}>
        <Text style={s.onboardingEmoji}>👋</Text>
        <Text style={s.onboardingTitle}>Wer bist du?</Text>
        <View style={s.nameGrid}>
          {CHILDREN.map((id) => (
            <TouchableOpacity
              key={id}
              style={s.nameBtn}
              onPress={() => handleSelectChild(id)}
            >
              <Text style={s.nameBtnText}>{CHILD_NAMES[id]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // ── Aufgabenliste ────────────────────────────────────────────────────────
  const done = tasks.filter((t) => t.done).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Hey {CHILD_NAMES[childId]}! 🌟</Text>
        <Text style={s.headerSub}>{done} von {tasks.length} Aufgaben erledigt</Text>
        {/* Dezenter PIN-Button */}
        <TouchableOpacity style={s.pinBtn} onPress={() => setPinModalVisible(true)}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Push-Toast */}
      {toast && (
        <View style={s.toast}>
          <Text style={s.toastText}>👋 Schau mal kurz in deine Aufgaben rein!</Text>
        </View>
      )}

      {/* Benachrichtigungs-Status */}
      {notifPermission === 'default' && (
        <TouchableOpacity
          style={s.notifBanner}
          onPress={async () => {
            await requestWebNotificationPermission();
            if (Platform.OS === 'web' && 'Notification' in window) {
              setNotifPermission(Notification.permission as any);
            }
          }}
        >
          <Ionicons name="notifications-off-outline" size={16} color={colors.warningFg} />
          <Text style={[s.notifBannerText, { color: colors.warningFg }]}>Benachrichtigungen aktivieren — hier tippen</Text>
        </TouchableOpacity>
      )}
      {notifPermission === 'denied' && (
        <View style={[s.notifBanner, { backgroundColor: colors.danger }]}>
          <Ionicons name="notifications-off-outline" size={16} color={colors.dangerFg} />
          <Text style={[s.notifBannerText, { color: colors.dangerFg }]}>Benachrichtigungen blockiert — in Browser-Einstellungen erlauben</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={s.list}>
        {tasks.length === 0 && (
          <Text style={s.empty}>Heute keine Aufgaben 🎉</Text>
        )}
        {tasks.map((task) => (
          <TouchableOpacity
            key={task.id}
            style={[s.taskCard, task.done && s.taskCardDone]}
            onPress={() => handleToggle(task)}
            activeOpacity={0.7}
          >
            <View style={[s.checkbox, task.done && s.checkboxDone]}>
              {task.done && <Ionicons name="checkmark" size={18} color={colors.successFg} />}
            </View>
            <Text style={[s.taskText, task.done && s.taskTextDone]}>{task.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* PIN-Modal */}
      <Modal visible={pinModalVisible} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={() => { setPinModalVisible(false); setPinInput(''); setPinError(false); }}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>Eltern-PIN eingeben</Text>
            <TextInput
              style={[s.pinInput, pinError && { borderColor: colors.danger }]}
              value={pinInput}
              onChangeText={(t) => { setPinInput(t); setPinError(false); }}
              secureTextEntry
              keyboardType="numeric"
              maxLength={8}
              autoFocus
              placeholder="PIN"
              placeholderTextColor={colors.placeholder}
            />
            {pinError && <Text style={s.pinError}>Falscher PIN</Text>}
            <TouchableOpacity style={s.pinConfirmBtn} onPress={handlePinSubmit}>
              <Text style={s.pinConfirmText}>Bestätigen</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    // Onboarding
    onboarding: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24, padding: 32, backgroundColor: colors.background },
    onboardingEmoji: { fontSize: 64 },
    onboardingTitle: { fontSize: 32, fontWeight: '800', color: colors.text },
    nameGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
    nameBtn: {
      width: 140, height: 140, borderRadius: 24, backgroundColor: colors.accentNeon,
      justifyContent: 'center', alignItems: 'center',
    },
    nameBtnText: { fontSize: 24, fontWeight: '800', color: '#000' },
    // Header
    header: { padding: 20, paddingTop: 60, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    headerTitle: { fontSize: 26, fontWeight: '800', color: colors.text },
    headerSub: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
    pinBtn: { position: 'absolute', top: 60, right: 20, padding: 8, opacity: 0.4 },
    // Toast
    toast: {
      backgroundColor: colors.accentNeon, padding: 14, paddingHorizontal: 20,
      alignItems: 'center',
    },
    toastText: { color: '#000', fontWeight: '700', fontSize: 15 },
    // Benachrichtigungs-Banner
    notifBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.warning ?? '#FF9500', padding: 12, paddingHorizontal: 16,
    },
    notifBannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
    // Aufgabenliste
    list: { padding: 16, gap: 12, paddingBottom: 40 },
    taskCard: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: colors.surface, borderRadius: 16, padding: 18,
      borderWidth: 1, borderColor: colors.border,
    },
    taskCardDone: { opacity: 0.6 },
    checkbox: {
      width: 28, height: 28, borderRadius: 14, borderWidth: 2,
      borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
    },
    checkboxDone: { backgroundColor: colors.success, borderColor: colors.success },
    taskText: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
    taskTextDone: { textDecorationLine: 'line-through', color: colors.textMuted },
    empty: { textAlign: 'center', fontSize: 18, color: colors.textMuted, marginTop: 60 },
    // PIN-Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalBox: { backgroundColor: colors.surface, borderRadius: 20, padding: 28, width: 280, gap: 12 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
    pinInput: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 12, fontSize: 20, textAlign: 'center',
      color: colors.text, backgroundColor: colors.inputBackground, letterSpacing: 6,
    },
    pinError: { color: colors.danger, fontSize: 13, textAlign: 'center' },
    pinConfirmBtn: { backgroundColor: colors.accentNeon, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    pinConfirmText: { fontWeight: '700', fontSize: 15, color: '#000' },
  });
