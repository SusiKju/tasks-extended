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
}: {
  task: Task;
  onPress: () => void;
  isDark: boolean;
}) {
  const urgent = isUrgent(task);
  const label = chipDueLabel(task);
  const isImportant = task.important;

  // Im Dunkelmodus: aufgehelltes Rot mit gutem Kontrast
  // Reines #FF3B30 auf #141414 hat zu wenig Helligkeit → #FF8A80 ist deutlich lesbarer
  const importantText  = isDark ? '#FF8A80' : C.important;
  const importantBg    = isDark ? 'rgba(255,80,60,0.22)' : C.important + '12';
  const importantBorder= isDark ? 'rgba(255,100,80,0.65)' : C.important + '50';

  const bgColor = isImportant
    ? importantBg
    : urgent
    ? (isDark ? 'rgba(255,80,60,0.18)' : C.overdue + '10')
    : C.tasks + '10';

  const borderColor = isImportant
    ? importantBorder
    : urgent
    ? (isDark ? 'rgba(255,100,80,0.55)' : C.overdue + '40')
    : C.tasks + '35';

  const textColor = isImportant
    ? importantText
    : urgent
    ? (isDark ? '#FF8A80' : C.overdue)
    : C.tasks;

  return (
    <Pressable
      style={({ pressed }) => [
        chipStyles.chip,
        { backgroundColor: bgColor, borderColor, opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={onPress}
    >
      {isImportant && (
        <Ionicons name="flag" size={11} color={textColor} style={{ marginRight: 2 }} />
      )}
      <Text style={[chipStyles.title, { color: textColor }]} numberOfLines={1}>
        {task.title}
      </Text>
      {label ? (
        <Text style={[chipStyles.label, { color: textColor + 'BB' }]}>{label}</Text>
      ) : null}
    </Pressable>
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

const BUBBLE_PALETTE = [
  '#1E3A5F', '#2D1B4E', '#1A3A2E', '#3D1F1F',
  '#1F3D30', '#3D2D1F', '#1F2D3D', '#2D3D1F',
  '#3A1F3A', '#1F3A3A', '#2A2040', '#40201A',
];

function randomBubbleColor(): string {
  return BUBBLE_PALETTE[Math.floor(Math.random() * BUBBLE_PALETTE.length)];
}

function parseScratchpad(raw: string): ScratchEntry[] {
  if (!raw || raw.trim() === '') return [{ text: '', color: randomBubbleColor() }];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  // Plain-text-Fallback: jede Zeile wird eine Bubble
  const lines = raw.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('─'));
  if (lines.length === 0) return [{ text: '', color: randomBubbleColor() }];
  return lines.map((text, i) => ({ text, color: BUBBLE_PALETTE[i % BUBBLE_PALETTE.length] }));
}

function serializeScratchpad(entries: ScratchEntry[]): string {
  return JSON.stringify(entries);
}

function Scratchpad({
  value, onChange,
}: {
  value: string;
  onChange: (t: string) => void;
  isDark: boolean;
  colors: ThemeColors;
}) {
  const entries = useMemo(() => parseScratchpad(value), [value]);
  const inputRefs = useRef<(any)[]>([]);

  const updateEntry = useCallback((idx: number, text: string) => {
    const next = entries.map((e, i) => i === idx ? { ...e, text } : e);
    onChange(serializeScratchpad(next));
  }, [entries, onChange]);

  const addEntry = useCallback((afterIdx: number) => {
    const next = [...entries];
    next.splice(afterIdx + 1, 0, { text: '', color: randomBubbleColor() });
    onChange(serializeScratchpad(next));
    setTimeout(() => inputRefs.current[afterIdx + 1]?.focus(), 40);
  }, [entries, onChange]);

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
      {entries.map((entry, idx) => (
        <View key={idx} style={[padStyles.bubble, { backgroundColor: entry.color }]}>
          <Text style={padStyles.bullet}>•</Text>
          <TextInput
            ref={(r) => { inputRefs.current[idx] = r; }}
            style={padStyles.bubbleInput}
            value={entry.text}
            onChangeText={(t) => updateEntry(idx, t)}
            onKeyPress={(e) => handleKeyPress(idx, e)}
            onSubmitEditing={() => addEntry(idx)}
            placeholder={idx === 0 && entries.length === 1 ? 'Notiz…' : ''}
            placeholderTextColor="rgba(255,255,255,0.3)"
            returnKeyType="done"
            blurOnSubmit={false}
          />
        </View>
      ))}
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
  const { tasks, notes, settings, scratchpad, scratchpadUpdatedAt, setScratchpad } = useStore();
  const { colors, isDark } = useTheme();
  const { syncScratchpad, syncDriveNotes } = useGoogleDriveNotesSync();
  const { syncTasks } = useGoogleTasksSync();

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
      ]);
      // Mails + Kalender neu laden
      if (settings.googleAccessToken) {
        setMailLoading(true);
        fetchRecentMails(settings.googleAccessToken)
          .then((r) => setMails(r.slice(0, 5))).catch(() => {}).finally(() => setMailLoading(false));
        if (settings.googleCalendarEnabled) {
          setCalLoading(true);
          Promise.all([
            listUpcomingEvents(settings.googleAccessToken, settings.selectedCalendarIds ?? [], 2),
            listUpcomingEvents(settings.googleAccessToken, ['#contacts@group.v.calendar.google.com'], 1),
          ]).then(([events, bdays]) => {
            setCalEvents(events.filter((e) => !e.summary?.toLowerCase().includes('geburtstag') && !e.calendarName?.toLowerCase().includes('geburtstag')));
            setBirthdays([...bdays, ...events.filter((e) => e.summary?.toLowerCase().includes('geburtstag') || e.calendarName?.toLowerCase().includes('geburtstag'))]);
          }).catch(() => {}).finally(() => setCalLoading(false));
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
  }, [syncing, syncTasks, syncDriveNotes, settings]);

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
  const [birthdays, setBirthdays] = useState<CalendarEvent[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  // Important tasks first, then regular open tasks — both sorted by urgency
  const allOpenTasks = useMemo(() =>
    tasks
      .filter((t) => !t.completed)
      .sort((a, b) => {
        // Important always on top
        if (a.important && !b.important) return -1;
        if (!a.important && b.important) return 1;
        // Then by date
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      }),
    [tasks]
  );

  const recentNotes = useMemo(() =>
    [...notes]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 4),
    [notes]
  );

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
    Promise.all([
      listUpcomingEvents(settings.googleAccessToken, settings.selectedCalendarIds ?? [], 2),
      listUpcomingEvents(settings.googleAccessToken, ['#contacts@group.v.calendar.google.com'], 1),
    ])
      .then(([events, bdays]) => {
        setCalEvents(events.filter(
          (e) =>
            !e.summary?.toLowerCase().includes('geburtstag') &&
            !e.calendarName?.toLowerCase().includes('geburtstag')
        ));
        setBirthdays([
          ...bdays,
          ...events.filter(
            (e) =>
              e.summary?.toLowerCase().includes('geburtstag') ||
              e.calendarName?.toLowerCase().includes('geburtstag')
          ),
        ]);
      })
      .catch(() => {})
      .finally(() => setCalLoading(false));
  }, [settings.googleAccessToken, settings.googleCalendarEnabled, settings.selectedCalendarIds]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >

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

      {/* ── Geburtstage ── */}
      {birthdays.length > 0 && (
        <View style={styles.birthdayCard}>
          <Text style={styles.birthdayIcon}>🎂</Text>
          <View style={{ flex: 1 }}>
            {birthdays.map((e) => (
              <Text key={e.id} style={styles.birthdayText} numberOfLines={1}>
                {e.summary}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* ── Tasks + Scratchpad ── */}
      <View style={styles.topRow}>

        {/* Tasks */}
        <View style={styles.tasksCol}>
          <SectionLabel
            title="Tasks"
            onMore={() => router.push('/(tabs)/tasks' as any)}
            colors={colors}
          />
          {allOpenTasks.length === 0 ? (
            <View style={styles.emptyChips}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Alle erledigt 🎉</Text>
            </View>
          ) : (
            <View style={styles.chipWrap}>
              {allOpenTasks.map((task) => (
                <TaskChip
                  key={task.id}
                  task={task}
                  isDark={isDark}
                  onPress={() => router.push(`/task/${task.id}` as any)}
                />
              ))}
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
          <SectionLabel title="Nächste 2 Tage" colors={colors} />
          <View style={styles.card}>
            {calLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={C.calendar} size="small" />
              </View>
            ) : calEvents.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                <Text style={styles.emptyText}>Keine Termine</Text>
              </View>
            ) : (
              calEvents.map((event, i) => {
                const { day, time } = formatEventTime(event);
                const eventColor = event.color ?? C.calendar;
                return (
                  <View
                    key={event.id}
                    style={[styles.calRow, i < calEvents.length - 1 && styles.rowDivider]}
                  >
                    <View style={styles.calTime}>
                      <Text style={[styles.calDay, { color: eventColor }]}>{day}</Text>
                      <Text style={[styles.calHour, { color: colors.text }]}>{time}</Text>
                    </View>
                    <View style={[styles.calBar, { backgroundColor: eventColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.calTitle, { color: colors.text }]} numberOfLines={1}>
                        {event.summary}
                      </Text>
                      {event.location ? (
                        <Text style={[styles.calSub, { color: colors.textSecondary }]} numberOfLines={1}>
                          📍 {event.location}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
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

    // Birthday
    birthdayCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,149,0,0.12)' : '#FFF3E0',
      marginHorizontal: 16,
      borderRadius: 12,
      padding: 12,
      gap: 10,
      borderLeftWidth: 3,
      borderLeftColor: '#FF9500',
    },
    birthdayIcon: { fontSize: 20 },
    birthdayText: { fontSize: 13, fontWeight: '600', color: isDark ? '#FFC06A' : '#7A4100' },

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
    calRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 11,
      gap: 10,
    },
    calTime: { width: 52, alignItems: 'center' },
    calDay: {
      fontSize: 9,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    calHour: { fontSize: 14, fontWeight: '700' },
    calBar: { width: 3, borderRadius: 2, alignSelf: 'stretch', minHeight: 28 },
    calTitle: { fontSize: 14, fontWeight: '500' },
    calSub: { fontSize: 11, marginTop: 1 },

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
