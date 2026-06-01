import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Animated,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { useTheme, ThemeColors } from '../utils/theme';
import { uploadScratchpad } from '../services/googleDriveNotes';
import { useGoogleDriveNotesSync } from '../hooks/useGoogleDriveNotesSync';
import { useGoogleTasksSync } from '../hooks/useGoogleTasksSync';
import { useGoogleContactsBirthdaysSync } from '../hooks/useGoogleContactsBirthdaysSync';
import { isOverdue } from '../utils/dateFormat';
import { fetchRecentMails, MailMessage } from '../services/googleMail';
import { listUpcomingEvents, CalendarEvent } from '../services/googleCalendar';
import { Task } from '../types';

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  tasks:    '#3B82F6',   // Blau
  calendar: '#4285F4',   // Google Kalender Blau
  important:'#FF3B30',   // Rot
  overdue:  '#FF3B30',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDisplayFrom(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*<?[^>]*>?$/);
  return match ? match[1].trim() : from.replace(/<[^>]+>/, '').trim() || from;
}

function formatMailDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  } catch { return ''; }
}

function formatEventTime(e: CalendarEvent): { day: string; time: string } {
  if (e.allDay) return { day: dayLabel(new Date(e.start)), time: 'Ganztägig' };
  try {
    const d = new Date(e.start);
    return {
      day: dayLabel(d),
      time: d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    };
  } catch { return { day: '', time: '' }; }
}

function dayLabel(d: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return 'Heute';
  if (d.toDateString() === tomorrow.toDateString()) return 'Morgen';
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function chipDueLabel(task: Task): string {
  const parts: string[] = [];
  if (task.dueDate) {
    try {
      const d = new Date(task.dueDate);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const due = new Date(d); due.setHours(0, 0, 0, 0);
      const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
      if (diff < 0) parts.push('!');          // kurz: überfällig
      else if (diff === 0) parts.push('Heute');
      else if (diff === 1) parts.push('Mo.');  // Morgen → Mo.
      else parts.push(d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }));
    } catch {}
  }
  if (task.dueTime) parts.push(task.dueTime);
  return parts.join(' ');
}

function isUrgent(task: Task): boolean {
  if (!task.dueDate) return false;
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(task.dueDate); due.setHours(0, 0, 0, 0);
    return due.getTime() <= today.getTime();
  } catch { return false; }
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// Präziser Fälligkeitszeitpunkt – nur mit Datum UND Uhrzeit bestimmbar.
function deadlineMs(task: Task): number | null {
  if (!task.dueDate || !task.dueTime) return null;
  try {
    const d = new Date(task.dueDate);
    const [h, m] = task.dueTime.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    d.setHours(h, m, 0, 0);
    return d.getTime();
  } catch { return null; }
}

// Blinkt: Deadline (Datum + Uhrzeit) ≤ 2h entfernt oder bereits überfällig.
function isDeadlineSoon(task: Task, now: number): boolean {
  const ms = deadlineMs(task);
  if (ms == null) return false;
  return ms - now <= TWO_HOURS_MS;
}

