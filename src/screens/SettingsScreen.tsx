import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { DateFormat, Theme } from '../types';
import { DATE_FORMAT_LABELS } from '../utils/dateFormat';
import { useTheme, ThemeColors, THEMES } from '../utils/theme';
import {
  signInWithGoogle,
  listCalendars,
} from '../services/googleCalendar';

const DATE_FORMATS: DateFormat[] = ['de', 'us', 'iso', 'relative'];
const THEME_OPTIONS: { value: Theme; label: string; subtitle: string }[] = [
  { value: 'light', label: 'Hell', subtitle: 'iOS-Standard, weißer Hintergrund' },
  { value: 'dark-neon', label: 'Dark Neon', subtitle: 'Dunkles Design mit Neon-Akzenten' },
];

export function SettingsScreen() {
  const { settings, updateSettings } = useStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  const handleGoogleConnect = useCallback(async () => {
    setLoadingCalendar(true);
    try {
      const auth = await signInWithGoogle();
      if (!auth) {
        Alert.alert('Anmeldung fehlgeschlagen', 'Google-Login abgebrochen.');
        return;
      }

      updateSettings({
        googleAccessToken: auth.accessToken,
        googleRefreshToken: auth.refreshToken,
        googleCalendarEnabled: true,
      });

      const calendars = await listCalendars(auth.accessToken);
      if (calendars.length === 0) {
        Alert.alert('Keine Kalender', 'Es wurden keine Google-Kalender gefunden.');
        return;
      }

      const primary = calendars.find((c) => c.id === 'primary') ?? calendars[0];
      updateSettings({ googleCalendarId: primary.id });

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
  }, [updateSettings]);

  const handleGoogleDisconnect = useCallback(() => {
    Alert.alert('Verbindung trennen', 'Google Kalender wirklich trennen? Bestehende Kalendereinträge bleiben erhalten.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Trennen',
        style: 'destructive',
        onPress: () =>
          updateSettings({
            googleCalendarEnabled: false,
            googleAccessToken: null,
            googleRefreshToken: null,
            googleCalendarId: null,
          }),
      },
    ]);
  }, [updateSettings]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Theme */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Design</Text>
        {THEME_OPTIONS.map((opt) => {
          const themeColors = THEMES[opt.value];
          const isActive = (settings.theme ?? 'light') === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.themeRow, isActive && styles.themeRowActive]}
              onPress={() => updateSettings({ theme: opt.value })}
              activeOpacity={0.75}
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
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Date format */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Datumsformat</Text>
        {DATE_FORMATS.map((fmt) => (
          <TouchableOpacity
            key={fmt}
            style={styles.row}
            onPress={() => updateSettings({ dateFormat: fmt })}
          >
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>{DATE_FORMAT_LABELS[fmt]}</Text>
            </View>
            {settings.dateFormat === fmt ? (
              <Ionicons name="checkmark" size={20} color={colors.accent} />
            ) : null}
          </TouchableOpacity>
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
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.thresholdBtn,
                    settings.autoGroupConfidenceThreshold === val && styles.thresholdBtnActive,
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
                </TouchableOpacity>
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
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>Verbunden</Text>
                {settings.googleCalendarId ? (
                  <Text style={styles.rowSubtitle}>Kalender-ID: {settings.googleCalendarId}</Text>
                ) : null}
              </View>
            </View>
            <TouchableOpacity style={styles.dangerBtn} onPress={handleGoogleDisconnect}>
              <Ionicons name="log-out-outline" size={16} color={colors.danger} />
              <Text style={[styles.dangerBtnText, { color: colors.danger }]}>Google Kalender trennen</Text>
            </TouchableOpacity>
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
    thresholdBtnTextActive: { color: '#fff', fontWeight: '600' },
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
  });
}
