import React, { useState, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { Theme } from '../types';
import { useTheme, ThemeColors, THEMES, neonGlow } from '../utils/theme';
import {
  signInWithGoogle,
  listCalendars,
} from '../services/googleCalendar';
import { useGoogleTasksSync } from '../hooks/useGoogleTasksSync';
import { useGoogleDriveNotesSync } from '../hooks/useGoogleDriveNotesSync';
import { useGoogleContactsBirthdaysSync } from '../hooks/useGoogleContactsBirthdaysSync';

const THEME_OPTIONS: { value: Theme; label: string; subtitle: string }[] = [
  { value: 'light', label: 'Hell', subtitle: 'iOS-Standard, weißer Hintergrund' },
  { value: 'dark-neon', label: 'Dark Neon', subtitle: 'Dunkles Design mit Neon-Akzenten' },
  { value: 'dark-soft', label: 'Dark Soft', subtitle: 'Augenschonendes dunkles Design' },
  { value: 'dark-mono', label: 'Schwarz-Weiß', subtitle: 'Monochromes Neon-Design, Geburtstag bleibt bunt' },
  { value: 'light-mono', label: 'Negativ', subtitle: 'Komplettes Negativ von Schwarz-Weiß – hell statt dunkel, jede Farbe invertiert' },
];

export function SettingsScreen() {
  const { settings, updateSettings } = useStore();
  const { syncTasks } = useGoogleTasksSync();
  const { syncDriveNotes } = useGoogleDriveNotesSync();
  const { syncBirthdays } = useGoogleContactsBirthdaysSync();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [availableCalendars, setAvailableCalendars] = useState<Array<{ id: string; summary: string; primary?: boolean }>>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [loadingTasksSync, setLoadingTasksSync] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [tasksSyncResult, setTasksSyncResult] = useState<string | null>(null);

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

      // Initial push: sync notes to Drive with the fresh token right away,
      // bypassing any stale hook closure by passing the token explicitly.
      syncDriveNotes(auth.accessToken).catch(() => {});
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
  }, [updateSettings, syncDriveNotes, syncBirthdays]);

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

      {/* Theme */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Design</Text>
        {THEME_OPTIONS.map((opt) => {
          const themeColors = THEMES[opt.value];
          const isActive = (settings.theme ?? 'light') === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={({ pressed }) => [styles.themeRow, isActive && styles.themeRowActive, pressed && { opacity: 0.75 }]}
              onPress={() => updateSettings({ theme: opt.value })}
            >
              <View style={[styles.themePreview, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                <View style={[styles.themePreviewBar, { backgroundColor: themeColors.surface }]} />
                <View style={[styles.themePreviewDot, { backgroundColor: themeColors.accent }]} />
              </View>
              <View style={styles.rowContent}>
                <Text style={[styles.rowTitle, isActive && { color: colors.accentNeon, fontWeight: '600' }]}>
                  {opt.label}
                </Text>
                <Text style={styles.rowSubtitle}>{opt.subtitle}</Text>
              </View>
              {isActive ? <Ionicons name="checkmark-circle" size={20} color={colors.accentNeon} /> : null}
            </Pressable>
          );
        })}
      </View>

      {/* Auto-grouping */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Automatische Gruppierung</Text>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Gruppe automatisch vorschlagen</Text>
            <Text style={styles.rowSubtitle}>
              Beim Tippen eines Task-Titels wird die passende Gruppe erkannt
            </Text>
          </View>
          <Switch
            value={settings.autoGroupEnabled}
            onValueChange={(v) => updateSettings({ autoGroupEnabled: v })}
            trackColor={{ true: colors.success }}
          />
        </View>

        {settings.autoGroupEnabled ? (
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Erkennungs-Schwelle</Text>
              <Text style={styles.rowSubtitle}>
                Aktuell: {Math.round(settings.autoGroupConfidenceThreshold * 100)}% Übereinstimmung
              </Text>
            </View>
            <View style={styles.thresholdButtons}>
              {[0.2, 0.4, 0.6].map((val) => (
                <Pressable
                  key={val}
                  style={({ pressed }) => [
                    styles.thresholdBtn,
                    settings.autoGroupConfidenceThreshold === val && styles.thresholdBtnActive,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => updateSettings({ autoGroupConfidenceThreshold: val })}
                >
                  <Text
                    style={[
                      styles.thresholdBtnText,
                      settings.autoGroupConfidenceThreshold === val && styles.thresholdBtnTextActive,
                    ]}
                  >
                    {val === 0.2 ? 'Niedrig' : val === 0.4 ? 'Mittel' : 'Hoch'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>

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
                ) : (
                  availableCalendars.map((cal) => {
                    const selected = (settings.selectedCalendarIds ?? []).includes(cal.id);
                    return (
                      <Pressable
                        key={cal.id}
                        style={({ pressed }) => [styles.calendarPickerRow, pressed && { opacity: 0.7 }]}
                        onPress={() => {
                          const current = settings.selectedCalendarIds ?? [];
                          const next = selected
                            ? current.filter((id) => id !== cal.id)
                            : [...current, cal.id];
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
                  })
                )}
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


      {/* Kinder E-Mail-Adressen */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Kinder E-Mail-Adressen</Text>
        <Text style={[styles.rowValue, { fontSize: 12, marginBottom: 4 }]}>
          Gmail-Adressen für Benachrichtigungen beim Erstellen von Kinder-Aufgaben.
        </Text>
        {(['lenny', 'emil', 'hannes', 'liddy'] as const).map((childId) => (
          <View key={childId} style={styles.row}>
            <Text style={[styles.rowTitle, { flex: 1 }]}>
              {childId.charAt(0).toUpperCase() + childId.slice(1)}
            </Text>
            <TextInput
              style={[styles.settingInput, { flex: 2 }]}
              placeholder="gmail@gmail.com"
              placeholderTextColor={colors.placeholder}
              value={settings.childEmails?.[childId] ?? ''}
              onChangeText={(v) =>
                updateSettings({ childEmails: { ...settings.childEmails, [childId]: v } })
              }
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        ))}
      </View>

      {/* App info */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>App</Text>
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Version</Text>
          <Text style={styles.rowValue}>1.0.0</Text>
        </View>
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
  });
}
