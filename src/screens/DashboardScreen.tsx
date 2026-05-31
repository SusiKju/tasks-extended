import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { useTheme, ThemeColors } from '../utils/theme';
import { isOverdue } from '../utils/dateFormat';
import { fetchRecentMails, MailMessage } from '../services/googleMail';
import { listUpcomingEvents, CalendarEvent } from '../services/googleCalendar';
import { Task, Note } from '../types';

// ─── Section accent colors ────────────────────────────────────────────────────
const SECTION_COLORS = {
  mail:     '#3B82F6',
  tasks:    '#10B981',
  calendar: '#F59E0B',
  notes:    '#8B5CF6',
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
    return { day: dayLabel(d), time: d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) };
  } catch { return { day: '', time: '' }; }
}

function dayLabel(d: Date): string {
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return 'Heute';
  if (d.toDateString() === tomorrow.toDateString()) return 'Morgen';
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function formatDue(dueDate: string | null): { label: string; urgent: boolean } {
  if (!dueDate) return { label: '', urgent: false };
  try {
    const d = new Date(dueDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(d); due.setHours(0, 0, 0, 0);
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return { label: 'Überfällig', urgent: true };
    if (diff === 0) return { label: 'Heute', urgent: true };
    if (diff === 1) return { label: 'Morgen', urgent: false };
    return { label: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }), urgent: false };
  } catch { return { label: '', urgent: false }; }
}

// ─── Focus Tiles ──────────────────────────────────────────────────────────────

interface FocusTile {
  id: string;
  icon: string;
  label: string;
  value: string;
  color: string;
  active: boolean;
  onPress?: () => void;
}

