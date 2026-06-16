import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { Clipboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { useTheme, ThemeColors, neonGlow, THEMES } from '../utils/theme';
import { Theme, FunTileTheme, MAIL_WINDOW_OPTIONS, DASHBOARD_BLOCKS, DEFAULT_DASHBOARD_BLOCKS } from '../types';
import { FUN_THEMES } from '../components/FussballKachel';

const THEME_OPTIONS: { key: Theme; label: string; description: string }[] = [
  { key: 'dark-mono', label: 'Neon Mono', description: 'Schwarz-Weiß mit Glow & Animationen' },
  { key: 'dark-calm', label: 'Ruhig', description: 'Schwarz-Weiß, ohne Glow & Animationen' },
];

// Fokus-Kachel-Themen (TE-10) – Reihenfolge wie in FUN_THEMES definiert.
const FUN_TILE_OPTIONS = (Object.keys(FUN_THEMES) as FunTileTheme[]).map((key) => ({
  key,
  label: FUN_THEMES[key].label,
  color: FUN_THEMES[key].tile,
  icon: FUN_THEMES[key].icon,
}));

import {
  signInWithGoogle,
  listCalendars,
} from '../services/googleCalendar';
import { useGoogleTasksSync } from '../hooks/useGoogleTasksSync';
import { useGoogleContactsBirthdaysSync } from '../hooks/useGoogleContactsBirthdaysSync';
import { useFamily } from '../hooks/useFamily';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { signOutFirebase } from '../services/firebaseAuth';
import {
  FamilyMember, ChildConfig,
  subscribeToMembers, leaveFamily,
  addChild, updateChild, deleteChild,
} from '../services/family';
import { setChildAllowance } from '../services/allowance';

/** Eingabe-Toleranz: "5,50" → 5.5, leer → null, ungültig/negativ → null. */
function parseAllowance(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Vorauswahl für Kind-Farben
const CHILD_COLORS = [
  '#4f86f7', '#f76e4f', '#22c55e', '#d946ef',
  '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899',
];

function crossAlert(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}${message ? '\n' + message : ''}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'OK', style: 'destructive', onPress: onConfirm },
    ]);
  }
}