// ─── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({
  title, onMore, moreLabel = 'Alle →', colors,
}: {
  title: string; onMore?: () => void; moreLabel?: string; colors: ThemeColors;
}) {
  return (
    <View style={labelStyles.row}>
      <Text style={[labelStyles.title, { color: colors.textSecondary }]}>{title}</Text>
      {onMore && (
        <Pressable onPress={onMore} hitSlop={8}>
          <Text style={[labelStyles.more, { color: colors.textMuted }]}>{moreLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const labelStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  more: {
    fontSize: 11,
    fontWeight: '600',
  },
});

// ─── Task Chip ────────────────────────────────────────────────────────────────

function TaskChip({
  task,
  onPress,
  isDark,
  colors,
  scale = 'lg',
  blink = false,
}: {
  task: Task;
  onPress: () => void;
  isDark: boolean;
  colors: ThemeColors;
  scale?: 'lg' | 'md' | 'sm';
  blink?: boolean;
}) {
  const urgent = isUrgent(task);
  const label = chipDueLabel(task);
  const isImportant = task.important;

  // Blink-Animation, wenn die Deadline einer wichtigen Task < 2h entfernt ist.
  const blinkAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!blink) { blinkAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => { loop.stop(); blinkAnim.setValue(1); };
  }, [blink, blinkAnim]);

  // Farben direkt aus dem Theme – funktioniert für alle Themes korrekt:
  // Neon: danger=#FF1177 (Magenta), warning=#FFE600, accentNeon=#00EEFF
  // Dark-Soft: danger=#FF5F57, warning=#F5A623
  // Light: danger=#FF3B30
  const dangerColor = colors.danger;
  const taskColor   = isDark ? colors.accentNeon : C.tasks;

  const bgColor = isImportant
    ? C.tasks
    : urgent
    ? dangerColor + (isDark ? '22' : '10')
    : taskColor   + (isDark ? '18' : '10');

  const borderColor = isImportant
    ? C.tasks
    : urgent
    ? dangerColor + (isDark ? '88' : '40')
    : taskColor   + (isDark ? '60' : '35');

  const textColor = isImportant
    ? '#FFFFFF'
    : urgent
    ? dangerColor
    : taskColor;

  const fontSize   = scale === 'lg' ? 13 : scale === 'md' ? 11 : 10;
  const padV       = scale === 'lg' ? 7  : scale === 'md' ? 5  : 4;
  const padH       = scale === 'lg' ? 11 : scale === 'md' ? 9  : 8;
  const chipOpacity= scale === 'sm' ? 0.65 : 1;

  return (
    <Animated.View style={{ opacity: blinkAnim, maxWidth: '100%' }}>
      <Pressable
        style={({ pressed }) => [
          chipStyles.chip,
          { backgroundColor: bgColor, borderColor, opacity: pressed ? 0.7 : chipOpacity,
            paddingVertical: padV, paddingHorizontal: padH },
        ]}
        onPress={onPress}
      >
        {isImportant && (
          <Ionicons name="flag" size={scale === 'lg' ? 11 : 9} color={textColor} style={{ marginRight: 2 }} />
        )}
        <Text style={[chipStyles.title, { color: textColor, fontSize }]} numberOfLines={1}>
          {task.title}
        </Text>
        {label ? (
          <Text style={[chipStyles.label, { color: textColor + 'BB', fontSize: fontSize - 1 }]}>{label}</Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 3,
    // prevent chip from exceeding column width
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    flexShrink: 1,
  },
});

// ─── Scratchpad (Notiz-Bubbles) ───────────────────────────────────────────────

interface ScratchEntry { text: string; color: string; }

// Neutrale dunkle Palette (Light + Dark-Soft)
const BUBBLE_PALETTE_NEUTRAL = [
  '#1E3A5F', '#2D1B4E', '#1A3A2E', '#3D1F1F',
  '#1F3D30', '#3D2D1F', '#1F2D3D', '#2D3D1F',
  '#3A1F3A', '#1F3A3A', '#2A2040', '#40201A',
];

// Neon-Palette: knallige Vollfarben mit weißem Text
const BUBBLE_PALETTE_NEON = [
  '#FF1177', // Neon-Magenta
  '#00CCEE', // Neon-Cyan
  '#2299FF', // Elektrisch-Blau
  '#CC00FF', // Neon-Lila
  '#00FF88', // Neon-Grün
  '#FF6600', // Neon-Orange
  '#FFE600', // Elektrisch-Gelb  → dunkler Text nötig
  '#FF0066', // Hot-Pink
  '#00AAFF', // Himmelblau-Neon
  '#AA00FF', // Violett-Neon
];

let _lastNeonPaletteIdx = -1;
function randomBubbleColor(isNeon = false): string {
  const palette = isNeon ? BUBBLE_PALETTE_NEON : BUBBLE_PALETTE_NEUTRAL;
  // kein zweimal hintereinander die gleiche Farbe
  let idx: number;
  do { idx = Math.floor(Math.random() * palette.length); }
  while (idx === _lastNeonPaletteIdx && palette.length > 1);
  _lastNeonPaletteIdx = idx;
  return palette[idx];
}

const NEON_FIRST_COLOR = '#FF1177';

function parseScratchpad(raw: string, isNeon = false): ScratchEntry[] {
  const firstColor = isNeon ? NEON_FIRST_COLOR : randomBubbleColor(false);
  if (!raw || raw.trim() === '') return [{ text: '', color: firstColor }];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Erste Notiz im Neon-Theme immer auf #FF1177 setzen
      if (isNeon) parsed[0] = { ...parsed[0], color: NEON_FIRST_COLOR };
      return parsed;
    }
  } catch {}
  const palette = isNeon ? BUBBLE_PALETTE_NEON : BUBBLE_PALETTE_NEUTRAL;
  const lines = raw.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('─'));
  if (lines.length === 0) return [{ text: '', color: firstColor }];
  return lines.map((text, i) => ({
    text,
    color: i === 0 && isNeon ? NEON_FIRST_COLOR : palette[i % palette.length],
  }));
}

