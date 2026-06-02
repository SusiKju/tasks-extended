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
  Modal,
  TouchableOpacity,
} from 'react-native';
import uuid from 'react-native-uuid';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { DateFormat, Theme, Group } from '../types';
import { DATE_FORMAT_LABELS } from '../utils/dateFormat';
import { useTheme, ThemeColors, THEMES, neonGlow } from '../utils/theme';

const PRESET_COLORS = [
  '#4F86F7', '#34C759', '#FF9500', '#FF3B30',
  '#AF52DE', '#FF2D55', '#5AC8FA', '#FFCC00',
  '#5856D6', '#32ADE6',
];

interface GroupFormState {
  name: string;
  color: string;
  keywords: string;
}

const EMPTY_GROUP_FORM: GroupFormState = { name: '', color: PRESET_COLORS[0], keywords: '' };
import {
  signInWithGoogle,
  listCalendars,
} from '../services/googleCalendar';
import { useGoogleTasksSync } from '../hooks/useGoogleTasksSync';
import { useGoogleDriveNotesSync } from '../hooks/useGoogleDriveNotesSync';
import { useGoogleContactsBirthdaysSync } from '../hooks/useGoogleContactsBirthdaysSync';
import { importKeepTakeout } from '../utils/importKeepTakeout';

const DATE_FORMATS: DateFormat[] = ['de', 'us', 'iso', 'relative'];
const THEME_OPTIONS: { value: Theme; label: string; subtitle: string }[] = [
  { value: 'light', label: 'Hell', subtitle: 'iOS-Standard, weißer Hintergrund' },
  { value: 'dark-neon', label: 'Dark Neon', subtitle: 'Dunkles Design mit Neon-Akzenten' },
  { value: 'dark-soft', label: 'Dark Soft', subtitle: 'Augenschonendes dunkles Design' },
  { value: 'dark-mono', label: 'Schwarz-Weiß', subtitle: 'Monochromes Neon-Design, Geburtstag bleibt bunt' },
];

const DEFAULT_NOTE_COLOR = '#F0C040';

