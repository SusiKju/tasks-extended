import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { DateFormat } from '../types';
import { DATE_FORMAT_LABELS } from '../utils/dateFormat';
import {
  signInWithGoogle,
  listCalendars,
} from '../services/googleCalendar';

const DATE_FORMATS: DateFormat[] = ['de', 'us', 'iso', 'relative'];

export function SettingsScreen() {
  const { settings, updateSettings } = useStore();
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

      // Use primary calendar by default, let user pick
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
              <Ionicons name="checkmark" size={20} color="#4F86F7" />
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
            trackColor={{ true: '#34C759' }}
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
              <Ionicons name="checkmark-circle" size={20} color="#34C759" />
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>Verbunden</Text>
                {settings.googleCalendarId ? (
                  <Text style={styles.rowSubtitle}>Kalender-ID: {settings.googleCalendarId}</Text>
                ) : null}
              </View>
            </View>
            <TouchableOpacity style={styles.dangerBtn} onPress={handleGoogleDisconnect}>
              <Ionicons name="log-out-outline" size={16} color="#FF3B30" />
              <Text style={styles.dangerBtnText}>Google Kalender trennen</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.calendarInfo}>
              <Ionicons name="calendar-outline" size={32} color="#4F86F7" />
              <Text style={styles.calendarInfoText}>
                Verbinde deinen Google-Account, um Tasks mit Fälligkeitsdaten automatisch als Kalendereinträge zu speichern.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.connectBtn, loadingCalendar && styles.connectBtnDisabled]}
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
            </TouchableOpacity>
            <Text style={styles.credentialsNote}>
              Hinweis: Für die Google-Kalender-Synchronisation müssen in der app.json gültige OAuth-Client-IDs hinterlegt werden (EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS / _ANDROID / _WEB).
            </Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  content: { padding: 16, gap: 24, paddingBottom: 60 },
  section: { gap: 2 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 15, color: '#1C1C1E' },
  rowSubtitle: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  rowValue: { fontSize: 15, color: '#8E8E93' },
  thresholdButtons: { flexDirection: 'row', gap: 6 },
  thresholdBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  thresholdBtnActive: { backgroundColor: '#4F86F7', borderColor: '#4F86F7' },
  thresholdBtnText: { fontSize: 12, color: '#3C3C43' },
  thresholdBtnTextActive: { color: '#fff', fontWeight: '600' },
  calendarInfo: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  calendarInfoText: {
    fontSize: 14,
    color: '#3C3C43',
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
  credentialsNote: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 8,
    paddingHorizontal: 4,
    lineHeight: 17,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF3B30',
    backgroundColor: '#FFF5F5',
  },
  dangerBtnText: { color: '#FF3B30', fontSize: 15, fontWeight: '500' },
});
