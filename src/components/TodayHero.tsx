/**
 * TodayHero.tsx (TE-60)
 *
 * Kopfkarte des Dashboards aus dem Aurora-Entwurf: links ein Tagesring
 * (Anteil des Tages, der schon vergangen ist) mit Uhrzeit + Temperatur,
 * rechts der nächste Termin von heute und der danach. Darunter drei
 * Schnell-Anlegen-Buttons: Aufgabe, Idee, Geistesblitz.
 *
 * Der Ring besteht aus 60 gedrehten Segment-Views statt SVG – so braucht es
 * keine zusätzliche Abhängigkeit (react-native-svg ist nicht installiert).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemeColors, SOFT_BORDER } from '../utils/theme';
import { CalendarEvent } from '../services/googleCalendar';
import { fetchWeatherForecast, DailyWeather } from '../services/weather';

const SEGMENTS = 60;
const RING_SIZE = 92;
const RING_STOPS = ['#10c88a', '#7b2ff7', '#f72585'];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

/** Farbe an Position t (0..1) entlang der Verlaufs-Stopps. */
function gradientAt(stops: string[], t: number): string {
  const pos = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(pos), stops.length - 2);
  const f = pos - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function DayRing({ progress, track, children }: { progress: number; track: string; children: React.ReactNode }) {
  const filled = Math.round(progress * SEGMENTS);
  return (
    <View style={styles.ring} accessibilityRole="image" accessibilityLabel={`${Math.round(progress * 100)} Prozent des Tages vergangen`}>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <View key={i} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${(i * 360) / SEGMENTS}deg` }] }]}>
          <View
            style={[
              styles.segment,
              { backgroundColor: i < filled ? gradientAt(RING_STOPS, filled > 1 ? i / (filled - 1) : 0) : track },
            ]}
          />
        </View>
      ))}
      <View style={styles.ringCenter}>{children}</View>
    </View>
  );
}

const hhmm = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export function TodayHero({
  colors,
  todayEvents,
  onAddTask,
  onAddIdea,
  onAddBlitz,
}: {
  colors: ThemeColors;
  /** Termine von heute (beliebige Reihenfolge, inkl. ganztägiger). */
  todayEvents: CalendarEvent[];
  onAddTask: () => void;
  onAddIdea: () => void;
  /** Fehlt, wenn der Geistesblitz-Block ausgeblendet ist – dann kein Button. */
  onAddBlitz?: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<DailyWeather | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchWeatherForecast().then((f) => { if (!cancelled && f?.days.length) setWeather(f.days[0]); });
    return () => { cancelled = true; };
  }, []);

  const progress = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);

  // Nur getimte Termine, die noch nicht begonnen haben – ganztägige haben
  // keinen „als Nächstes"-Zeitpunkt.
  const [next, after] = useMemo(
    () =>
      todayEvents
        .filter((e) => !e.allDay && new Date(e.start).getTime() > now.getTime())
        .sort((a, b) => a.start.localeCompare(b.start)),
    [todayEvents, now],
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.top}>
        <DayRing progress={progress} track={colors.surfaceHigh}>
          <Text style={[styles.time, { color: colors.text }]}>{hhmm(now)}</Text>
          {weather && (
            <Text style={[styles.temp, { color: colors.textMuted }]}>
              {weather.tempMax}° / {weather.tempMin}°
            </Text>
          )}
        </DayRing>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.kicker, { color: RING_STOPS[0] }]}>ALS NÄCHSTES</Text>
          {next ? (
            <>
              <Text style={[styles.nextTitle, { color: colors.text }]} numberOfLines={2}>
                {hhmm(new Date(next.start))} · {next.summary}
              </Text>
              {after && (
                <Text style={[styles.after, { color: colors.textSecondary }]} numberOfLines={1}>
                  danach {hhmm(new Date(after.start))} {after.summary}
                </Text>
              )}
            </>
          ) : (
            <Text style={[styles.nextTitle, { color: colors.text }]}>Heute keine Termine mehr</Text>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onAddTask} accessibilityRole="button" style={({ pressed }) => [styles.btnFlex, { opacity: pressed ? 0.8 : 1 }]}>
          <LinearGradient colors={['#7b2ff7', '#f72585']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
            <Text style={[styles.btnText, { color: '#FFFFFF' }]}>+ Aufgabe</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={onAddIdea} accessibilityRole="button" style={({ pressed }) => [styles.btnFlex, styles.btn, styles.btnOutline, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.btnText, { color: colors.text }]}>+ Idee</Text>
        </Pressable>
        {onAddBlitz && (
          <Pressable onPress={onAddBlitz} accessibilityRole="button" style={({ pressed }) => [styles.btnFlex, styles.btn, styles.btnOutline, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.btnText, { color: colors.text }]} numberOfLines={1}>+ Geistesblitz</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: SOFT_BORDER,
    padding: 14,
    gap: 14,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ring: { width: RING_SIZE, height: RING_SIZE },
  segment: { position: 'absolute', top: 0, left: RING_SIZE / 2 - 1.5, width: 3, height: 9, borderRadius: 2 },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  time: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  temp: { fontSize: 11 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  nextTitle: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  after: { fontSize: 13, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  btnFlex: { flex: 1 },
  btn: { minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  btnOutline: { borderWidth: 1 },
  btnText: { fontSize: 13, fontWeight: '700' },
});