function generateId() {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function SettingsScreen() {
  const { settings, notes, groups, tasks, updateSettings, addNote, updateNote, deleteNote, clearNotes, addGroup, updateGroup, deleteGroup } = useStore();
  const { syncTasks } = useGoogleTasksSync();
  const { syncDriveNotes } = useGoogleDriveNotesSync();
  const { syncBirthdays } = useGoogleContactsBirthdaysSync();
  const { colors, mono } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [availableCalendars, setAvailableCalendars] = useState<Array<{ id: string; summary: string; primary?: boolean }>>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [loadingKeepImport, setLoadingKeepImport] = useState(false);
  const [loadingTasksSync, setLoadingTasksSync] = useState(false);
  const [loadingNotesSync, setLoadingNotesSync] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [tasksSyncResult, setTasksSyncResult] = useState<string | null>(null);
  const [notesSyncResult, setNotesSyncResult] = useState<string | null>(null);

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


  const handleNotesSync = useCallback(async () => {
    setLoadingNotesSync(true);
    setNotesSyncResult(null);
    try {
      const result = await syncDriveNotes();
      if (result === null) {
        setNotesSyncResult('Drive-Sync nicht aktiviert');
        return;
      }
      if (result.scopeError) {
        setNotesSyncResult('⚠️ Keine Drive-Berechtigung – bitte Google-Verbindung trennen und neu anmelden');
        return;
      }
      const { pulled, pushed, deleted } = result;
      const parts = [
        pulled > 0 ? `${pulled} geladen` : null,
        pushed > 0 ? `${pushed} hochgeladen` : null,
        deleted > 0 ? `${deleted} gelöscht` : null,
        pulled === 0 && pushed === 0 && deleted === 0 ? 'Keine Änderungen' : null,
      ].filter(Boolean);
      setNotesSyncResult(parts.join(', '));
    } catch (e) {
      console.error('[NotesSync]', e);
      setNotesSyncResult('Fehler beim Sync');
    } finally {
      setLoadingNotesSync(false);
    }
  }, [syncDriveNotes]);

  const handleKeepImport = useCallback(async () => {
    setLoadingKeepImport(true);
    try {
      const existingIds = new Set(notes.map((n) => n.id));
      const result = await importKeepTakeout(existingIds, groups, addNote);
      if (!result) return;
      Alert.alert(
        'Import abgeschlossen',
        [
          result.imported > 0 ? `${result.imported} Notizen importiert` : null,
          result.skipped > 0 ? `${result.skipped} übersprungen (Papierkorb)` : null,
          result.errors > 0 ? `${result.errors} Fehler` : null,
          result.imported === 0 && result.skipped === 0 ? 'Keine Notizen gefunden' : null,
        ].filter(Boolean).join('\n')
      );
    } catch (e) {
      Alert.alert('Fehler', e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingKeepImport(false);
    }
  }, [notes, groups, addNote]);

  const [confirmClearNotes, setConfirmClearNotes] = useState(false);

  // Gruppen
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>(EMPTY_GROUP_FORM);

  const openCreateGroup = useCallback(() => {
    setEditingGroupId(null);
    setGroupForm(EMPTY_GROUP_FORM);
    setGroupModalVisible(true);
  }, []);

  const openEditGroup = useCallback((group: Group) => {
    setEditingGroupId(group.id);
    setGroupForm({ name: group.name, color: group.color, keywords: group.keywords.join(', ') });
    setGroupModalVisible(true);
  }, []);

  const handleGroupSave = useCallback(() => {
    if (!groupForm.name.trim()) {
      Alert.alert('Name fehlt', 'Bitte gib einen Gruppennamen ein.');
      return;
    }
    const keywords = groupForm.keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (editingGroupId) {
      updateGroup(editingGroupId, { name: groupForm.name.trim(), color: groupForm.color, keywords });
    } else {
      addGroup({ id: uuid.v4() as string, name: groupForm.name.trim(), color: groupForm.color, keywords, createdAt: new Date().toISOString() });
    }
    setGroupModalVisible(false);
  }, [groupForm, editingGroupId, addGroup, updateGroup]);

  const handleGroupDelete = useCallback((group: Group) => {
    const count = tasks.filter((t) => t.groupId === group.id).length;
    const msg = count > 0
      ? `Diese Gruppe hat ${count} Task${count > 1 ? 's' : ''}. Diese werden auf "Keine Gruppe" gesetzt.`
      : 'Gruppe wirklich löschen?';
    Alert.alert(`Gruppe "${group.name}" löschen`, msg, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => deleteGroup(group.id) },
    ]);
  }, [tasks, deleteGroup]);

  const handleDeleteKeepImports = useCallback(() => {
    setConfirmClearNotes(true);
  }, []);

  return (
    <>
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

      {/* Date format */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Datumsformat</Text>
        {DATE_FORMATS.map((fmt) => (
          <Pressable
            key={fmt}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => updateSettings({ dateFormat: fmt })}
          >
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>{DATE_FORMAT_LABELS[fmt]}</Text>
            </View>
            {settings.dateFormat === fmt ? (
              <Ionicons name="checkmark" size={20} color={colors.accent} />
            ) : null}
          </Pressable>
        ))}
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


      {/* Google Keep Import */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Google Keep Import</Text>
        <View style={styles.calendarInfo}>
          <Ionicons name="cloud-download-outline" size={32} color={colors.accent} />
          <Text style={styles.calendarInfoText}>
            Exportiere deine Keep-Notizen unter takeout.google.com, entpacke die ZIP und wähle alle Dateien im „Keep"-Ordner aus. Farben, Labels und Pinned werden übernommen.
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.connectBtn,
            { backgroundColor: '#34A853' },
            loadingKeepImport && styles.connectBtnDisabled,
            pressed && !loadingKeepImport && { opacity: 0.8 },
          ]}
          onPress={handleKeepImport}
          disabled={loadingKeepImport}
        >
          {loadingKeepImport ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="folder-open-outline" size={18} color="#fff" />
              <Text style={styles.connectBtnText}>Takeout-Dateien auswählen</Text>
            </>
          )}
        </Pressable>
        {confirmClearNotes ? (
          <View style={styles.confirmRow}>
            <Text style={[styles.rowSubtitle, { flex: 1, color: colors.danger }]}>
              {notes.length} Notizen wirklich löschen?
            </Text>
            <Pressable
              style={({ pressed }) => [styles.confirmBtn, { backgroundColor: colors.danger }, pressed && { opacity: 0.7 }]}
              onPress={() => { clearNotes(); setConfirmClearNotes(false); }}
            >
              <Text style={styles.confirmBtnText}>Löschen</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.confirmBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              onPress={() => setConfirmClearNotes(false)}
            >
              <Text style={[styles.confirmBtnText, { color: colors.text }]}>Abbrechen</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.7 }]}
            onPress={handleDeleteKeepImports}
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={[styles.dangerBtnText, { color: colors.danger }]}>Alle Notizen löschen</Text>
          </Pressable>
        )}
      </View>

      {/* Google Drive Notizen-Sync */}
      {settings.googleCalendarEnabled ? (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Google Drive Notizen-Sync</Text>
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Automatisch synchronisieren</Text>
              <Text style={styles.rowSubtitle}>Notizen werden beim Start und Aktivieren der App mit Drive abgeglichen</Text>
            </View>
            <Switch
              value={settings.googleNotesEnabled}
              onValueChange={(v) => updateSettings({ googleNotesEnabled: v })}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
          {settings.googleNotesEnabled ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.syncBtn, pressed && { opacity: 0.8 }, loadingNotesSync && { opacity: 0.6 }]}
                onPress={handleNotesSync}
                disabled={loadingNotesSync}
              >
                {loadingNotesSync ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                    <Text style={styles.syncBtnText}>Notizen jetzt synchronisieren</Text>
                  </>
                )}
              </Pressable>
              {notesSyncResult ? (
                <View style={[styles.row, { backgroundColor: colors.surfaceHigh }]}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                  <Text style={[styles.rowSubtitle, { flex: 1 }]}>{notesSyncResult}</Text>
                  <Pressable onPress={() => setNotesSyncResult(null)} hitSlop={8}>
                    <Ionicons name="close" size={16} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {/* Gruppen */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Gruppen</Text>
        {groups.length === 0 ? (
          <View style={[styles.row, { justifyContent: 'center' }]}>
            <Text style={[styles.rowSubtitle, { textAlign: 'center' }]}>Noch keine Gruppen angelegt.</Text>
          </View>
        ) : (
          groups.map((group) => {
            const count = tasks.filter((t) => t.groupId === group.id).length;
            return (
              <View key={group.id} style={styles.groupRow}>
                <View style={[styles.groupColorStripe, { backgroundColor: mono(group.color) }]} />
                <View style={styles.rowContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.rowTitle}>{group.name}</Text>
                    <View style={styles.countBadge}>
                      <Text style={styles.countText}>{count}</Text>
                    </View>
                  </View>
                  {group.keywords.length > 0 ? (
                    <View style={styles.kwRow}>
                      {group.keywords.slice(0, 4).map((kw) => (
                        <View key={kw} style={styles.kwBadge}>
                          <Text style={styles.kwText}>{kw}</Text>
                        </View>
                      ))}
                      {group.keywords.length > 4 ? <Text style={styles.kwMore}>+{group.keywords.length - 4}</Text> : null}
                    </View>
                  ) : (
                    <Text style={[styles.rowSubtitle, { fontStyle: 'italic' }]}>Keine Schlüsselwörter</Text>
                  )}
                </View>
                <View style={styles.groupActions}>
                  <TouchableOpacity onPress={() => openEditGroup(group)} hitSlop={8}>
                    <Ionicons name="pencil-outline" size={18} color={colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleGroupDelete(group)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
        <Pressable
          style={({ pressed }) => [styles.addGroupBtn, pressed && { opacity: 0.75 }]}
          onPress={openCreateGroup}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={[styles.rowTitle, { color: colors.accent }]}>Neue Gruppe</Text>
        </Pressable>
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

    {/* Gruppen Modal */}
    <Modal visible={groupModalVisible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setGroupModalVisible(false)}>
            <Text style={styles.modalCancel}>Abbrechen</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{editingGroupId ? 'Gruppe bearbeiten' : 'Neue Gruppe'}</Text>
          <TouchableOpacity onPress={handleGroupSave}>
            <Text style={styles.modalSave}>Speichern</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalScrollContent}>
          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Name</Text>
            <TextInput
              style={styles.modalFieldInput}
              value={groupForm.name}
              onChangeText={(v) => setGroupForm((f) => ({ ...f, name: v }))}
              placeholder="Gruppenname"
              placeholderTextColor={colors.placeholder}
              autoFocus={!editingGroupId}
            />
          </View>
          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Farbe</Text>
            <View style={styles.colorGrid}>
              {PRESET_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[styles.colorSwatch, { backgroundColor: color }, groupForm.color === color && styles.colorSwatchSelected]}
                  onPress={() => setGroupForm((f) => ({ ...f, color }))}
                >
                  {groupForm.color === color ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[styles.groupPreviewCard, { borderLeftColor: groupForm.color }]}>
            <View style={[styles.previewDot, { backgroundColor: groupForm.color }]} />
            <Text style={[styles.modalTitle, { color: groupForm.color }]}>{groupForm.name || 'Vorschau'}</Text>
          </View>
          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Schlüsselwörter</Text>
            <Text style={[styles.rowSubtitle, { marginBottom: 4 }]}>Kommagetrennt. Werden beim automatischen Gruppieren erkannt.</Text>
            <TextInput
              style={[styles.modalFieldInput, { minHeight: 70, textAlignVertical: 'top' }]}
              value={groupForm.keywords}
              onChangeText={(v) => setGroupForm((f) => ({ ...f, keywords: v }))}
              placeholder="meeting, projekt, deadline, …"
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={3}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
    </>
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
    // Gruppen
    groupRow: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderRadius: 12,
      overflow: 'hidden',
      alignItems: 'stretch',
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 2,
    },
    groupColorStripe: { width: 4 },
    groupActions: {
      flexDirection: 'column',
      justifyContent: 'space-around',
      paddingHorizontal: 14,
      gap: 12,
    },
    countBadge: {
      backgroundColor: c.surfaceHigh,
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 1,
    },
    countText: { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
    kwRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
    kwBadge: {
      backgroundColor: c.surfaceHigh,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    kwText: { fontSize: 11, color: c.textSecondary },
    kwMore: { fontSize: 11, color: c.textMuted },
    addGroupBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginTop: 2,
      borderWidth: 1,
      borderColor: c.border,
    },
    // Modal
    modal: { flex: 1, backgroundColor: c.background },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: c.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    modalCancel: { fontSize: 16, color: c.textSecondary },
    modalTitle: { fontSize: 17, fontWeight: '600', color: c.text },
    modalSave: { fontSize: 16, fontWeight: '600', color: c.accent },
    modalScrollContent: { padding: 16, gap: 16, paddingBottom: 60 },
    modalField: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      gap: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    modalFieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    modalFieldInput: {
      fontSize: 15,
      color: c.text,
      backgroundColor: c.surfaceHigh,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    colorSwatch: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorSwatchSelected: {
      borderWidth: 3,
      borderColor: '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
    groupPreviewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      gap: 8,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: c.border,
    },
    previewDot: { width: 10, height: 10, borderRadius: 5 },
  });
}
