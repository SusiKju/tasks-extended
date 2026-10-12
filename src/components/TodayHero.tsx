/**
 * TodayHero.tsx (TE-60)
 *
 * Kopfkarte des Dashboards aus dem Aurora-Entwurf: links ein Tagesring
 * (12-h-Ziffernblatt mit Terminstrichen, TE-71) mit Uhrzeit + Temperatur,
 * rechts der nächste Termin von heute und der danach. Darunter drei
 * Schnell-Anlegen-Buttons: Aufgabe, Idee, Geistesblitz.
 *
 * Der Ring besteht aus 60 gedrehten Segment-Views statt SVG – so braucht es
 * keine zusätzliche Abhängigkeit (react-native-svg ist nicht installiert).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ThemeColors, ButtonGradient } from '../utils/theme';
import { GradientButton } from './GradientButton';
import { CalendarEvent } from '../services/googleCalendar';
import { fetchWeatherForecast, DailyWeather } from '../services/weather';

const SEGMENTS = 60;
const RING_SIZE = 92;
const RING_STOPS = ['#10c88a', '#7b2ff7', '#f72585'];
const DEFAULT_TASK: ButtonGradient = { colors: ['#7b2ff7', '#f72585'], fg: '#FFFFFF' };

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

const HALF_DAY = 12 * 60;
const MARKER_OVERHANG = 7;

/**
 * TE-71: 12-Stunden-Ziffernblatt der aktuellen Tageshälfte (oben = 12/0 Uhr).
 * Ein Segment = 12 min, jedes 5. ist eine Stundenmarke (länger, heller).
 * Termine der Hälfte stehen als lange Striche nach außen; der nächste ist
 * dicker, vergangene blass. Termine der anderen Hälfte werden bewusst nicht
 * gezeigt – sie würden sonst über die schon gefüllte Zeit fallen.
 */
function DayRing({
  nowMin,
  eventMins,
  track,
  hourTrack,
  marker,
  children,
}: {
  nowMin: number;
  eventMins: number[];
  track: string;
  hourTrack: string;
  marker: string;
  children: React.ReactNode;
}) {
  const start = nowMin >= HALF_DAY ? HALF_DAY : 0;
  const filled = Math.round(((nowMin - start) / HALF_DAY) * SEGMENTS);
  const inHalf = eventMins.filter((m) => m >= start && m < start + HALF_DAY);
  const nextMin = Math.min(...inHalf.filter((m) => m >= nowMin));
  return (
    <View
      style={styles.ring}
      accessibilityRole="image"
      accessibilityLabel={`Uhr, ${inHalf.filter((m) => m >= nowMin).length} anstehende Termine bis ${start ? '24' : '12'} Uhr`}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const hour = i % 5 === 0;
        return (
          <View key={i} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${(i * 360) / SEGMENTS}deg` }] }]}>
            <View
              style={[
                styles.segment,
                hour && styles.hourSegment,
                { backgroundColor: i < filled ? gradientAt(RING_STOPS, filled > 1 ? i / (filled - 1) : 0) : hour ? hourTrack : track },
              ]}
            />
          </View>
        );
      })}
      {inHalf.map((m, i) => (
        <View key={`e${i}`} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${((m - start) / HALF_DAY) * 360}deg` }] }]}>
          <View
            style={[
              styles.marker,
              m === nextMin && styles.markerNext,
              { backgroundColor: marker, opacity: m < nowMin ? 0.35 : 1 },
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

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const eventMins = useMemo(
    () =>
      todayEvents
        .filter((e) => !e.allDay && new Date(e.start).toDateString() === now.toDateString())
        .map((e) => { const d = new Date(e.start); return d.getHours() * 60 + d.getMinutes(); }),
    [todayEvents, now],
  );

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
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.softBorder }]}>
      <View style={styles.top}>
        <DayRing nowMin={nowMin} eventMins={eventMins} track={colors.surfaceHigh} hourTrack={colors.textMuted} marker={colors.text}>
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
        {/* TE-62: Verlauf je nach Theme (Bento Dark: Aufgabe blau, Idee gelb,
            Geistesblitz grell); sonst Aufgabe im Aurora-Verlauf, Rest Outline. */}
        {([
          ['task', '+ Aufgabe', onAddTask],
          ['idea', '+ Idee', onAddIdea],
          ...(onAddBlitz ? [['blitz', '+ Geistesblitz', onAddBlitz] as const] : []),
        ] as const).map(([kind, label, onPress]) => {
          const g = colors.gradients?.[kind] ?? (kind === 'task' ? DEFAULT_TASK : undefined);
          return (
            <GradientButton
              key={kind}
              gradient={g}
              onPress={onPress}
              style={[styles.btnFlex, styles.btn]}
              fallbackStyle={[styles.btnOutline, { borderColor: colors.border }]}
            >
              <Text style={[styles.btnText, { color: g ? g.fg : colors.text }]} numberOfLines={1}>{label}</Text>
            </GradientButton>
          );
        })}
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
    padding: 14,
    gap: 14,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ring: { width: RING_SIZE, height: RING_SIZE, margin: MARKER_OVERHANG },
  segment: { position: 'absolute', top: 0, left: RING_SIZE / 2 - 1.5, width: 3, height: 9, borderRadius: 2 },
  hourSegment: { height: 12 },
  marker: { position: 'absolute', top: -MARKER_OVERHANG, left: RING_SIZE / 2 - 1.5, width: 3, height: 9 + MARKER_OVERHANG + 1, borderRadius: 2 },
  markerNext: { left: RING_SIZE / 2 - 2, width: 4 },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  time: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  temp: { fontSize: 11 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  nextTitle: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  after: { fontSize: 13, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  // Breite nach Inhalt statt gleicher Drittel – sonst wird „+ Geistesblitz“ am Handy abgeschnitten.
  btnFlex: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
  btn: { minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnOutline: { borderWidth: 1 },
  btnText: { fontSize: 13, fontWeight: '700' },
});