function serializeScratchpad(entries: ScratchEntry[]): string {
  return JSON.stringify(entries);
}

function Scratchpad({
  value, onChange, isDark, colors,
}: {
  value: string;
  onChange: (t: string) => void;
  isDark: boolean;
  colors: ThemeColors;
}) {
  const isNeon = isDark && colors.accentNeon === '#00EEFF';
  const entries = useMemo(() => parseScratchpad(value, isNeon), [value, isNeon]);
  const inputRefs = useRef<(any)[]>([]);

  const updateEntry = useCallback((idx: number, text: string) => {
    const next = entries.map((e, i) => i === idx ? { ...e, text } : e);
    onChange(serializeScratchpad(next));
  }, [entries, onChange]);

  const addEntry = useCallback((afterIdx: number) => {
    const next = [...entries];
    next.splice(afterIdx + 1, 0, { text: '', color: randomBubbleColor(isNeon) });
    onChange(serializeScratchpad(next));
    setTimeout(() => inputRefs.current[afterIdx + 1]?.focus(), 40);
  }, [entries, onChange, isNeon]);

  const removeEntry = useCallback((idx: number) => {
    if (entries.length <= 1) { updateEntry(0, ''); return; }
    const next = entries.filter((_, i) => i !== idx);
    onChange(serializeScratchpad(next));
    setTimeout(() => inputRefs.current[Math.max(0, idx - 1)]?.focus(), 40);
  }, [entries, onChange, updateEntry]);

  const handleKeyPress = useCallback((idx: number, e: any) => {
    if (e.nativeEvent.key === 'Backspace' && entries[idx].text === '') {
      removeEntry(idx);
    }
  }, [entries, removeEntry]);

  return (
    <View style={padStyles.container}>
      {entries.map((entry, idx) => {
        // Für helle Neon-Farben (Gelb, helles Grün) → dunkler Text
        const isLight = isNeon && ['#FFE600', '#00FF88'].includes(entry.color);
        const fg = isNeon ? (isLight ? '#111' : '#fff') : '#fff';
        return (
        <View key={idx} style={[
          padStyles.bubble,
          { backgroundColor: entry.color },
          isNeon && { borderWidth: 0 },
        ]}>
          <Text style={[padStyles.bullet, { color: fg + '99' }]}>•</Text>
          <TextInput
            ref={(r) => { inputRefs.current[idx] = r; }}
            style={[padStyles.bubbleInput, { color: fg }]}
            value={entry.text}
            onChangeText={(t) => updateEntry(idx, t)}
            onKeyPress={(e) => handleKeyPress(idx, e)}
            onSubmitEditing={() => addEntry(idx)}
            placeholder={idx === 0 && entries.length === 1 ? 'Notiz…' : ''}
            placeholderTextColor={fg + '55'}
            returnKeyType="done"
            blurOnSubmit={false}
          />
        </View>
        );
      })}
    </View>
  );
}

