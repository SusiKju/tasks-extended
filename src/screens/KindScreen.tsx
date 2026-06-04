/**
 * KindScreen.tsx
 * Wird angezeigt wenn die App im Kind-Modus läuft.
 * Zeigt: Namensauswahl (Onboarding) → Aufgabenliste → PIN-Rückweg.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, TextInput, Pressable, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../utils/theme';
import {
  ChildId, CHILDREN, CHILD_NAMES, ChildTask,
  ChildReward, REWARD_TYPES,
  subscribeToChildTasks, toggleTask, subscribeToPushTrigger,
  subscribeToChildReward,
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

// ── Schatzkiste-Belohnung ────────────────────────────────────────────────────
// Spiegelt rewardStage() aus kinder/index.html, damit App- und Web-Ansicht
// identisches Belohnungs-Feedback zeigen (siehe TE-100).
interface RewardStage { emoji: string; msg: string; full?: boolean }
function rewardStage(doneCount: number, total: number): RewardStage {
  if (total === 0)     return { emoji: '📦', msg: 'Noch keine Aufgaben heute' };
  if (doneCount === 0) return { emoji: '📦', msg: "Noch leer – los geht's!" };
  const frac = doneCount / total;
  if (frac >= 1)   return { emoji: '🧰💎', msg: 'Voll! Du hast den Schatz geknackt! 🎉', full: true };
  if (frac >= 0.5) return { emoji: '💰', msg: 'Schon halb voll – weiter so!' };
  return { emoji: '🪙', msg: 'Füllt sich… sammle mehr Münzen!' };
}

interface Props {
  onExitChildMode?: () => void;
}

export default function KindScreen({ onExitChildMode }: Props) {
  const { colors } = useTheme();
  const s = styles(colors);

  const [childId, setChildId] = useState<ChildId | null>(null);
  const [tasks, setTasks] = useState<ChildTask[]>([]);
  const [reward, setReward] = useState<ChildReward | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('unsupported');
  const [toast, setToast] = useState(false);

  // Schatzkiste-Animation (TE-100)
  const chestScale = useRef(new Animated.Value(1)).current;
  const coinScale = useRef(new Animated.Value(1)).current;
  const prevDoneRef = useRef<number | null>(null);

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
    const unsubReward = subscribeToChildReward(childId, setReward);
    return () => { unsubTasks(); unsubPush(); unsubReward(); };
  }, [childId]);

  // Schatzkiste-Animation auslösen, sobald eine Aufgabe NEU abgehakt wurde (TE-100)
  useEffect(() => {
    const doneNow = tasks.filter((t) => t.done).length;
    if (prevDoneRef.current !== null && doneNow > prevDoneRef.current) {
      chestScale.setValue(1);
      coinScale.setValue(1);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(chestScale, { toValue: 1.35, duration: 150, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.spring(chestScale, { toValue: 1, friction: 4, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(coinScale, { toValue: 1.5, duration: 150, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.spring(coinScale, { toValue: 1, friction: 4, useNativeDriver: true }),
        ]),
      ]).start();
    }
    prevDoneRef.current = doneNow;
  }, [tasks, chestScale, coinScale]);

  const handleSelectChild = useCallback(async (id: ChildId) => {
    await AsyncStorage.setItem(STORAGE_KEY, id);
    setChildId(id);
    // Push-Token registrieren
    registerPushToken(id).catch(console.warn);
  }, []);

  const handleToggle = useCallback(async (task: ChildTask) => {
    if (!childId) return;
    await toggleTask(childId, task.id, !task.done, { actor: 'child', title: task.title });
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
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const allDone = total > 0 && done === total;
  const headerEmoji = total === 0 ? '😊' : allDone ? '🏆' : done > 0 ? '🎉' : '📋';
  const progress = total > 0 ? done / total : 0;
  const headerSub = total === 0
    ? 'Heute keine Aufgaben'
    : allDone
      ? 'Alles erledigt – mega! 🎉'
      : `${done} von ${total} Aufgaben erledigt`;

  // Schatzkiste-Belohnung (TE-100)
  const chestStage = rewardStage(done, total);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerEmoji}>{headerEmoji}</Text>
        <Text style={s.headerTitle}>Hey {CHILD_NAMES[childId]}! 🌟</Text>
        <Text style={s.headerSub}>{headerSub}</Text>
        {total > 0 && (
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        )}
        {/* Dezenter PIN-Button */}
        <TouchableOpacity style={s.pinBtn} onPress={() => setPinModalVisible(true)}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Schatzkiste-Belohnung (TE-100) – nur wenn KEINE eigene Belohnung definiert ist (TE-108) */}
      {!reward && (
        <View style={[s.reward, chestStage.full && s.rewardFull]}>
          <Animated.Text style={[s.chest, { transform: [{ scale: chestScale }] }]}>
            {chestStage.emoji}
          </Animated.Text>
          <View style={s.rewardBody}>
            <Text style={s.coins}>
              🪙 <Animated.Text style={[s.coinNum, { transform: [{ scale: coinScale }] }]}>{done}</Animated.Text>
            </Text>
            <Text style={s.rewardMsg}>{chestStage.msg}</Text>
            <View style={s.rewardBarTrack}>
              <View style={[s.rewardBarFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          </View>
        </View>
      )}

      {/* Freigeschaltete Belohnung (TE-101/TE-106) – Typ groß, lesefreundlich */}
      {reward && allDone && (
        <View style={s.rewardUnlock}>
          <Text style={s.rewardUnlockEmoji}>{REWARD_TYPES[reward.type].emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.rewardUnlockLabel}>🎉 Du hast gewonnen:</Text>
            <Text style={s.rewardUnlockTitle}>{REWARD_TYPES[reward.type].label}</Text>
            {!!reward.title && <Text style={s.rewardUnlockDetail}>{reward.title}</Text>}
          </View>
        </View>
      )}
      {/* Belohnung in Aussicht, solange noch offen (TE-101/TE-106) */}
      {reward && !allDone && total > 0 && (
        <View style={s.rewardTeaser}>
          <Text style={s.rewardTeaserEmoji}>{REWARD_TYPES[reward.type].emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.rewardTeaserText}>Schaff alles und du bekommst:</Text>
            <Text style={s.rewardTeaserStrong}>{REWARD_TYPES[reward.type].label}</Text>
            {!!reward.title && <Text style={s.rewardTeaserDetail}>{reward.title}</Text>}
          </View>
        </View>
      )}

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
            style={[s.taskCard, task.done && s.taskCardDone, task.rejected && s.taskCardRejected]}
            onPress={() => handleToggle(task)}
            activeOpacity={0.7}
          >
            <View style={[s.checkbox, task.done && s.checkboxDone, task.rejected && s.checkboxRejected]}>
              {task.done && <Ionicons name="checkmark" size={18} color={colors.successFg} />}
              {task.rejected && <Ionicons name="close" size={18} color={colors.dangerFg} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.taskText, task.done && s.taskTextDone, task.rejected && s.taskTextRejected]}>
                {task.title}
              </Text>
              {task.rejected && (
                <Text style={s.rejectedHint}>❌ Nicht akzeptiert – bitte nochmal machen</Text>
              )}
            </View>
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
    header: { padding: 20, paddingTop: 60, alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    headerEmoji: { fontSize: 48, marginBottom: 6 },
    headerTitle: { fontSize: 28, fontWeight: '800', color: colors.text, textAlign: 'center' },
    headerSub: { fontSize: 15, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
    progressTrack: { width: '100%', height: 12, borderRadius: 6, backgroundColor: colors.surfaceHigh, marginTop: 14, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 6, backgroundColor: colors.success },
    pinBtn: { position: 'absolute', top: 60, right: 20, padding: 8, opacity: 0.4 },
    // Schatzkiste-Belohnung (TE-100)
    reward: {
      flexDirection: 'row', alignItems: 'center', gap: 16,
      margin: 16, padding: 18,
      backgroundColor: '#FFF3D6', borderRadius: 20,
      shadowColor: '#D4A017', shadowOpacity: 0.25, shadowRadius: 14,
      shadowOffset: { width: 0, height: 2 }, elevation: 3,
    },
    rewardFull: {
      backgroundColor: '#FFD56B',
      shadowOpacity: 0.6, shadowRadius: 24,
    },
    chest: { fontSize: 50, lineHeight: 58 },
    rewardBody: { flex: 1, minWidth: 0 },
    coins: { fontSize: 22, fontWeight: '800', color: '#B8860B' },
    coinNum: { fontSize: 22, fontWeight: '800', color: '#B8860B' },
    rewardMsg: { fontSize: 14, color: '#9A7B1A', fontWeight: '600', marginTop: 3 },
    rewardBarTrack: {
      height: 8, borderRadius: 99, marginTop: 9, overflow: 'hidden',
      backgroundColor: 'rgba(184,134,11,0.18)',
    },
    rewardBarFill: { height: '100%', borderRadius: 99, backgroundColor: '#D4A017' },
    // Freigeschaltete / angekündigte Belohnung (TE-101)
    rewardUnlock: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      marginHorizontal: 16, marginTop: -4, marginBottom: 4, padding: 16,
      backgroundColor: '#E8FBEF', borderRadius: 20,
      borderWidth: 2, borderColor: colors.success,
    },
    rewardUnlockEmoji: { fontSize: 56 },
    rewardUnlockLabel: { fontSize: 15, fontWeight: '700', color: '#1E8E45' },
    rewardUnlockTitle: { fontSize: 26, fontWeight: '900', color: '#14532D', marginTop: 2 },
    rewardUnlockDetail: { fontSize: 15, fontWeight: '600', color: '#1E8E45', marginTop: 2 },
    rewardTeaser: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      marginHorizontal: 16, marginTop: -4, marginBottom: 4, padding: 14,
      backgroundColor: colors.surface, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border,
    },
    rewardTeaserEmoji: { fontSize: 40 },
    rewardTeaserText: { fontSize: 14, color: colors.textSecondary },
    rewardTeaserStrong: { fontSize: 20, fontWeight: '900', color: colors.text, marginTop: 1 },
    rewardTeaserDetail: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
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
    list: { padding: 16, gap: 14, paddingBottom: 40 },
    taskCard: {
      flexDirection: 'row', alignItems: 'center', gap: 16,
      backgroundColor: colors.surface, borderRadius: 20, padding: 20,
      borderWidth: 1, borderColor: colors.border,
    },
    taskCardDone: { opacity: 0.6, borderColor: colors.success },
    // Vom Elternteil abgelehnte Aufgabe (TE-103): deutlich rot.
    taskCardRejected: { borderColor: colors.danger, borderWidth: 2, backgroundColor: 'rgba(239,68,68,0.08)' },
    checkbox: {
      width: 32, height: 32, borderRadius: 16, borderWidth: 2.5,
      borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
    },
    checkboxDone: { backgroundColor: colors.success, borderColor: colors.success },
    checkboxRejected: { backgroundColor: colors.danger, borderColor: colors.danger },
    taskText: { flex: 1, fontSize: 18, fontWeight: '600', color: colors.text },
    taskTextDone: { textDecorationLine: 'line-through', color: colors.textMuted },
    taskTextRejected: { color: colors.danger },
    rejectedHint: { fontSize: 13, fontWeight: '700', color: colors.danger, marginTop: 4 },
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