function FocusTiles({ tiles }: { tiles: FocusTile[] }) {
  return (
    <View style={tileStyles.row}>
      {tiles.map((tile) => (
        <Pressable
          key={tile.id}
          style={({ pressed }) => [
            tileStyles.tile,
            {
              borderColor: tile.active ? tile.color + '60' : 'transparent',
              backgroundColor: tile.active ? tile.color + '15' : 'rgba(128,128,128,0.08)',
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          onPress={tile.onPress}
          disabled={!tile.onPress}
        >
          <Ionicons name={tile.icon as any} size={13} color={tile.active ? tile.color : 'rgba(128,128,128,0.5)'} />
          <Text style={[tileStyles.value, { color: tile.active ? tile.color : 'rgba(128,128,128,0.6)' }]}>
            {tile.value}
          </Text>
          <Text style={[tileStyles.label, { color: tile.active ? tile.color + 'CC' : 'rgba(128,128,128,0.45)' }]}>
            {tile.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const tileStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
  },
  tile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 3,
  },
  value: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  label: { fontSize: 9, fontWeight: '600', letterSpacing: 0.2, textAlign: 'center' },
});

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle, count, accent, onMore, colors }: {
  icon: string; title: string; subtitle?: string; count?: number;
  accent: string; onMore?: () => void; colors: ThemeColors;
}) {
  return (
    <View style={[secStyles.wrap, { borderLeftColor: accent }]}>
      <View style={secStyles.top}>
        <Ionicons name={icon as any} size={14} color={accent} />
        <Text style={[secStyles.title, { color: colors.text }]}>{title}</Text>
        {count !== undefined && count > 0 && (
          <View style={[secStyles.badge, { backgroundColor: accent + '22' }]}>
            <Text style={[secStyles.badgeText, { color: accent }]}>{count}</Text>
          </View>
        )}
        {onMore && (
          <Pressable onPress={onMore} style={{ marginLeft: 'auto' as any }} hitSlop={8}>
            <Text style={{ fontSize: 11, color: accent, fontWeight: '600' }}>Alle →</Text>
          </Pressable>
        )}
      </View>
      {subtitle && <Text style={[secStyles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
    </View>
  );
}

const secStyles = StyleSheet.create({
  wrap: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginLeft: 16,
    marginRight: 16,
    marginBottom: 8,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '800' },
  badge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 1 },
});

// ─── Blink hook ───────────────────────────────────────────────────────────────

function useBlink(): [Animated.Value, () => void] {
  const anim = useRef(new Animated.Value(1)).current;
  const blink = useCallback(() => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 0.2, duration: 150, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1,   duration: 150, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.2, duration: 150, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1,   duration: 200, useNativeDriver: true }),
    ]).start();
  }, [anim]);
  return [anim, blink];
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const router = useRouter();
  const { tasks, notes, settings } = useStore();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [mails, setMails] = useState<MailMessage[]>([]);
  const [mailLoading, setMailLoading] = useState(false);
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [birthdays, setBirthdays] = useState<CalendarEvent[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  // Scroll refs
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});

  // Blink anims per section
  const [mailBlink, triggerMailBlink]     = useBlink();
  const [taskBlink, triggerTaskBlink]     = useBlink();
  const [calBlink,  triggerCalBlink]      = useBlink();
  const [notesBlink, triggerNotesBlink]   = useBlink();

  const scrollTo = useCallback((section: string, triggerBlink: () => void) => {
    const y = sectionY.current[section] ?? 0;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    setTimeout(triggerBlink, 400);
  }, []);

  const upcomingTasks = useMemo(() =>
    tasks.filter((t) => !t.completed)
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1; if (b.dueDate) return 1; return 0;
      }).slice(0, 5),
    [tasks]
  );

  const overdueCount = useMemo(() => tasks.filter((t) => !t.completed && isOverdue(t.dueDate)).length, [tasks]);
  const openCount = useMemo(() => tasks.filter((t) => !t.completed).length, [tasks]);
  const recentNotes = useMemo(() =>
    [...notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 3),
    [notes]
  );

  useEffect(() => {
    if (!settings.googleAccessToken) return;
    setMailLoading(true);
    fetchRecentMails(settings.googleAccessToken)
      .then((r) => setMails(r.slice(0, 5))).catch(() => {}).finally(() => setMailLoading(false));
  }, [settings.googleAccessToken]);

  useEffect(() => {
    if (!settings.googleAccessToken || !settings.googleCalendarEnabled) return;
    setCalLoading(true);
    Promise.all([
      listUpcomingEvents(settings.googleAccessToken, settings.selectedCalendarIds ?? [], 2),
      listUpcomingEvents(settings.googleAccessToken, ['#contacts@group.v.calendar.google.com'], 1),
    ]).then(([events, bdays]) => {
      setCalEvents(events.filter((e) => !e.summary?.toLowerCase().includes('geburtstag') && !e.calendarName?.toLowerCase().includes('geburtstag')));
      setBirthdays([...bdays, ...events.filter((e) => e.summary?.toLowerCase().includes('geburtstag') || e.calendarName?.toLowerCase().includes('geburtstag'))]);
    }).catch(() => {}).finally(() => setCalLoading(false));
  }, [settings.googleAccessToken, settings.googleCalendarEnabled, settings.selectedCalendarIds]);

  const now = new Date();

  const focusTiles = useMemo((): FocusTile[] => {
    const todayTasks = tasks.filter((t) => !t.completed && t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString());
    const overdue = tasks.filter((t) => !t.completed && isOverdue(t.dueDate));
    const todayBirthdays = birthdays.filter((e) => new Date(e.start).toDateString() === now.toDateString());
    const todayMails = mails.filter((m) => new Date(m.date).toDateString() === now.toDateString());
    const todayCal = calEvents.filter((e) => new Date(e.start).toDateString() === now.toDateString());

    return [
      { id: 'mails',   icon: 'mail',             value: `${todayMails.length}`, label: 'neue mails',  active: todayMails.length > 0,  color: SECTION_COLORS.mail,     onPress: () => scrollTo('mail',  triggerMailBlink) },
      { id: 'overdue', icon: 'alert-circle',     value: `${overdue.length}`,    label: 'überfällig',  active: overdue.length > 0,     color: '#FF3B30',               onPress: () => scrollTo('tasks', triggerTaskBlink) },
      { id: 'tasks',   icon: 'checkmark-circle', value: `${todayTasks.length}`, label: 'tasks heute', active: todayTasks.length > 0,  color: SECTION_COLORS.tasks,    onPress: () => scrollTo('tasks', triggerTaskBlink) },
      { id: 'cal',     icon: 'calendar',         value: `${todayCal.length}`,   label: 'termine',     active: todayCal.length > 0,    color: SECTION_COLORS.calendar, onPress: () => scrollTo('cal',   triggerCalBlink) },
    ];
  }, [tasks, birthdays, mails, calEvents, scrollTo, triggerTaskBlink, triggerMailBlink, triggerCalBlink, triggerNotesBlink]);

  const todayStr = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* ── Header ── */}
      <Text style={styles.heroDate}>{todayStr}</Text>

      {/* ── Focus Tiles ── */}
      <View style={{ marginBottom: 20 }}>
        <FocusTiles tiles={focusTiles} />
      </View>

      {/* ── Geburtstage ── */}
      {birthdays.length > 0 && (
        <View style={[styles.birthdayCard, { marginBottom: 14 }]}>
          <Text style={styles.birthdayIcon}>🎂</Text>
          <View style={{ flex: 1 }}>
            {birthdays.map((e) => <Text key={e.id} style={styles.birthdayText} numberOfLines={1}>{e.summary}</Text>)}
          </View>
        </View>
      )}

      {/* ── Mails ── */}
      {settings.googleAccessToken && (
        <Animated.View
          style={[styles.section, { opacity: mailBlink }]}
          onLayout={(e) => { sectionY.current['mail'] = e.nativeEvent.layout.y; }}
        >
          <SectionHeader icon="mail-outline" title="Posteingang" subtitle="Ungelesene Mails der letzten 2 Tage" count={mails.length} accent={SECTION_COLORS.mail} onMore={() => router.push('/(tabs)/mail')} colors={colors} />
          <View style={[styles.card, { borderLeftColor: SECTION_COLORS.mail + '40', borderLeftWidth: 3 }]}>
            {mailLoading ? (
              <View style={styles.loadingRow}><ActivityIndicator color={SECTION_COLORS.mail} size="small" /></View>
            ) : mails.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                <Text style={styles.emptyText}>Posteingang leer</Text>
              </View>
            ) : mails.map((mail, i) => (
              <View key={mail.id} style={[styles.mailRow, i < mails.length - 1 && styles.rowDivider]}>
                <View style={[styles.mailAvatar, { backgroundColor: SECTION_COLORS.mail + '20' }]}>
                  <Text style={[styles.mailAvatarText, { color: SECTION_COLORS.mail }]}>{parseDisplayFrom(mail.from).charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.mailMeta}>
                    <Text style={styles.mailFrom} numberOfLines={1}>{parseDisplayFrom(mail.from)}</Text>
                    <Text style={styles.mailDate}>{formatMailDate(mail.date)}</Text>
                  </View>
                  <Text style={styles.mailSubject} numberOfLines={1}>{mail.subject || '(Kein Betreff)'}</Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>
      )}

      {/* ── Tasks ── */}
      <Animated.View
        style={[styles.section, { opacity: taskBlink }]}
        onLayout={(e) => { sectionY.current['tasks'] = e.nativeEvent.layout.y; }}
      >
        <SectionHeader icon="checkmark-circle-outline" title="Tasks" subtitle="Offene Tasks, sortiert nach Fälligkeit" count={openCount} accent={overdueCount > 0 ? '#FF3B30' : SECTION_COLORS.tasks} onMore={() => router.push('/(tabs)/')} colors={colors} />
        <View style={[styles.card, { borderLeftColor: (overdueCount > 0 ? '#FF3B30' : SECTION_COLORS.tasks) + '40', borderLeftWidth: 3 }]}>
          {upcomingTasks.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
              <Text style={styles.emptyText}>Alle Tasks erledigt 🎉</Text>
            </View>
          ) : upcomingTasks.map((task, i) => {
            const { label, urgent } = formatDue(task.dueDate);
            return (
              <Pressable key={task.id} style={[styles.taskRow, i < upcomingTasks.length - 1 && styles.rowDivider]} onPress={() => router.push(`/task/${task.id}` as any)}>
                <View style={[styles.taskAccent, { backgroundColor: urgent ? '#FF3B30' : SECTION_COLORS.tasks }]} />
                <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                {label !== '' && (
                  <View style={[styles.duePill, { backgroundColor: (urgent ? '#FF3B30' : SECTION_COLORS.tasks) + '20' }]}>
                    <Text style={[styles.dueText, { color: urgent ? '#FF3B30' : SECTION_COLORS.tasks }]}>{label}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {/* ── Kalender ── */}
      {settings.googleCalendarEnabled && (
        <Animated.View
          style={[styles.section, { opacity: calBlink }]}
          onLayout={(e) => { sectionY.current['cal'] = e.nativeEvent.layout.y; }}
        >
          <SectionHeader icon="calendar-outline" title="Nächste 2 Tage" subtitle="Termine aus ausgewählten Kalendern" count={calEvents.length} accent={SECTION_COLORS.calendar} colors={colors} />
          <View style={[styles.card, { borderLeftColor: SECTION_COLORS.calendar + '40', borderLeftWidth: 3 }]}>
            {calLoading ? (
              <View style={styles.loadingRow}><ActivityIndicator color={SECTION_COLORS.calendar} size="small" /></View>
            ) : calEvents.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
                <Text style={styles.emptyText}>Keine Termine</Text>
              </View>
            ) : calEvents.map((event, i) => {
              const { day, time } = formatEventTime(event);
              return (
                <View key={event.id} style={[styles.calRow, i < calEvents.length - 1 && styles.rowDivider]}>
                  <View style={styles.calTime}>
                    <Text style={[styles.calDay, { color: SECTION_COLORS.calendar }]}>{day}</Text>
                    <Text style={styles.calHour}>{time}</Text>
                  </View>
                  <View style={[styles.calBar, { backgroundColor: SECTION_COLORS.calendar }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.calTitle} numberOfLines={1}>{event.summary}</Text>
                    {event.location ? <Text style={styles.calSub} numberOfLines={1}>📍 {event.location}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.View>
      )}

      {/* ── Notizen ── */}
      <Animated.View
        style={[styles.section, { marginBottom: 0, opacity: notesBlink }]}
        onLayout={(e) => { sectionY.current['notes'] = e.nativeEvent.layout.y; }}
      >
        <SectionHeader icon="document-text-outline" title="Notizen" subtitle="Zuletzt bearbeitet" count={notes.length} accent={SECTION_COLORS.notes} onMore={() => router.push('/(tabs)/notes')} colors={colors} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.noteScroll}>
          {recentNotes.map((note) => (
            <View key={note.id} style={[styles.noteCard, { backgroundColor: note.color }]}>
              {note.title ? <Text style={styles.noteCardTitle} numberOfLines={1}>{note.title}</Text> : null}
              <Text style={styles.noteCardContent} numberOfLines={4}>
                {note.content || note.checklist?.map((i) => `${i.checked ? '☑' : '☐'} ${i.text}`).join('\n') || ''}
              </Text>
            </View>
          ))}
          {notes.length === 0 && (
            <View style={[styles.noteCard, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Keine Notizen</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { paddingTop: 12, paddingBottom: 40 },

    heroDate: {
      fontSize: 13, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 16, marginBottom: 12,
    },

    section: { marginBottom: 18 },

    card: {
      marginHorizontal: 16,
      backgroundColor: c.surface,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
    },

    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    loadingRow: { padding: 20, alignItems: 'center' },
    emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
    emptyText: { fontSize: 13, color: c.textSecondary },

    // Birthday
    birthdayCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: '#FFF3E0', marginHorizontal: 16,
      borderRadius: 12, padding: 12, gap: 10,
      borderLeftWidth: 3, borderLeftColor: '#FF9500',
    },
    birthdayIcon: { fontSize: 22 },
    birthdayText: { fontSize: 13, fontWeight: '600', color: '#7A4100' },

    // Mail
    mailRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
    mailAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    mailAvatarText: { fontSize: 13, fontWeight: '700' },
    mailMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
    mailFrom: { fontSize: 13, fontWeight: '600', color: c.text, flex: 1, marginRight: 6 },
    mailDate: { fontSize: 11, color: c.textSecondary },
    mailSubject: { fontSize: 12, color: c.textSecondary },

    // Tasks
    taskRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
    taskAccent: { width: 3, borderRadius: 2, alignSelf: 'stretch', minHeight: 16 },
    taskTitle: { flex: 1, fontSize: 14, fontWeight: '500', color: c.text },
    duePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    dueText: { fontSize: 11, fontWeight: '700' },

    // Calendar
    calRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
    calTime: { width: 50, alignItems: 'center' },
    calDay: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    calHour: { fontSize: 13, fontWeight: '600', color: c.text },
    calBar: { width: 3, borderRadius: 2, alignSelf: 'stretch', minHeight: 28 },
    calTitle: { fontSize: 14, fontWeight: '500', color: c.text },
    calSub: { fontSize: 11, color: c.textSecondary, marginTop: 1 },

    // Notes
    noteScroll: { paddingHorizontal: 16, gap: 10 },
    noteCard: { width: 155, minHeight: 90, borderRadius: 12, padding: 12 },
    noteCardTitle: { fontSize: 12, fontWeight: '700', color: 'rgba(0,0,0,0.8)', marginBottom: 4 },
    noteCardContent: { fontSize: 12, color: 'rgba(0,0,0,0.7)', lineHeight: 17 },
  });
}
