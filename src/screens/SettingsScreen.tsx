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
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { useTheme, ThemeColors, neonGlow } from '../utils/theme';
import { MAIL_WINDOW_OPTIONS, DASHBOARD_BLOCKS, DEFAULT_DASHBOARD_BLOCKS, TOGGLEABLE_TABS, DEFAULT_VISIBLE_TABS } from '../types';

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
  FamilyMember, ChildConfig, JoinRequest,
  subscribeToMembers, leaveFamily,
  addChild, updateChild, deleteChild,
  subscribeToJoinRequests, approveJoinRequest, denyJoinRequest, setFuerUnsAccess,
  setMemberRole, syncChildLoginEmail,
} from '../services/family';
import {
  setChildAllowance, setAllowanceOverride, subscribeToAllowanceMonths,
  monthKey, formatMonthLabel, AllowanceMonth,
} from '../services/allowance';
import { parseTeamIdFromUrl } from '../services/fussballDe';

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
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leavingFamily, setLeavingFamily] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [besteSchuleTokenVisible, setBesteSchuleTokenVisible] = useState(false);

  // Kind-Modal
  const [childModal, setChildModal] = useState<{
    mode: 'add' | 'edit';
    child?: ChildConfig;
    name: string;
    color: string;
    emoji: string;
    email: string;
  } | null>(null);
  const [savingChild, setSavingChild] = useState(false);
  const [confirmDeleteChildId, setConfirmDeleteChildId] = useState<string | null>(null);
  // Taschengeld-Eingabe (TE-52): lokaler Roh-Text pro Kind, damit "5," beim
  // Tippen nicht sofort zu null geparst wird. Persistiert beim Verlassen des Felds.
  const [allowanceDrafts, setAllowanceDrafts] = useState<Record<string, string>>({});
  // Monats-Korrektur (TE-154): Echtzeit-Stand + lokale Roh-Eingaben pro Kind.
  const currentMonth = monthKey();
  const [allowanceMonthsByChild, setAllowanceMonthsByChild] =
    useState<Record<string, Record<string, AllowanceMonth>>>({});
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, string>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  // Schiedsrichter-Abschnitt (TE-85): freier Text pro Kind, editierbar.
  const [refereeDrafts, setRefereeDrafts] = useState<Record<string, string>>({});

  const handleRefereeCommit = useCallback(async (child: ChildConfig, text: string) => {
    if (!familyId) return;
    const value = text.trim() || null;
    if (value === (child.refereeInfo ?? null)) return; // keine Änderung
    try {
      await updateChild(familyId, child.id, { refereeInfo: value });
    } catch (e: any) {
      Alert.alert('Fehler', e?.message ?? 'Schiedsrichter-Info speichern fehlgeschlagen.');
    }
  }, [familyId]);

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

  // Korrektur für den laufenden Monat schreiben. Leer oder == regulärer Betrag
  // → Korrektur entfernen; sonst als Override speichern.
  const handleOverrideCommit = useCallback(async (child: ChildConfig) => {
    if (!familyId) return;
    const touchedAmount = overrideDrafts[child.id] !== undefined;
    const touchedReason = reasonDrafts[child.id] !== undefined;
    if (!touchedAmount && !touchedReason) return; // nichts angefasst
    const existing = allowanceMonthsByChild[child.id]?.[currentMonth];
    const configured = child.allowance ?? 0;
    // Betrag: aus Eingabe, sonst bestehende Korrektur behalten. Betrag == regulär → keine Korrektur.
    let override: number | null;
    if (touchedAmount) {
      const amount = parseAllowance(overrideDrafts[child.id]);
      override = amount != null && amount !== configured ? amount : null;
    } else {
      override = existing?.overrideAmount ?? null;
    }
    const reason = touchedReason
      ? ((reasonDrafts[child.id] ?? '').trim() || null)
      : (existing?.overrideReason ?? null);
    if ((existing?.overrideAmount ?? null) === override
        && (existing?.overrideReason ?? null) === reason) return; // keine Änderung
    try {
      await setAllowanceOverride(familyId, child.id, currentMonth, override, reason);
    } catch (e: any) {
      Alert.alert('Fehler', e?.message ?? 'Korrektur speichern fehlgeschlagen.');
    }
  }, [familyId, overrideDrafts, reasonDrafts, allowanceMonthsByChild, currentMonth]);

  useEffect(() => {
    if (!familyId) return;
    return subscribeToMembers(familyId, setMembers);
  }, [familyId]);

  // TE-59: offene Beitrittsanfragen für bestehende Mitglieder.
  useEffect(() => {
    if (!familyId) return;
    return subscribeToJoinRequests(familyId, setJoinRequests);
  }, [familyId]);

  const fuerUnsUids = meta?.fuerUnsUids ?? [];
  const iAmFuerUnsMember = !!user && fuerUnsUids.includes(user.uid);
  const iAmParent = members.find((m) => m.uid === user?.uid)?.role === 'parent';

  const handleToggleRole = useCallback((member: FamilyMember) => {
    if (!familyId) return;
    const nextRole = member.role === 'parent' ? 'child' : 'parent';
    crossAlert(
      nextRole === 'child' ? `${member.displayName} als Kind einstufen?` : `${member.displayName} als Elternteil einstufen?`,
      nextRole === 'child'
        ? 'Verliert Zugriff auf Mitgliederverwaltung, Beitrittsanfragen und Kinder-Einstellungen.'
        : 'Bekommt vollen Zugriff wie ein Elternteil.',
      () => {
        setMemberRole(familyId, member.uid, nextRole).catch((e: any) =>
          Alert.alert('Fehler', e?.message ?? 'Rolle konnte nicht geändert werden.'));
      }
    );
  }, [familyId]);

  const handleApproveJoin = useCallback((request: JoinRequest) => {
    if (!familyId || !user) return;
    // Erste zwei "Für uns"-Berechtigte werden automatisch übernommen (der
    // typische Fall: der Partner tritt bei) – jedes weitere Mitglied braucht
    // eine bewusste, separate Freigabe über den Herz-Schalter unten.
    const grantFuerUns = fuerUnsUids.length < 2;
    approveJoinRequest(familyId, request.uid, user.uid, grantFuerUns).then(() => {
      Alert.alert(
        'Bestätigt',
        grantFuerUns
          ? `${request.displayName} ist jetzt Mitglied und hat Zugriff auf "Für uns".`
          : `${request.displayName} ist jetzt Mitglied.`
      );
    }).catch((e: any) => Alert.alert('Fehler', e?.message ?? 'Bestätigen fehlgeschlagen.'));
  }, [familyId, user, fuerUnsUids]);

  const handleDenyJoin = useCallback((request: JoinRequest) => {
    if (!familyId) return;
    denyJoinRequest(familyId, request.uid).catch((e: any) =>
      Alert.alert('Fehler', e?.message ?? 'Ablehnen fehlgeschlagen.'));
  }, [familyId]);

  const handleToggleFuerUns = useCallback((targetUid: string, granted: boolean) => {
    if (!familyId) return;
    setFuerUnsAccess(familyId, targetUid, granted).catch((e: any) =>
      Alert.alert('Fehler', e?.message ?? 'Konnte nicht geändert werden.'));
  }, [familyId]);

  // Taschengeld-Monate pro Kind für die Korrektur-Anzeige (TE-154).
  useEffect(() => {
    if (!familyId || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToAllowanceMonths(familyId, child.id, (months) =>
        setAllowanceMonthsByChild((prev) => ({ ...prev, [child.id]: months }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [familyId, familyChildren]);

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
    setChildModal({ mode: 'add', name: '', color: CHILD_COLORS[0], emoji: '', email: '' });
  }, []);

  const openEditChild = useCallback((child: ChildConfig) => {
    setChildModal({
      mode: 'edit', child, name: child.name, color: child.color,
      emoji: child.emoji ?? '', email: settings.childEmails?.[child.id] ?? '',
    });
  }, [settings.childEmails]);

  const handleSaveChild = useCallback(async () => {
    if (!childModal || !familyId) return;
    const name = childModal.name.trim();
    if (!name) { Alert.alert('Name fehlt', 'Bitte einen Namen eingeben.'); return; }
    setSavingChild(true);
    try {
      const emoji = childModal.emoji.trim() || null;
      const email = childModal.email.trim() || null;
      let childId: string;
      let oldEmail: string | null = null;
      if (childModal.mode === 'add') {
        childId = await addChild(familyId, name, childModal.color, emoji);
      } else if (childModal.child) {
        childId = childModal.child.id;
        oldEmail = settings.childEmails?.[childId] ?? null;
        await updateChild(familyId, childId, { name, color: childModal.color, emoji });
      } else {
        return;
      }
      // EINE E-Mail pro Kind für beides: Aufgaben-Benachrichtigung UND
      // (via childEmails-Spiegelung) automatische Rollen-Erkennung beim Beitritt.
      // WICHTIG: immer synchronisieren, auch wenn sich der Wert nicht ändert –
      // schon vor dieser Funktion gesetzte Benachrichtigungs-E-Mails (Alt-
      // Feature) hatten nie einen passenden childEmails-Spiegel-Eintrag, ein
      // reiner "hat sich geändert"-Check hätte sie nie nachträglich angelegt.
      if (email || oldEmail) {
        updateSettings({ childEmails: { ...settings.childEmails, [childId]: email ?? '' } });
        await syncChildLoginEmail(familyId, childId, name, oldEmail, email);
      }
      setChildModal(null);
    } catch (e: any) {
      Alert.alert('Fehler', e?.message ?? 'Speichern fehlgeschlagen.');
    } finally {
      setSavingChild(false);
    }
  }, [childModal, familyId, settings.childEmails]);

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

          {/* Beitrittsanfragen (TE-59) */}
          {joinRequests.length > 0 && (
            <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
              <Text style={styles.rowTitle}>Beitrittsanfragen</Text>
              {joinRequests.map((r) => (
                <View key={r.uid} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' as any }}>
                  <Ionicons name="person-add-outline" size={18} color={colors.textSecondary} />
                  <Text style={[styles.rowSubtitle, { flex: 1 }]}>{r.displayName}</Text>
                  <Pressable onPress={() => handleDenyJoin(r)} style={({ pressed }) => [{ padding: 6 }, pressed && { opacity: 0.6 }]}>
                    <Ionicons name="close-circle-outline" size={22} color={colors.danger} />
                  </Pressable>
                  <Pressable onPress={() => handleApproveJoin(r)} style={({ pressed }) => [{ padding: 6 }, pressed && { opacity: 0.6 }]}>
                    <Ionicons name="checkmark-circle-outline" size={22} color={colors.accentNeon} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

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
                  {/* Rolle korrigieren – nur Eltern dürfen das, und nicht sich selbst versehentlich aussperren */}
                  {iAmParent && m.uid !== user?.uid && (
                    <Pressable
                      onPress={() => handleToggleRole(m)}
                      style={({ pressed }) => [styles.roleBadge, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={styles.roleBadgeText}>{m.role === 'parent' ? 'Elternteil' : 'Kind'}</Text>
                    </Pressable>
                  )}
                  {!iAmParent || m.uid === user?.uid ? (
                    <Text style={[styles.rowSubtitle, { fontSize: 11, color: colors.textSecondary }]}>
                      {m.role === 'parent' ? 'Elternteil' : 'Kind'}
                    </Text>
                  ) : null}
                  {/* TE-59: Zugriff auf "Für uns" – nur ändern kann, wer selbst drinsteht */}
                  <Pressable
                    disabled={!iAmFuerUnsMember}
                    onPress={() => handleToggleFuerUns(m.uid, !fuerUnsUids.includes(m.uid))}
                    style={({ pressed }) => [{ padding: 4 }, pressed && iAmFuerUnsMember && { opacity: 0.6 }]}
                  >
                    <Ionicons
                      name={fuerUnsUids.includes(m.uid) ? 'heart' : 'heart-outline'}
                      size={16}
                      color={fuerUnsUids.includes(m.uid) ? colors.accentNeon : colors.textSecondary}
                    />
                  </Pressable>
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

          {/* beste.schule-Anbindung: Stundenplan-Live-Sync */}
          <View style={[styles.row, { gap: 8 }]}>
            <Ionicons name="school-outline" size={20} color={colors.accentNeon} />
            <View style={[styles.rowContent, { flex: 1 }]}>
              <Text style={styles.rowTitle}>beste.schule</Text>
              <Text style={styles.rowSubtitle}>
                Zugriffstoken für den automatischen Stundenplan-Sync. Nur auf diesem Gerät gespeichert.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <TextInput
                  style={[styles.settingInput, { flex: 1 }]}
                  value={settings.besteSchuleToken ?? ''}
                  onChangeText={(v) => updateSettings({ besteSchuleToken: v.trim() === '' ? null : v.trim() })}
                  placeholder="Bearer-Token"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry={!besteSchuleTokenVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable onPress={() => setBesteSchuleTokenVisible((v) => !v)} style={{ padding: 6 }}>
                  <Ionicons
                    name={besteSchuleTokenVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>

              {familyChildren.length === 0 ? (
                <Text style={[styles.rowSubtitle, { fontStyle: 'italic', marginTop: 10 }]}>
                  Noch keine Kinder angelegt.
                </Text>
              ) : (
                familyChildren.map((child) => (
                  <View key={child.id} style={{ marginTop: 10 }}>
                    <Text style={[styles.rowSubtitle, { marginBottom: 4 }]}>
                      {child.emoji ? `${child.emoji} ` : ''}{child.name} · Schüler-ID
                    </Text>
                    <TextInput
                      style={styles.settingInput}
                      value={settings.besteSchuleStudentIds?.[child.id] ?? ''}
                      onChangeText={(v) =>
                        updateSettings({
                          besteSchuleStudentIds: { ...settings.besteSchuleStudentIds, [child.id]: v.trim() },
                        })
                      }
                      placeholder="leer = manuell pflegen (kein Sync)"
                      placeholderTextColor={colors.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ))
              )}
            </View>
          </View>

          {/* fussball.de-Anbindung: Vereinsspielplan pro Kind (öffentlich, kein Login nötig) */}
          <View style={[styles.row, { gap: 8 }]}>
            <Ionicons name="football-outline" size={20} color={colors.accentNeon} />
            <View style={[styles.rowContent, { flex: 1 }]}>
              <Text style={styles.rowTitle}>fussball.de</Text>
              <Text style={styles.rowSubtitle}>
                Mannschafts-URL von fussball.de einfügen, um den Spielplan zu synchronisieren. Öffentliche Daten, kein Login nötig.
              </Text>

              {familyChildren.length === 0 ? (
                <Text style={[styles.rowSubtitle, { fontStyle: 'italic', marginTop: 10 }]}>
                  Noch keine Kinder angelegt.
                </Text>
              ) : (
                familyChildren.map((child) => (
                  <View key={child.id} style={{ marginTop: 10 }}>
                    <Text style={[styles.rowSubtitle, { marginBottom: 4 }]}>
                      {child.emoji ? `${child.emoji} ` : ''}{child.name} · Mannschafts-URL
                    </Text>
                    <TextInput
                      style={styles.settingInput}
                      value={settings.fussballDeTeamIds?.[child.id] ?? ''}
                      onChangeText={(v) => {
                        const trimmed = v.trim();
                        const teamId = trimmed === '' ? '' : (parseTeamIdFromUrl(trimmed) ?? trimmed);
                        updateSettings({
                          fussballDeTeamIds: { ...settings.fussballDeTeamIds, [child.id]: teamId },
                        });
                      }}
                      placeholder="leer = kein Sync"
                      placeholderTextColor={colors.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ))
              )}
            </View>
          </View>

          {/* Kindergarten-Kinder: kein Stundenplan/Klassenbuch im Schule-Tab,
              nur der manuelle Eintrags-Strom (Infos/Termine/Aufgaben). */}
          <View style={[styles.row, { gap: 8 }]}>
            <Ionicons name="happy-outline" size={20} color={colors.accentNeon} />
            <View style={[styles.rowContent, { flex: 1 }]}>
              <Text style={styles.rowTitle}>Kindergarten</Text>
              <Text style={styles.rowSubtitle}>
                Für Kinder ohne Schulpflicht: kein Stundenplan/Klassenbuch im Schule-Tab, nur Infos, Termine und Aufgaben zum manuellen Pflegen.
              </Text>

              {familyChildren.length === 0 ? (
                <Text style={[styles.rowSubtitle, { fontStyle: 'italic', marginTop: 10 }]}>
                  Noch keine Kinder angelegt.
                </Text>
              ) : (
                familyChildren.map((child) => {
                  const active = !!settings.kindergartenChildIds?.[child.id];
                  return (
                    <Pressable
                      key={child.id}
                      style={({ pressed }) => [styles.themeRow, active && styles.themeRowActive, pressed && { opacity: 0.85 }, { marginTop: 8 }]}
                      onPress={() => updateSettings({
                        kindergartenChildIds: { ...settings.kindergartenChildIds, [child.id]: !active },
                      })}
                    >
                      <View style={styles.rowContent}>
                        <Text style={styles.rowTitle}>{child.emoji ? `${child.emoji} ` : ''}{child.name}</Text>
                      </View>
                      {active
                        ? <Ionicons name="checkmark-circle" size={22} color={colors.accentNeon} />
                        : <Ionicons name="ellipse-outline" size={22} color={colors.textMuted} />}
                    </Pressable>
                  );
                })
              )}
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

            <Text style={[styles.rowSubtitle, { marginTop: 12, marginBottom: 4 }]}>E-Mail (optional)</Text>
            <TextInput
              style={styles.settingInput}
              value={childModal?.email ?? ''}
              onChangeText={(v) => setChildModal((m) => m ? { ...m, email: v } : m)}
              placeholder="z.B. lenny@gmail.com"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Text style={[styles.rowSubtitle, { marginTop: 4, fontSize: 12 }]}>
              Dahin gehen die Aufgaben-Benachrichtigungen. Meldet sich jemand mit
              genau dieser Adresse in der App an, bekommt er/sie automatisch die
              eingeschränkte Kind-Rolle statt vollen Zugriff.
            </Text>

            {childModal?.mode === 'edit' && childModal.child && (
              <>
                <View style={[styles.allowanceRow, { marginTop: 12 }]}>
                  <Ionicons name="cash-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.rowSubtitle, { flex: 1 }]}>Taschengeld / Monat</Text>
                  <TextInput
                    style={[styles.settingInput, styles.allowanceInput]}
                    placeholder="0"
                    placeholderTextColor={colors.placeholder}
                    value={allowanceDrafts[childModal.child.id] ?? (childModal.child.allowance != null ? String(childModal.child.allowance) : '')}
                    onChangeText={(v) => setAllowanceDrafts((d) => ({ ...d, [childModal.child!.id]: v }))}
                    onEndEditing={(e) => handleAllowanceCommit(childModal.child!, e.nativeEvent.text)}
                    onBlur={() => handleAllowanceCommit(childModal.child!, allowanceDrafts[childModal.child!.id] ?? '')}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.rowSubtitle}>€</Text>
                </View>
                {(childModal.child.allowance ?? 0) > 0 && (
                  <>
                    <View style={styles.allowanceRow}>
                      <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
                      <Text style={[styles.rowSubtitle, { flex: 1 }]}>
                        Diesen Monat ({formatMonthLabel(currentMonth)})
                      </Text>
                      <TextInput
                        style={[styles.settingInput, styles.allowanceInput]}
                        placeholder={String(childModal.child.allowance ?? 0)}
                        placeholderTextColor={colors.placeholder}
                        value={
                          overrideDrafts[childModal.child.id] ??
                          (allowanceMonthsByChild[childModal.child.id]?.[currentMonth]?.overrideAmount != null
                            ? String(allowanceMonthsByChild[childModal.child.id][currentMonth].overrideAmount)
                            : '')
                        }
                        onChangeText={(v) => setOverrideDrafts((d) => ({ ...d, [childModal.child!.id]: v }))}
                        onEndEditing={() => handleOverrideCommit(childModal.child!)}
                        onBlur={() => handleOverrideCommit(childModal.child!)}
                        keyboardType="decimal-pad"
                      />
                      <Text style={styles.rowSubtitle}>€</Text>
                    </View>
                    <TextInput
                      style={[styles.settingInput, { marginTop: 4 }]}
                      placeholder="Grund (optional, z.B. geborgt)"
                      placeholderTextColor={colors.placeholder}
                      value={
                        reasonDrafts[childModal.child.id] ??
                        (allowanceMonthsByChild[childModal.child.id]?.[currentMonth]?.overrideReason ?? '')
                      }
                      onChangeText={(v) => setReasonDrafts((d) => ({ ...d, [childModal.child!.id]: v }))}
                      onEndEditing={() => handleOverrideCommit(childModal.child!)}
                      onBlur={() => handleOverrideCommit(childModal.child!)}
                    />
                  </>
                )}

                <Text style={[styles.rowSubtitle, { marginTop: 12, marginBottom: 4 }]}>
                  Schiedsrichter-Abschnitt (optional)
                </Text>
                <TextInput
                  style={[styles.settingInput, { minHeight: 90, textAlignVertical: 'top' }]}
                  value={refereeDrafts[childModal.child.id] ?? (childModal.child.refereeInfo ?? '')}
                  onChangeText={(v) => setRefereeDrafts((d) => ({ ...d, [childModal.child!.id]: v }))}
                  onBlur={() => handleRefereeCommit(childModal.child!, refereeDrafts[childModal.child!.id] ?? (childModal.child!.refereeInfo ?? ''))}
                  placeholder="z.B. Kontakt SR-Obmann, Lehrgangstermine …"
                  placeholderTextColor={colors.placeholder}
                  multiline
                />
                <Text style={[styles.rowSubtitle, { marginTop: 4, fontSize: 12 }]}>
                  Erscheint als eigener Abschnitt "Schiedsrichter" in der Kind-Ansicht. Leer lassen,
                  um den Abschnitt auszublenden.
                </Text>
              </>
            )}

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

      {/* Sichtbare Tabs (TE-49) */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Tabs</Text>
        <Text style={[styles.rowSubtitle, { paddingHorizontal: 4, marginBottom: 6 }]}>
          Welche Tabs zwischen Dashboard und Settings angezeigt werden.
        </Text>
        {TOGGLEABLE_TABS.map((tab) => {
          const active = (settings.visibleTabs ?? DEFAULT_VISIBLE_TABS)[tab.key] !== false;
          return (
            <Pressable
              key={tab.key}
              style={({ pressed }) => [styles.themeRow, active && styles.themeRowActive, pressed && { opacity: 0.85 }]}
              onPress={() => updateSettings({
                visibleTabs: {
                  ...DEFAULT_VISIBLE_TABS,
                  ...settings.visibleTabs,
                  [tab.key]: !active,
                },
              })}
            >
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>{tab.label}</Text>
                <Text style={styles.rowSubtitle}>{tab.description}</Text>
              </View>
              {active
                ? <Ionicons name="checkmark-circle" size={22} color={colors.accentNeon} />
                : <Ionicons name="ellipse-outline" size={22} color={colors.textMuted} />}
            </Pressable>
          );
        })}
      </View>

      {/* App info */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>App</Text>
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Version</Text>
          <Text style={styles.rowValue}>{Constants.expoConfig?.version ?? '2.0.0'}</Text>
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
    roleBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: c.accent,
    },
    roleBadgeText: { fontSize: 11, fontWeight: '600', color: c.accentFg },
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