export function SettingsScreen() {
  const { settings, updateSettings } = useStore();
  const { syncTasks } = useGoogleTasksSync();
  const { syncBirthdays } = useGoogleContactsBirthdaysSync();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [availableCalendars, setAvailableCalendars] = useState<Array<{ id: string; summary: string; primary?: boolean }>>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [loadingTasksSync, setLoadingTasksSync] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [showUncheckedCalendars, setShowUncheckedCalendars] = useState(false);
  const [showActiveCalendars, setShowActiveCalendars] = useState(false);
  const [tasksSyncResult, setTasksSyncResult] = useState<string | null>(null);

  // ── Familie ──────────────────────────────────────────────────────────────
  const { user } = useFirebaseAuth();
  const { familyId, meta, children: familyChildren } = useFamily();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leavingFamily, setLeavingFamily] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);

  // Kind-Modal
  const [childModal, setChildModal] = useState<{
    mode: 'add' | 'edit';
    child?: ChildConfig;
    name: string;
    color: string;
    emoji: string;
  } | null>(null);
  const [savingChild, setSavingChild] = useState(false);
  const [confirmDeleteChildId, setConfirmDeleteChildId] = useState<string | null>(null);
  // Taschengeld-Eingabe (TE-52): lokaler Roh-Text pro Kind, damit "5," beim
  // Tippen nicht sofort zu null geparst wird. Persistiert beim Verlassen des Felds.
  const [allowanceDrafts, setAllowanceDrafts] = useState<Record<string, string>>({});

  const handleAllowanceCommit = useCallback(async (child: ChildConfig, text: string) => {
    if (!familyId) return;
    const amount = parseAllowance(text);
    if (amount === (child.allowance ?? null)) return; // keine Änderung
    try {
      await setChildAllowance(familyId, child.id, amount);
    } catch (e: any) {
      Alert.alert('Fehler', e?.message ?? 'Taschengeld speichern fehlgeschlagen.');
    }
  }, [familyId]);

  useEffect(() => {
    if (!familyId) return;
    return subscribeToMembers(familyId, setMembers);
  }, [familyId]);

  const handleCopyCode = useCallback(() => {
    if (!meta?.code) return;
    Clipboard.setString(meta.code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }, [meta?.code]);

  const handleLeaveFamily = useCallback(async () => {
    if (!familyId || !user) return;
    setLeavingFamily(true);
    try {
      await leaveFamily(user.uid, familyId);
    } catch (e: any) {
      Alert.alert('Fehler', e?.message ?? 'Familie verlassen fehlgeschlagen.');
    } finally {
      setLeavingFamily(false);
      setConfirmLeave(false);
    }
  }, [familyId, user]);

  const openAddChild = useCallback(() => {
    setChildModal({ mode: 'add', name: '', color: CHILD_COLORS[0], emoji: '' });
  }, []);

  const openEditChild = useCallback((child: ChildConfig) => {
    setChildModal({ mode: 'edit', child, name: child.name, color: child.color, emoji: child.emoji ?? '' });
  }, []);

  const handleSaveChild = useCallback(async () => {
    if (!childModal || !familyId) return;
    const name = childModal.name.trim();
    if (!name) { Alert.alert('Name fehlt', 'Bitte einen Namen eingeben.'); return; }
    setSavingChild(true);
    try {
      const emoji = childModal.emoji.trim() || null;
      if (childModal.mode === 'add') {
        await addChild(familyId, name, childModal.color, emoji);
      } else if (childModal.child) {
        await updateChild(familyId, childModal.child.id, { name, color: childModal.color, emoji });
      }
      setChildModal(null);
    } catch (e: any) {
      Alert.alert('Fehler', e?.message ?? 'Speichern fehlgeschlagen.');
    } finally {
      setSavingChild(false);
    }
  }, [childModal, familyId]);

  const handleDeleteChild = useCallback((child: ChildConfig) => {
    crossAlert(
      `${child.name} löschen?`,
      'Alle Aufgaben und Daten dieses Kindes bleiben erhalten.',
      async () => {
        if (!familyId) return;
        try { await deleteChild(familyId, child.id); }
        catch (e: any) { Alert.alert('Fehler', e?.message ?? 'Löschen fehlgeschlagen.'); }
      }
    );
  }, [familyId]);

  // Kalender-Liste laden wenn verbunden
  React.useEffect(() => {
    if (settings.googleAccessToken && settings.googleCalendarEnabled) {
      setLoadingCalendars(true);
      listCalendars(settings.googleAccessToken)
        .then(setAvailableCalendars)
        .catch(() => {})
        .finally(() => setLoadingCalendars(false));
    }
  }, [settings.googleAccessToken, settings.googleCalendarEnabled]);

  const handleGoogleConnect = useCallback(async () => {
    setLoadingCalendar(true);
    try {
      const auth = await signInWithGoogle();
      if (!auth) {
        Alert.alert('Anmeldung fehlgeschlagen', 'Google-Login abgebrochen.');
        return;
      }

      const calendars = await listCalendars(auth.accessToken);
      if (calendars.length === 0) {
        Alert.alert(
          'Keine Kalender gefunden',
          'Bitte sicherstellen, dass die Google Calendar API im Projekt aktiviert ist und die nötigen Berechtigungen erteilt wurden.',
        );
        return;
      }

      const primary = calendars.find((c) => c.primary === true) ?? calendars[0];

      updateSettings({
        googleAccessToken: auth.accessToken,
        googleRefreshToken: auth.refreshToken,
        googleTokenExpiry: Date.now() + auth.expiresIn * 1000,
        googleCalendarEnabled: true,
        googleCalendarId: primary.id,
        googleCalendarName: primary.summary,
        googleNotesEnabled: true,
        googleBirthdaysEnabled: true,
      });

      // Prime the birthday data basis from Google Contacts with the fresh token.
      syncBirthdays(auth.accessToken).catch(() => {});

      if (calendars.length > 1) {
        Alert.alert(
          'Kalender auswählen',
          'Welchen Kalender soll die App verwenden?',
          calendars.map((c) => ({
            text: c.summary,
            onPress: () => updateSettings({ googleCalendarId: c.id }),
          }))
        );
      } else {
        Alert.alert('Verbunden', `Google Kalender "${primary.summary}" ist jetzt aktiv.`);
      }
    } catch (e) {
      console.error('[GoogleLogin] Fehler:', e);
      Alert.alert('Fehler', `Google-Login fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingCalendar(false);
    }
  }, [updateSettings, syncBirthdays]);

  const handleGoogleDisconnect = useCallback(() => {
    updateSettings({
      googleCalendarEnabled: false,
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      googleCalendarId: null,
      googleCalendarName: null,
      googleNotesEnabled: false,
      googleBirthdaysEnabled: false,
    });
    setConfirmDisconnect(false);
  }, [updateSettings]);

  const handleTasksSync = useCallback(async () => {
    setLoadingTasksSync(true);
    setTasksSyncResult(null);
    try {
      const result = await syncTasks();
      if (result === null) return;
      const { imported, updated, pushed } = result;
      const parts = [
        imported > 0 ? `${imported} importiert` : null,
        updated > 0 ? `${updated} aktualisiert` : null,
        pushed > 0 ? `${pushed} hochgeladen` : null,
        imported === 0 && updated === 0 && pushed === 0 ? 'Keine Änderungen' : null,
      ].filter(Boolean);
      setTasksSyncResult(parts.join(', '));
    } catch (e) {
      console.error('[TasksSync]', e);
      setTasksSyncResult('Fehler beim Sync');
    } finally {
      setLoadingTasksSync(false);
    }
  }, [syncTasks]);


  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Google Calendar */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Google Kalender</Text>

        {settings.googleCalendarEnabled ? (
          <>
            <View style={styles.row}>
              <Ionicons
                name={settings.googleCalendarId ? 'checkmark-circle' : 'warning-outline'}
                size={20}
                color={settings.googleCalendarId ? colors.success : colors.warning}
              />
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>
                  {settings.googleCalendarId ? 'Verbunden' : 'Verbindung unvollständig'}
                </Text>
                {settings.googleCalendarId ? (
                  <Text style={styles.rowSubtitle}>
                    {settings.googleCalendarName ?? settings.googleCalendarId}
                  </Text>
                ) : (
                  <Text style={[styles.rowSubtitle, { color: colors.warning }]}>
                    Kein Kalender ausgewählt — bitte erneut verbinden.
                  </Text>
                )}
              </View>
            </View>
            {!settings.googleCalendarId ? (
              <Pressable
                style={({ pressed }) => [styles.connectBtn, pressed && { opacity: 0.8 }]}
                onPress={handleGoogleConnect}
                disabled={loadingCalendar}
              >
                {loadingCalendar ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={18} color="#fff" />
                    <Text style={styles.connectBtnText}>Erneut verbinden</Text>
                  </>
                )}
              </Pressable>
            ) : null}
            {settings.googleCalendarId ? (
              <Pressable
                style={({ pressed }) => [styles.syncBtn, pressed && { opacity: 0.8 }, loadingTasksSync && { opacity: 0.6 }]}
                onPress={handleTasksSync}
                disabled={loadingTasksSync}
              >
                {loadingTasksSync ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="sync-outline" size={16} color="#fff" />
                    <Text style={styles.syncBtnText}>Aufgaben synchronisieren</Text>
                  </>
                )}
              </Pressable>
            ) : null}
            {tasksSyncResult ? (
              <View style={[styles.row, { backgroundColor: colors.surfaceHigh }]}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={[styles.rowSubtitle, { flex: 1 }]}>{tasksSyncResult}</Text>
                <Pressable onPress={() => setTasksSyncResult(null)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            ) : null}
            {/* Kalender-Auswahl für Dashboard */}
            {availableCalendars.length > 0 && (
              <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                <Text style={[styles.rowTitle, { marginBottom: 2 }]}>Im Dashboard anzeigen</Text>
                <Text style={styles.rowSubtitle}>Wähle welche Kalender auf dem Dashboard erscheinen</Text>
                {loadingCalendars ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (() => {
                  const selectedIds = settings.selectedCalendarIds ?? [];
                  const checked = availableCalendars.filter((c) => selectedIds.includes(c.id));
                  const unchecked = availableCalendars.filter((c) => !selectedIds.includes(c.id));
                  const visible = showUncheckedCalendars ? availableCalendars : checked;
                  return (
                    <>
                      <Pressable
                        style={({ pressed }) => [styles.calendarPickerRow, pressed && { opacity: 0.7 }]}
                        onPress={() => setShowActiveCalendars((v) => !v)}
                      >
                        <Ionicons
                          name={showActiveCalendars ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={colors.textSecondary}
                        />
                        <Text style={[styles.rowSubtitle, { flex: 1 }]}>
                          {showActiveCalendars
                            ? 'Weniger anzeigen'
                            : checked.length > 0
                              ? `${checked.length} aktiver Kalender`
                              : 'Kalender auswählen'}
                        </Text>
                      </Pressable>
                      {showActiveCalendars && (
                        <>
                          {visible.map((cal) => {
                            const selected = selectedIds.includes(cal.id);
                            return (
                              <Pressable
                                key={cal.id}
                                style={({ pressed }) => [styles.calendarPickerRow, pressed && { opacity: 0.7 }]}
                                onPress={() => {
                                  const next = selected
                                    ? selectedIds.filter((id) => id !== cal.id)
                                    : [...selectedIds, cal.id];
                                  updateSettings({ selectedCalendarIds: next });
                                }}
                              >
                                <Ionicons
                                  name={selected ? 'checkbox' : 'square-outline'}
                                  size={20}
                                  color={selected ? colors.accent : colors.textSecondary}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.rowTitle, { fontSize: 14 }]} numberOfLines={1}>{cal.summary}</Text>
                                  {cal.primary && <Text style={styles.rowSubtitle}>Primär</Text>}
                                </View>
                              </Pressable>
                            );
                          })}
                          {unchecked.length > 0 && (
                            <Pressable
                              style={({ pressed }) => [styles.calendarPickerRow, pressed && { opacity: 0.7 }]}
                              onPress={() => setShowUncheckedCalendars((v) => !v)}
                            >
                              <Ionicons
                                name={showUncheckedCalendars ? 'chevron-up' : 'chevron-down'}
                                size={16}
                                color={colors.textSecondary}
                              />
                              <Text style={[styles.rowSubtitle, { flex: 1 }]}>
                                {showUncheckedCalendars
                                  ? 'Weniger anzeigen'
                                  : `${unchecked.length} weitere Kalender anzeigen`}
                              </Text>
                            </Pressable>
                          )}
                        </>
                      )}
                    </>
                  );
                })()}
                {(settings.selectedCalendarIds ?? []).length === 0 && (
                  <Text style={[styles.rowSubtitle, { fontStyle: 'italic' }]}>Alle Kalender werden angezeigt</Text>
                )}
              </View>
            )}

            {confirmDisconnect ? (
              <View style={styles.confirmRow}>
                <Text style={[styles.rowSubtitle, { flex: 1, color: colors.danger }]}>
                  Kalender-Verbindung wirklich trennen?
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.confirmBtn, { backgroundColor: colors.danger }, pressed && { opacity: 0.7 }]}
                  onPress={handleGoogleDisconnect}
                >
                  <Text style={styles.confirmBtnText}>Trennen</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.confirmBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                  onPress={() => setConfirmDisconnect(false)}
                >
                  <Text style={[styles.confirmBtnText, { color: colors.text }]}>Abbrechen</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setConfirmDisconnect(true)}
              >
                <Ionicons name="log-out-outline" size={16} color={colors.danger} />
                <Text style={[styles.dangerBtnText, { color: colors.danger }]}>Google Kalender trennen</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <View style={styles.calendarInfo}>
              <Ionicons name="calendar-outline" size={32} color={colors.accent} />
              <Text style={styles.calendarInfoText}>
                Verbinde deinen Google-Account, um Tasks mit Fälligkeitsdaten automatisch als Kalendereinträge zu speichern.
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.connectBtn,
                loadingCalendar && styles.connectBtnDisabled,
                pressed && !loadingCalendar && { opacity: 0.8 },
              ]}
              onPress={handleGoogleConnect}
              disabled={loadingCalendar}
            >
              {loadingCalendar ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color="#fff" />
                  <Text style={styles.connectBtnText}>Mit Google anmelden</Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </View>


      {/* Familie */}
      {familyId && (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Familie</Text>

          {/* Code */}
          <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} onPress={() => handleCopyCode()}>
            <Ionicons name="key-outline" size={20} color={colors.accentNeon} />
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Familiencode</Text>
              <Text style={[styles.rowSubtitle, { fontFamily: 'monospace' }]}>{meta?.code ?? '…'}</Text>
            </View>
            <Ionicons name={codeCopied ? 'checkmark' : 'copy-outline'} size={18} color={colors.textSecondary} />
          </Pressable>

          {/* Mitglieder */}
          {members.length > 0 && (
            <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
              <Text style={styles.rowTitle}>Mitglieder</Text>
              {members.map((m) => (
                <View key={m.uid} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="person-circle-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.rowSubtitle}>{m.displayName}</Text>
                  {m.uid === user?.uid && (
                    <Text style={[styles.rowSubtitle, { color: colors.accentNeon }]}>(du)</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Kinder verwalten */}
          <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' as any }}>
              <Text style={styles.rowTitle}>Kinder</Text>
              <Pressable
                style={({ pressed }) => [styles.smallBtn, pressed && { opacity: 0.7 }]}
                onPress={openAddChild}
              >
                <Ionicons name="add" size={16} color={colors.accentFg} />
                <Text style={styles.smallBtnText}>Hinzufügen</Text>
              </Pressable>
            </View>
            {familyChildren.length === 0 && (
              <Text style={[styles.rowSubtitle, { fontStyle: 'italic' }]}>Noch keine Kinder angelegt.</Text>
            )}
            {familyChildren.map((child) => (
              <View key={child.id} style={{ width: '100%' as any, gap: 4 }}>
                <View style={styles.childManageRow}>
                  <View style={[styles.childColorDot, { backgroundColor: child.color }]}>
                    <Text style={styles.childColorDotText}>{child.emoji ?? child.name.charAt(0)}</Text>
                  </View>
                  <Text style={[styles.rowTitle, { flex: 1, fontSize: 14 }]}>{child.name}</Text>
                  <Pressable
                    style={({ pressed }) => [{ padding: 6 }, pressed && { opacity: 0.6 }]}
                    onPress={() => openEditChild(child)}
                  >
                    <Ionicons name="pencil-outline" size={18} color={colors.accentNeon} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [{ padding: 6 }, pressed && { opacity: 0.6 }]}
                    onPress={() => handleDeleteChild(child)}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
                <TextInput
                  style={[styles.settingInput, { marginLeft: 44, fontSize: 12 }]}
                  placeholder="E-Mail für Benachrichtigungen"
                  placeholderTextColor={colors.placeholder}
                  value={settings.childEmails?.[child.id] ?? ''}
                  onChangeText={(v) =>
                    updateSettings({ childEmails: { ...settings.childEmails, [child.id]: v } })
                  }
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {/* Taschengeld pro Monat (TE-52) */}
                <View style={styles.allowanceRow}>
                  <Ionicons name="cash-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.rowSubtitle, { flex: 1 }]}>Taschengeld / Monat</Text>
                  <TextInput
                    style={[styles.settingInput, styles.allowanceInput]}
                    placeholder="0"
                    placeholderTextColor={colors.placeholder}
                    value={allowanceDrafts[child.id] ?? (child.allowance != null ? String(child.allowance) : '')}
                    onChangeText={(v) => setAllowanceDrafts((d) => ({ ...d, [child.id]: v }))}
                    onEndEditing={(e) => handleAllowanceCommit(child, e.nativeEvent.text)}
                    onBlur={() => handleAllowanceCommit(child, allowanceDrafts[child.id] ?? '')}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.rowSubtitle}>€</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Eltern-PIN (TE-60) */}
          <View style={[styles.row, { gap: 8 }]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.accentNeon} />
            <View style={[styles.rowContent, { flex: 1 }]}>
              <Text style={styles.rowTitle}>Eltern-PIN</Text>
              <Text style={styles.rowSubtitle}>
                {settings.parentPin ? 'Individueller PIN gesetzt' : 'Kein PIN gesetzt – Fallback ist "1234"'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <TextInput
                  style={[styles.settingInput, { flex: 1 }]}
                  value={settings.parentPin ?? ''}
                  onChangeText={(v) => updateSettings({ parentPin: v.trim() === '' ? null : v.trim() })}
                  placeholder="z.B. 9876"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry={!pinVisible}
                  keyboardType="number-pad"
                  maxLength={8}
                />
                <Pressable onPress={() => setPinVisible((v) => !v)} style={{ padding: 6 }}>
                  <Ionicons
                    name={pinVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          {/* Familie verlassen */}
          {confirmLeave ? (
            <View style={styles.confirmRow}>
              <Text style={[styles.rowSubtitle, { flex: 1, color: colors.danger }]}>
                Familie wirklich verlassen?
              </Text>
              <Pressable
                style={({ pressed }) => [styles.confirmBtn, { backgroundColor: colors.danger }, pressed && { opacity: 0.7 }]}
                onPress={handleLeaveFamily}
                disabled={leavingFamily}
              >
                {leavingFamily
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.confirmBtnText}>Verlassen</Text>
                }
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.confirmBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                onPress={() => setConfirmLeave(false)}
              >
                <Text style={[styles.confirmBtnText, { color: colors.text }]}>Abbrechen</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setConfirmLeave(true)}
            >
              <Ionicons name="exit-outline" size={16} color={colors.danger} />
              <Text style={[styles.dangerBtnText, { color: colors.danger }]}>Familie verlassen</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Kind-Modal (Hinzufügen / Bearbeiten) */}
      <Modal visible={!!childModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setChildModal(null)}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {childModal?.mode === 'add' ? 'Kind hinzufügen' : 'Kind bearbeiten'}
            </Text>

            <Text style={[styles.rowSubtitle, { marginBottom: 4 }]}>Name</Text>
            <TextInput
              style={styles.settingInput}
              value={childModal?.name ?? ''}
              onChangeText={(v) => setChildModal((m) => m ? { ...m, name: v } : m)}
              placeholder="z.B. Lenny"
              placeholderTextColor={colors.placeholder}
              autoFocus
            />

            <Text style={[styles.rowSubtitle, { marginTop: 12, marginBottom: 4 }]}>Emoji (optional)</Text>
            <TextInput
              style={styles.settingInput}
              value={childModal?.emoji ?? ''}
              onChangeText={(v) => setChildModal((m) => m ? { ...m, emoji: v } : m)}
              placeholder="z.B. 🦁"
              placeholderTextColor={colors.placeholder}
            />

            <Text style={[styles.rowSubtitle, { marginTop: 12, marginBottom: 6 }]}>Farbe</Text>
            <View style={styles.colorGrid}>
              {CHILD_COLORS.map((clr) => (
                <Pressable
                  key={clr}
                  style={[
                    styles.colorDot,
                    { backgroundColor: clr },
                    childModal?.color === clr && styles.colorDotSelected,
                  ]}
                  onPress={() => setChildModal((m) => m ? { ...m, color: clr } : m)}
                >
                  {childModal?.color === clr && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [styles.connectBtn, { marginTop: 16 }, pressed && { opacity: 0.8 }, savingChild && { opacity: 0.6 }]}
              onPress={handleSaveChild}
              disabled={savingChild}
            >
              {savingChild
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.connectBtnText}>Speichern</Text>
              }
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>


      {/* Fokus-Kachel (TE-10/TE-14) – Mehrfachauswahl */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Fokus-Kachel</Text>
        <Text style={[styles.rowSubtitle, { paddingHorizontal: 4, marginBottom: 6 }]}>
          Ein oder mehrere Themen wählen – pro Thema erscheint ein Icon neben den Geistesblitzen.
        </Text>
        {FUN_TILE_OPTIONS.map((opt) => {
          const selected = settings.funTileThemes ?? [];
          const active = selected.includes(opt.key);
          return (
            <Pressable
              key={opt.key}
              style={({ pressed }) => [styles.themeRow, active && styles.themeRowActive, pressed && { opacity: 0.85 }]}
              onPress={() => updateSettings({
                funTileThemes: active
                  ? selected.filter((t) => t !== opt.key)
                  : [...selected, opt.key],
              })}
            >
              <View style={[styles.themePreview, { backgroundColor: opt.color, borderColor: opt.color, alignItems: 'center', paddingLeft: 0 }]}>
                <Ionicons name={opt.icon} size={18} color="#FFFFFF" />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>{opt.label}</Text>
              </View>
              {active
                ? <Ionicons name="checkmark-circle" size={22} color={colors.accentNeon} />
                : <Ionicons name="ellipse-outline" size={22} color={colors.textMuted} />}
            </Pressable>
          );
        })}
      </View>

      {/* E-Mail (TE-37) */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>E-Mail</Text>
        <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
          <View style={{ width: '100%' as any }}>
            <Text style={styles.rowTitle}>Zeitfenster</Text>
            <Text style={styles.rowSubtitle}>
              Nur Mails der letzten {settings.mailWindowDays} Tage anzeigen.
            </Text>
          </View>
          <View style={styles.thresholdButtons}>
            {MAIL_WINDOW_OPTIONS.map((days) => {
              const active = settings.mailWindowDays === days;
              return (
                <Pressable
                  key={days}
                  style={({ pressed }) => [
                    styles.thresholdBtn,
                    active && styles.thresholdBtnActive,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => updateSettings({ mailWindowDays: days })}
                >
                  <Text style={[styles.thresholdBtnText, active && styles.thresholdBtnTextActive]}>
                    {days} Tage
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Dashboard-Blöcke (TE-77) */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Dashboard</Text>
        <Text style={[styles.rowSubtitle, { paddingHorizontal: 4, marginBottom: 6 }]}>
          Welche Blöcke auf dem Dashboard angezeigt werden.
        </Text>
        {DASHBOARD_BLOCKS.map((block) => {
          const active = (settings.dashboardBlocks ?? DEFAULT_DASHBOARD_BLOCKS)[block.key] !== false;
          return (
            <Pressable
              key={block.key}
              style={({ pressed }) => [styles.themeRow, active && styles.themeRowActive, pressed && { opacity: 0.85 }]}
              onPress={() => updateSettings({
                dashboardBlocks: {
                  ...DEFAULT_DASHBOARD_BLOCKS,
                  ...settings.dashboardBlocks,
                  [block.key]: !active,
                },
              })}
            >
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>{block.label}</Text>
                <Text style={styles.rowSubtitle}>{block.description}</Text>
              </View>
              {active
                ? <Ionicons name="checkmark-circle" size={22} color={colors.accentNeon} />
                : <Ionicons name="ellipse-outline" size={22} color={colors.textMuted} />}
            </Pressable>
          );
        })}
      </View>

      {/* Darstellung */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Darstellung</Text>
        {THEME_OPTIONS.map((opt) => {
          const tc = THEMES[opt.key];
          const active = settings.theme === opt.key;
          return (
            <Pressable
              key={opt.key}
              style={({ pressed }) => [styles.themeRow, active && styles.themeRowActive, pressed && { opacity: 0.85 }]}
              onPress={() => updateSettings({ theme: opt.key })}
            >
              <View style={[styles.themePreview, { backgroundColor: tc.background, borderColor: tc.border }]}>
                <View
                  style={[
                    styles.themePreviewBar,
                    { backgroundColor: tc.accentNeon },
                    // Nur das Neon-Theme zeigt im Mini-Preview einen Glow.
                    opt.key === 'dark-mono' && { shadowColor: '#FFFFFF', shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
                  ]}
                />
                <View style={[styles.themePreviewDot, { backgroundColor: tc.success }]} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>{opt.label}</Text>
                <Text style={styles.rowSubtitle}>{opt.description}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={22} color={colors.accentNeon} />}
            </Pressable>
          );
        })}
      </View>

      {/* App info */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>App</Text>
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Version</Text>
          <Text style={styles.rowValue}>1.0.0</Text>
        </View>
        {user && (
          <Pressable
            style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.7 }]}
            onPress={() => crossAlert('Abmelden?', '', () => signOutFirebase().catch(() => {}))}
          >
            <Ionicons name="log-out-outline" size={16} color={colors.danger} />
            <Text style={[styles.dangerBtnText, { color: colors.danger }]}>Abmelden</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, gap: 24, paddingBottom: 60 },
    section: { gap: 2 },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: 4,
      marginBottom: 6,
    },
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      borderRadius: 12,
      marginBottom: 2,
      borderWidth: 1,
      borderColor: c.border,
    },
    themeRowActive: {
      borderColor: c.accentNeon,
      borderWidth: 1.5,
    },
    themePreview: {
      width: 44,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'flex-start',
      paddingLeft: 6,
      gap: 4,
    },
    themePreviewBar: {
      width: 24,
      height: 5,
      borderRadius: 2,
    },
    themePreviewDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      borderRadius: 12,
      marginBottom: 2,
    },
    rowContent: { flex: 1 },
    rowTitle: { fontSize: 15, color: c.text },
    rowSubtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    rowValue: { fontSize: 15, color: c.textSecondary },
    settingInput: {
      fontSize: 14, color: c.text, backgroundColor: c.inputBackground,
      borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6,
    },
    thresholdButtons: { flexDirection: 'row', gap: 6 },
    thresholdBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceHigh,
    },
    thresholdBtnActive: { backgroundColor: c.accent, borderColor: c.accent },
    thresholdBtnText: { fontSize: 12, color: c.textSecondary },
    thresholdBtnTextActive: { color: c.accentFg, fontWeight: '600' },
    calendarInfo: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    calendarInfoText: {
      fontSize: 14,
      color: c.text,
      textAlign: 'center',
      lineHeight: 20,
    },
    connectBtn: {
      backgroundColor: '#4285F4',
      borderRadius: 12,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    connectBtnDisabled: { opacity: 0.6 },
    connectBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    dangerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
      backgroundColor: c.surface,
    },
    dangerBtnText: { fontSize: 15, fontWeight: '500' },
    confirmRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
      backgroundColor: c.surface,
    },
    confirmBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
    },
    confirmBtnText: { fontSize: 14, fontWeight: '600', color: c.dangerFg },
    syncBtn: {
      backgroundColor: c.accent,
      borderRadius: 12,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    syncBtnText: { color: c.accentFg, fontSize: 14, fontWeight: '600' },
    calendarPickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
      width: '100%' as any,
    },
    // Familie-Verwaltung
    smallBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.accent,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    smallBtnText: { fontSize: 13, fontWeight: '600', color: c.accentFg },
    childManageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '100%' as any,
    },
    childColorDot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    childColorDotText: { fontSize: 14 },
    // Taschengeld-Zeile (TE-52)
    allowanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginLeft: 44,
      marginTop: 4,
    },
    allowanceInput: {
      width: 70,
      textAlign: 'right',
      fontSize: 13,
    },
    // Kind-Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 24,
    },
    modalBox: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 20,
      gap: 4,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 8 },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    colorDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorDotSelected: {
      borderWidth: 2.5,
      borderColor: '#fff',
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
  });
}