const padStyles = StyleSheet.create({
  container: {
    gap: 4,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 5,
  },
  bullet: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: 18,
  },
  bubbleInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 18,
    padding: 0,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const router = useRouter();
  const { tasks, notes, settings, scratchpad, scratchpadUpdatedAt, setScratchpad, birthdays: storeBirthdays } = useStore();
  const { colors, isDark } = useTheme();
  const { syncScratchpad, syncDriveNotes } = useGoogleDriveNotesSync();
  const { syncTasks } = useGoogleTasksSync();
  const { syncBirthdays } = useGoogleContactsBirthdaysSync();

  // Pull beim Mount + alle 30 s automatisch pollen
  useEffect(() => {
    syncScratchpad();
    const interval = setInterval(() => syncScratchpad(), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Sync-Button
  const [syncing, setSyncing] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    spinLoop.current = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 800, useNativeDriver: true })
    );
    spinLoop.current.start();

    try {
      await Promise.all([
        syncTasks().catch(() => {}),
        syncDriveNotes().catch(() => {}),
        syncBirthdays().catch(() => {}),
      ]);
      // Mails + Kalender neu laden
      if (settings.googleAccessToken) {
        setMailLoading(true);
        fetchRecentMails(settings.googleAccessToken)
          .then((r) => setMails(r.slice(0, 5))).catch(() => {}).finally(() => setMailLoading(false));
        if (settings.googleCalendarEnabled) {
          setCalLoading(true);
          listUpcomingEvents(settings.googleAccessToken, settings.selectedCalendarIds ?? [], 2)
            .then((events) => setCalEvents(events))
            .catch(() => {})
            .finally(() => setCalLoading(false));
        }
      }
      // Web: zurück zum SPA-Root (nicht reload() — das würde die aktuelle Route als Datei anfragen)
      if (Platform.OS === 'web') {
        window.location.replace(window.location.origin + '/tasks-extended/');
      }
    } finally {
      spinLoop.current?.stop();
      spinAnim.setValue(0);
      setSyncing(false);
    }
  }, [syncing, syncTasks, syncDriveNotes, syncBirthdays, settings]);

  // Debounced Drive-Upload 1,5 s nach letzter Eingabe
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleScratchpadChange = useCallback((text: string) => {
    setScratchpad(text);
    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    uploadTimer.current = setTimeout(() => {
      // Immer frisch aus dem Store lesen — Token könnte zwischenzeitlich refresht worden sein
      const { scratchpad: latest, scratchpadUpdatedAt: ts, settings: s } = useStore.getState();
      if (!s.googleAccessToken) return;
      uploadScratchpad(s.googleAccessToken, latest, ts).catch(() => {});
    }, 1500);
  }, [setScratchpad]);
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [mails, setMails] = useState<MailMessage[]>([]);
  const [mailLoading, setMailLoading] = useState(false);
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  // Tickender Takt, damit die "<2h"-Blink-Bedingung über die Zeit neu greift.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Tasks nach Fälligkeit gruppieren
  const taskGroups = useMemo(() => {
    const open = tasks.filter((t) => !t.completed);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const dayAfter  = new Date(today); dayAfter.setDate(today.getDate() + 2);

    const byGroup = { overdue: [] as Task[], today: [] as Task[], tomorrow: [] as Task[], later: [] as Task[] };

    for (const t of open) {
      if (!t.dueDate) { byGroup.later.push(t); continue; }
      const d = new Date(t.dueDate); d.setHours(0, 0, 0, 0);
      if (d < today)           byGroup.overdue.push(t);
      else if (d.getTime() === today.getTime())    byGroup.today.push(t);
      else if (d.getTime() === tomorrow.getTime()) byGroup.tomorrow.push(t);
      else                     byGroup.later.push(t);
    }

    // Innerhalb jeder Gruppe: Wichtig zuerst
    const sort = (arr: Task[]) => arr.sort((a, b) => {
      if (a.important && !b.important) return -1;
      if (!a.important && b.important) return 1;
      return 0;
    });

    return [
      { key: 'overdue',  label: 'Überfällig', tasks: sort(byGroup.overdue) },
      { key: 'today',    label: 'Heute',       tasks: sort(byGroup.today) },
      { key: 'tomorrow', label: 'Morgen',      tasks: sort(byGroup.tomorrow) },
      { key: 'later',    label: 'Später',      tasks: sort(byGroup.later) },
    ].filter((g) => g.tasks.length > 0);
  }, [tasks]);

  const recentNotes = useMemo(() =>
    [...notes]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 4),
    [notes]
  );

  // Blink-Animation für die Geburtstags-Card – Geburtstag ist heute, also
  // soll der Hinweis oben auffällig pulsieren.
  const birthdayBlinkAnim = useRef(new Animated.Value(1)).current;

  const todayBirthdays = useMemo(() => {
    const now = new Date();
    return storeBirthdays.filter(
      (b) => b.month === now.getMonth() + 1 && b.day === now.getDate()
    );
  }, [storeBirthdays]);

  useEffect(() => {
    if (!settings.googleAccessToken) return;
    setMailLoading(true);
    fetchRecentMails(settings.googleAccessToken)
      .then((r) => setMails(r.slice(0, 5)))
      .catch(() => {})
      .finally(() => setMailLoading(false));
  }, [settings.googleAccessToken]);

  useEffect(() => {
    if (!settings.googleAccessToken || !settings.googleCalendarEnabled) return;
    setCalLoading(true);
    listUpcomingEvents(settings.googleAccessToken, settings.selectedCalendarIds ?? [], 2)
      .then((events) => setCalEvents(events))
      .catch(() => {})
      .finally(() => setCalLoading(false));
  }, [settings.googleAccessToken, settings.googleCalendarEnabled, settings.selectedCalendarIds]);

  // Geburtstage beim Laden automatisch aus Google Contacts ziehen – analog zu
  // Mails/Kalender. Ohne diesen Effekt wurde die Datenbasis nur beim Login oder
  // manuellen Sync befüllt, sodass die Geburtstags-Card beim normalen App-Start
  // leer blieb, obwohl ein Kontakt heute Geburtstag hat.
  useEffect(() => {
    if (!settings.googleAccessToken || !settings.googleBirthdaysEnabled) return;
    syncBirthdays().catch(() => {});
  }, [settings.googleAccessToken, settings.googleBirthdaysEnabled, syncBirthdays]);

  // Solange heute jemand Geburtstag hat, pulsiert die Card.
  useEffect(() => {
    if (todayBirthdays.length === 0) { birthdayBlinkAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(birthdayBlinkAnim, { toValue: 0.35, duration: 650, useNativeDriver: true }),
        Animated.timing(birthdayBlinkAnim, { toValue: 1,    duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => { loop.stop(); birthdayBlinkAnim.setValue(1); };
  }, [todayBirthdays.length, birthdayBlinkAnim]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >

      {/* ── Geburtstage: ganz oben, prominent, blinkend ── */}
      {todayBirthdays.length > 0 && (
        <Animated.View style={[styles.birthdayCard, { opacity: birthdayBlinkAnim }]}>
          <Text style={styles.birthdayIcon}>🎂</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.birthdayHeading}>Geburtstag heute!</Text>
            {todayBirthdays.map((b) => (
              <Text key={b.id} style={styles.birthdayText} numberOfLines={1}>
                {b.name}{b.year != null ? ` (wird ${new Date().getFullYear() - b.year})` : ''}
              </Text>
            ))}
          </View>
        </Animated.View>
      )}

      {/* ── Sync-Button oben rechts ── */}
      <View style={styles.syncRow}>
        <Pressable
          onPress={handleSync}
          disabled={syncing}
          style={({ pressed }) => [styles.syncBtn, { opacity: pressed ? 0.6 : 1 }]}
          hitSlop={12}
        >
          <Animated.View style={{
            transform: [{
              rotate: spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
            }]
          }}>
            <Ionicons name="sync-outline" size={18} color={colors.textSecondary} />
          </Animated.View>
        </Pressable>
      </View>

      {/* ── Tasks + Scratchpad ── */}
      <View style={styles.topRow}>

        {/* Tasks */}
        <View style={styles.tasksCol}>
          <SectionLabel
            title="Tasks"
            onMore={() => router.push('/(tabs)/tasks' as any)}
            colors={colors}
          />
          {taskGroups.length === 0 ? (
            <View style={styles.emptyChips}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Alle erledigt 🎉</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {taskGroups.map((group) => {
                const isToday    = group.key === 'today';
                const isOverdue  = group.key === 'overdue';
                const isTomorrow = group.key === 'tomorrow';
                const labelColor = isOverdue || isToday
                  ? colors.danger
                  : isTomorrow
                  ? colors.textSecondary
                  : colors.textMuted;
                const chipScale: 'lg' | 'md' | 'sm' =
                  isToday || isOverdue ? 'lg' : isTomorrow ? 'md' : 'sm';
                return (
                  <View key={group.key}>
                    <Text style={[styles.dayLabel, { color: labelColor }]}>
                      {group.label}
                    </Text>
                    <View style={styles.chipWrap}>
                      {group.tasks.map((task) => (
                        <TaskChip
                          key={task.id}
                          task={task}
                          isDark={isDark}
                          colors={colors}
                          scale={chipScale}
                          blink={isDeadlineSoon(task, now)}
                          onPress={() => router.push(`/task/${task.id}` as any)}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Scratchpad */}
        <View style={styles.scratchCol}>
          <SectionLabel title="Notizblock" colors={colors} />
          <Scratchpad
            value={scratchpad}
            onChange={handleScratchpadChange}
            isDark={isDark}
            colors={colors}
          />
        </View>

      </View>

      {/* ── Kalender ── */}
      {settings.googleCalendarEnabled && (
        <View style={styles.section}>
          <SectionLabel title="Termine der nächsten 2 Tage" colors={colors} />
          {calLoading ? (
            <View style={[styles.card, styles.loadingRow]}>
              <ActivityIndicator color={C.calendar} size="small" />
            </View>
          ) : calEvents.length === 0 ? (
            <View style={[styles.card, styles.emptyRow]}>
              <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
              <Text style={styles.emptyText}>Keine Termine</Text>
            </View>
          ) : (() => {
            const todayStr    = new Date().toDateString();
            const tomorrowStr = new Date(Date.now() + 86400000).toDateString();
            const todayEvents    = calEvents.filter(e => new Date(e.start).toDateString() === todayStr);
            const tomorrowEvents = calEvents.filter(e => new Date(e.start).toDateString() === tomorrowStr);

            const renderEvent = (event: CalendarEvent, i: number, arr: CalendarEvent[], prominent: boolean) => {
              const { time } = formatEventTime(event);
              const eventColor = event.color ?? C.calendar;
              return (
                <View
                  key={event.id}
                  style={[
                    prominent ? styles.calRowProminent : styles.calRowDimmed,
                    i < arr.length - 1 && styles.rowDivider,
                  ]}
                >
                  {/* Farbbalken */}
                  <View style={[styles.calBar, {
                    backgroundColor: eventColor,
                    width: prominent ? 4 : 3,
                    opacity: prominent ? 1 : 0.6,
                  }]} />
                  {/* Zeit */}
                  <View style={prominent ? styles.calTimeLg : styles.calTimeSm}>
                    <Text style={[
                      prominent ? styles.calHourLg : styles.calHourSm,
                      { color: prominent ? colors.text : colors.textSecondary }
                    ]}>{time}</Text>
                  </View>
                  {/* Titel */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        prominent ? styles.calTitleLg : styles.calTitleSm,
                        { color: prominent ? colors.text : colors.textSecondary }
                      ]}
                      numberOfLines={1}
                    >
                      {event.summary}
                    </Text>
                    {event.location && prominent ? (
                      <Text style={[styles.calSub, { color: colors.textMuted }]} numberOfLines={1}>
                        📍 {event.location}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            };

            return (
              <View style={{ gap: 6 }}>
                {todayEvents.length > 0 && (
                  <View>
                    <Text style={[styles.dayLabel, { color: colors.danger, paddingHorizontal: 0 }]}>Heute</Text>
                    <View style={[styles.card, { borderLeftWidth: 0 }]}>
                      {todayEvents.map((e, i) => renderEvent(e, i, todayEvents, true))}
                    </View>
                  </View>
                )}
                {tomorrowEvents.length > 0 && (
                  <View>
                    <Text style={[styles.dayLabel, { color: colors.textMuted, paddingHorizontal: 0 }]}>Morgen</Text>
                    <View style={[styles.card, { borderLeftWidth: 0, opacity: 0.75 }]}>
                      {tomorrowEvents.map((e, i) => renderEvent(e, i, tomorrowEvents, false))}
                    </View>
                  </View>
                )}
              </View>
            );
          })()}
        </View>
      )}

      {/* ── Posteingang ── */}
      {settings.googleAccessToken && (
        <View style={styles.section}>
          <SectionLabel
            title="Posteingang"
            onMore={() => router.push('/(tabs)/mail')}
            colors={colors}
          />
          <View style={[styles.card, { borderLeftColor: colors.border, borderLeftWidth: 3 }]}>
            {mailLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.textMuted} size="small" />
              </View>
            ) : mails.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={styles.emptyText}>Posteingang leer</Text>
              </View>
            ) : (
              mails.map((mail, i) => (
                <View
                  key={mail.id}
                  style={[styles.mailRow, i < mails.length - 1 && styles.rowDivider]}
                >
                  <View style={[styles.mailAvatar, { backgroundColor: colors.surfaceHigh }]}>
                    <Text style={[styles.mailAvatarText, { color: colors.textSecondary }]}>
                      {parseDisplayFrom(mail.from).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.mailMeta}>
                      <Text style={[styles.mailFrom, { color: colors.text }]} numberOfLines={1}>
                        {parseDisplayFrom(mail.from)}
                      </Text>
                      <Text style={[styles.mailDate, { color: colors.textMuted }]}>
                        {formatMailDate(mail.date)}
                      </Text>
                    </View>
                    <Text style={[styles.mailSubject, { color: colors.textSecondary }]} numberOfLines={1}>
                      {mail.subject || '(Kein Betreff)'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      )}

      {/* ── Notizen ── */}
      {notes.length > 0 && (
        <View style={[styles.section, { marginBottom: 0 }]}>
          <SectionLabel
            title="Notizen"
            onMore={() => router.push('/(tabs)/notes')}
            colors={colors}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.noteScroll}
          >
            {recentNotes.map((note) => (
              <View key={note.id} style={[styles.noteCard, { backgroundColor: note.color }]}>
                {note.title ? (
                  <Text style={styles.noteCardTitle} numberOfLines={1}>
                    {note.title}
                  </Text>
                ) : null}
                <Text style={styles.noteCardContent} numberOfLines={5}>
                  {note.content ||
                    note.checklist?.map((item) => `${item.checked ? '☑' : '☐'} ${item.text}`).join('\n') ||
                    ''}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { paddingTop: 16, paddingBottom: 48, gap: 24 },

    syncRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      marginBottom: -8,
    },
    syncBtn: {
      padding: 4,
    },

    section: {},

    // Two-column top layout
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingRight: 16,
    },
    tasksCol: {
      flex: 1,
      minWidth: 0,
    },
    scratchCol: {
      flex: 1,
      minWidth: 0,
      paddingLeft: 8,
    },

    card: {
      marginHorizontal: 16,
      backgroundColor: c.surface,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
    },

    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    loadingRow: { padding: 18, alignItems: 'center' },
    emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
    emptyText: { fontSize: 13, color: c.textSecondary },

    dayLabel: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      paddingHorizontal: 16,
      marginBottom: 4,
    },

    // Task chips
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      gap: 8,
    },
    emptyChips: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
    },

    // Birthday – ganz oben, prominent, blinkend
    birthdayCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,149,0,0.18)' : '#FFE0B2',
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 8,
      borderRadius: 14,
      padding: 16,
      gap: 12,
      borderWidth: 2,
      borderColor: '#FF9500',
    },
    birthdayIcon: { fontSize: 30 },
    birthdayHeading: {
      fontSize: 15,
      fontWeight: '800',
      color: '#FF9500',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    birthdayText: { fontSize: 16, fontWeight: '700', color: isDark ? '#FFC06A' : '#7A4100' },

    // Mail
    mailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 11,
      gap: 10,
    },
    mailAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mailAvatarText: { fontSize: 12, fontWeight: '700' },
    mailMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    mailFrom: { fontSize: 13, fontWeight: '600', flex: 1, marginRight: 6 },
    mailDate: { fontSize: 11 },
    mailSubject: { fontSize: 12 },

    // Calendar
    calRowProminent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
    calRowDimmed:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9,  gap: 10 },
    calTimeLg: { width: 46 },
    calTimeSm: { width: 40 },
    calHourLg: { fontSize: 15, fontWeight: '700' },
    calHourSm: { fontSize: 12, fontWeight: '500' },
    calBar: { borderRadius: 2, alignSelf: 'stretch', minHeight: 24 },
    calTitleLg: { fontSize: 14, fontWeight: '600' },
    calTitleSm: { fontSize: 12, fontWeight: '400' },
    calSub: { fontSize: 11, marginTop: 2 },
    // compat
    calRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
    calTime: { width: 52, alignItems: 'center' as const },
    calDay: { fontSize: 9, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    calHour: { fontSize: 14, fontWeight: '700' as const },
    calTitle: { fontSize: 14, fontWeight: '500' as const },

    // Notes
    noteScroll: { paddingHorizontal: 16, gap: 10 },
    noteCard: { width: 150, minHeight: 100, borderRadius: 12, padding: 12 },
    noteCardTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: 'rgba(0,0,0,0.8)',
      marginBottom: 4,
    },
    noteCardContent: { fontSize: 12, color: 'rgba(0,0,0,0.65)', lineHeight: 17 },
  });
}
