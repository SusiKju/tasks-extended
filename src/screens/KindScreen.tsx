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
import { useStore } from '../store';
import {
  ChildTask, REWARD_TYPES,
  subscribeToChildTasks, toggleTask, subscribeToPushTrigger,
} from '../services/kinderTasks';
import { ChildConfig, subscribeToChildren } from '../services/family';
import {
  AllowanceMonth, subscribeToAllowanceMonths, setAllowanceReceived, monthKey,
} from '../services/allowance';
import { registerPushToken } from '../services/pushNotifications';
import KidThemeCard from '../components/KidThemeCard';

/** Betrag deutsch formatieren: 5 → "5 €", 5.5 → "5,50 €". */
function formatEuro(n: number): string {
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
  return `${fixed} €`;
}

/** "YYYY-MM" → "Juni 2026". */
const MONTH_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_NAMES_DE[idx] ?? m} ${y}`;
}

const FAMILY_ID_KEY = 'kinder_family_id';
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
  const parentPin = useStore((state) => state.settings.parentPin ?? '1234');

  const [childId, setChildId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [familyChildren, setFamilyChildren] = useState<ChildConfig[]>([]);
  const [tasks, setTasks] = useState<ChildTask[]>([]);
  const [allowanceMonths, setAllowanceMonths] = useState<Record<string, AllowanceMonth>>({});
  const [historyVisible, setHistoryVisible] = useState(false);
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

  // Gespeicherte Kind-ID und Familie laden
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(FAMILY_ID_KEY),
    ]).then(([storedChild, storedFamily]) => {
      if (storedChild) setChildId(storedChild);
      if (storedFamily) setFamilyId(storedFamily);
      setLoading(false);
    });
  }, []);

  // Kinder-Konfiguration laden sobald familyId bekannt
  useEffect(() => {
    if (!familyId) return;
    return subscribeToChildren(familyId, setFamilyChildren);
  }, [familyId]);

  // Firestore-Listener sobald Kind UND Familie bekannt
  useEffect(() => {
    if (!childId || !familyId) return;
    const unsubTasks = subscribeToChildTasks(familyId, childId, TODAY, setTasks);
    // Push-Token immer registrieren (auch wenn Onboarding übersprungen wurde)
    if (Platform.OS !== 'web') {
      registerPushToken(familyId, childId).catch(console.warn);
    }
    // Web-Benachrichtigungen: Berechtigung anfragen + Status merken
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission as any);
      requestWebNotificationPermission().then(() => {
        setNotifPermission(Notification.permission as any);
      });
    }
    const unsubPush = subscribeToPushTrigger(familyId, childId, () => {
      setToast(true);
      setTimeout(() => setToast(false), 5000);
    });
    const unsubAllowance = subscribeToAllowanceMonths(familyId, childId, setAllowanceMonths);
    return () => { unsubTasks(); unsubPush(); unsubAllowance(); };
  }, [childId, familyId]);

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

  const handleSelectChild = useCallback(async (id: string) => {
    await AsyncStorage.setItem(STORAGE_KEY, id);
    setChildId(id);
    // Push-Token registrieren
    if (familyId) registerPushToken(familyId, id).catch(console.warn);
  }, [familyId]);

  const handleToggle = useCallback(async (task: ChildTask) => {
    if (!childId || !familyId) return;
    await toggleTask(familyId, childId, task.id, !task.done, { actor: 'child', title: task.title });
  }, [childId, familyId]);

  // Taschengeld für den aktuellen Monat bestätigen/widerrufen (TE-53).
  const handleToggleAllowance = useCallback(async (amount: number) => {
    if (!childId || !familyId) return;
    const key = monthKey();
    const received = !(allowanceMonths[key]?.received ?? false);
    await setAllowanceReceived(familyId, childId, key, received, amount);
  }, [childId, familyId, allowanceMonths]);

  const handlePinSubmit = useCallback(async () => {
    if (pinInput === parentPin) {
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
          {familyChildren.map((child) => (
            <TouchableOpacity
              key={child.id}
              style={[s.nameBtn, { backgroundColor: child.color }]}
              onPress={() => handleSelectChild(child.id)}
            >
              <Text style={s.nameBtnText}>
                {child.emoji ? `${child.emoji} ` : ''}{child.name}
              </Text>
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

  // Taschengeld (TE-53/TE-54)
  const selectedChild = familyChildren.find((c) => c.id === childId);
  const allowance = selectedChild?.allowance ?? 0;
  const thisMonthKey = monthKey();
  const allowanceReceived = allowanceMonths[thisMonthKey]?.received ?? false;
  // Verlauf absteigend sortiert (neuster Monat zuerst) – Basis für TE-54.
  const allowanceHistory = Object.entries(allowanceMonths)
    .sort(([a], [b]) => b.localeCompare(a));
  const allowanceTotal = allowanceHistory.reduce(
    (sum, [, m]) => sum + (m.received ? m.amount : 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerEmoji}>{headerEmoji}</Text>
        <Text style={s.headerTitle}>Hey {familyChildren.find((c) => c.id === childId)?.name ?? childId}! 🌟</Text>
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

      <ScrollView contentContainerStyle={s.list}>
        {/* Themen-Anzeige (TE-65): zeigt pro Reload ein neues Item des Kind-Themas. */}
        {selectedChild?.theme && <KidThemeCard theme={selectedChild.theme} />}
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
              {(() => {
                // Gruppenaufgabe (TE-114/TE-116): andere teilnehmende Kinder anzeigen.
                const others = (task.groupChildren ?? [])
                  .filter((id) => id !== childId)
                  .map((id) => familyChildren.find((c) => c.id === id)?.name ?? id);
                if (others.length) {
                  return <Text style={s.groupHint}>👥 Zusammen mit {others.join(', ')}</Text>;
                }
                if (task.groupId) {
                  return <Text style={s.groupHint}>👥 Gruppenaufgabe</Text>;
                }
                return null;
              })()}
              {task.rejected && (
                <Text style={s.rejectedHint}>❌ Nicht akzeptiert – bitte nochmal machen</Text>
              )}
              {/* Belohnung der Aufgabe (TE-61) */}
              {task.reward && (
                task.rewardReleased ? (
                  <Text style={s.taskRewardWon}>
                    🎉 Freigeschaltet: {REWARD_TYPES[task.reward.type].emoji} {REWARD_TYPES[task.reward.type].label}
                    {task.reward.title ? ` · ${task.reward.title}` : ''}
                  </Text>
                ) : task.done ? (
                  <Text style={s.taskRewardWait}>
                    {REWARD_TYPES[task.reward.type].emoji} {REWARD_TYPES[task.reward.type].label} – warten auf Freigabe ⏳
                  </Text>
                ) : (
                  <Text style={s.taskRewardTeaser}>
                    🎁 Belohnung: {REWARD_TYPES[task.reward.type].emoji} {REWARD_TYPES[task.reward.type].label}
                    {task.reward.title ? ` · ${task.reward.title}` : ''}
                  </Text>
                )
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Schatzkiste-Belohnung (TE-100) – generischer Tagesfortschritt */}
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

      {/* Taschengeld-Karte (TE-53) – nur wenn ein Betrag konfiguriert ist */}
      {allowance > 0 && (
        <View style={[s.allowanceCard, allowanceReceived && s.allowanceCardDone]}>
          <Text style={s.allowanceEmoji}>💶</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.allowanceLabel}>Taschengeld {formatMonthLabel(thisMonthKey)}</Text>
            <Text style={s.allowanceAmount}>{formatEuro(allowance)}</Text>
            <Text style={s.allowanceHint}>
              {allowanceReceived ? 'Erhalten ✓' : 'Schon bekommen? Hier abhaken.'}
            </Text>
          </View>
          <View style={s.allowanceActions}>
            <TouchableOpacity
              style={[s.allowanceCheck, allowanceReceived && s.allowanceCheckDone]}
              onPress={() => handleToggleAllowance(allowance)}
              activeOpacity={0.7}
            >
              {allowanceReceived && <Ionicons name="checkmark" size={22} color={colors.successFg} />}
            </TouchableOpacity>
            {allowanceHistory.length > 0 && (
              <TouchableOpacity onPress={() => setHistoryVisible(true)} hitSlop={8}>
                <Text style={s.allowanceHistoryLink}>Verlauf</Text>
              </TouchableOpacity>
            )}
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

      {/* Taschengeld-Verlauf (TE-54) */}
      <Modal visible={historyVisible} transparent animationType="fade">
        <Pressable style={s.historyOverlay} onPress={() => setHistoryVisible(false)}>
          <Pressable style={s.historyBox} onPress={() => {}}>
            <Text style={s.historyTitle}>💶 Taschengeld-Verlauf</Text>
            <Text style={s.historyTotal}>Insgesamt erhalten: {formatEuro(allowanceTotal)}</Text>
            {allowanceHistory.length === 0 ? (
              <Text style={s.historyEmpty}>Noch keine Einträge.</Text>
            ) : (
              <ScrollView>
                {allowanceHistory.map(([key, m]) => (
                  <View key={key} style={s.historyRow}>
                    <Text style={s.historyMonth}>{formatMonthLabel(key)}</Text>
                    <Text style={s.historyAmount}>{formatEuro(m.amount)}</Text>
                    {m.received
                      ? <Text style={s.historyStatusOk}>✓</Text>
                      : <Text style={s.historyStatusOpen}>offen</Text>}
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={s.historyClose} onPress={() => setHistoryVisible(false)}>
              <Text style={s.historyCloseText}>Schließen</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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
    // Belohnung pro Aufgabe (TE-61) – auf der Aufgabenkarte
    taskRewardTeaser: { fontSize: 13, fontWeight: '700', color: colors.accentNeon, marginTop: 4 },
    taskRewardWait: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 4 },
    taskRewardWon: { fontSize: 14, fontWeight: '800', color: '#1E8E45', marginTop: 4 },
    // Taschengeld-Karte (TE-53/TE-54)
    allowanceCard: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      marginHorizontal: 16, marginTop: 4, marginBottom: 4, padding: 16,
      backgroundColor: '#EAF2FF', borderRadius: 20,
      borderWidth: 2, borderColor: '#9BC0FF',
    },
    allowanceCardDone: {
      backgroundColor: '#E8FBEF', borderColor: colors.success,
    },
    allowanceEmoji: { fontSize: 44 },
    allowanceLabel: { fontSize: 14, fontWeight: '700', color: '#2A5B9E' },
    allowanceAmount: { fontSize: 26, fontWeight: '900', color: '#14305E', marginTop: 1 },
    allowanceHint: { fontSize: 13, color: '#3A6BB5', marginTop: 2 },
    allowanceActions: { alignItems: 'center', gap: 8 },
    allowanceCheck: {
      width: 40, height: 40, borderRadius: 20, borderWidth: 2.5,
      borderColor: '#9BC0FF', justifyContent: 'center', alignItems: 'center',
    },
    allowanceCheckDone: { backgroundColor: colors.success, borderColor: colors.success },
    allowanceHistoryLink: { fontSize: 13, fontWeight: '700', color: '#2A5BB5', textDecorationLine: 'underline' },
    // History-Modal (TE-54)
    historyOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    historyBox: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, maxHeight: '80%' as any },
    historyTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 4 },
    historyTotal: { fontSize: 15, fontWeight: '700', color: colors.success, marginBottom: 12 },
    historyRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border,
    },
    historyMonth: { flex: 1, fontSize: 15, color: colors.text },
    historyAmount: { fontSize: 15, fontWeight: '700', color: colors.text },
    historyStatusOk: { fontSize: 18, color: colors.success },
    historyStatusOpen: { fontSize: 14, color: colors.textMuted },
    historyEmpty: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingVertical: 20 },
    historyClose: { backgroundColor: colors.accentNeon, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
    historyCloseText: { fontWeight: '700', fontSize: 15, color: '#000' },
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
    // Gruppenaufgabe-Hinweis (TE-114/TE-116)
    groupHint: {
      alignSelf: 'flex-start', marginTop: 6,
      fontSize: 14, fontWeight: '700', color: colors.accentNeon,
      backgroundColor: colors.surfaceHigh, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden',
    },
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
