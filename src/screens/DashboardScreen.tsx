import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { useTheme, ThemeColors, neonGlow } from '../utils/theme';
import { isOverdue } from '../utils/dateFormat';
import { fetchRecentMails, MailMessage } from '../services/googleMail';
import { listUpcomingEvents, CalendarEvent } from '../services/googleCalendar';
import { Task, Note } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Gute Nacht';
  if (h < 12) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function parseDisplayFrom(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*<?[^>]*>?$/);
  return match ? match[1].trim() : from.replace(/<[^>]+>/, '').trim() || from;
}

function formatMailDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
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
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return 'Heute';
  if (d.toDateString() === tomorrow.toDateString()) return 'Morgen';
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function formatDue(dueDate: string | null): { label: string; urgent: boolean } {
  if (!dueDate) return { label: '', urgent: false };
  try {
    const d = new Date(dueDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return { label: 'Überfällig', urgent: true };
    if (diff === 0) return { label: 'Heute', urgent: true };
    if (diff === 1) return { label: 'Morgen', urgent: false };
    return { label: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }), urgent: false };
  } catch { return { label: '', urgent: false }; }
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[chipStyle.pill, { backgroundColor: bg }]}>
      <Text style={[chipStyle.text, { color }]}>{label}</Text>
    </View>
  );
}
const chipStyle = StyleSheet.create({
  pill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
});

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionLabel({ icon, title, count, onMore, colors }: {
  icon: string; title: string; count?: number;
  onMore?: () => void; colors: ThemeColors;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 16 }}>
      <Ionicons name={icon as any} size={14} color={colors.accentNeon} />
      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.accentNeon, marginLeft: 5, letterSpacing: 1, textTransform: 'uppercase' }}>
        {title}
      </Text>
      {count !== undefined && count > 0 && (
        <View style={{ backgroundColor: colors.accentNeon + '22', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 6 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.accentNeon }}>{count}</Text>
        </View>
      )}
      {onMore && (
        <Pressable onPress={onMore} style={{ marginLeft: 'auto' as any }} hitSlop={8}>
          <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>Alle →</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Birthday Row ─────────────────────────────────────────────────────────────

function BirthdayCard({ events, colors, styles }: { events: CalendarEvent[]; colors: ThemeColors; styles: any }) {
  if (events.length === 0) return null;
  return (
    <View style={styles.birthdayCard}>
      <Text style={styles.birthdayIcon}>🎂</Text>
      <View style={{ flex: 1 }}>
        {events.map((e) => (
          <Text key={e.id} style={styles.birthdayText} numberOfLines={1}>{e.summary}</Text>
        ))}
      </View>
    </View>
  );
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

  // Upcoming tasks (open, sorted by due date)
  const upcomingTasks = useMemo(() => {
    return tasks
      .filter((t) => !t.completed)
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      })
      .slice(0, 5);
  }, [tasks]);

  const overdueCount = useMemo(() => tasks.filter((t) => !t.completed && isOverdue(t.dueDate)).length, [tasks]);
  const openCount = useMemo(() => tasks.filter((t) => !t.completed).length, [tasks]);

  const recentNotes = useMemo(() =>
    [...notes]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3),
    [notes]
  );

  // Load mails
  useEffect(() => {
    if (!settings.googleAccessToken) return;
    setMailLoading(true);
    fetchRecentMails(settings.googleAccessToken)
      .then((r) => setMails(r.slice(0, 5)))
      .catch(() => {})
      .finally(() => setMailLoading(false));
  }, [settings.googleAccessToken]);

  // Load calendar events + birthdays
  useEffect(() => {
    if (!settings.googleAccessToken || !settings.googleCalendarEnabled) return;
    setCalLoading(true);
    Promise.all([
      listUpcomingEvents(settings.googleAccessToken, settings.selectedCalendarIds ?? [], 2),
      listUpcomingEvents(settings.googleAccessToken, ['#contacts@group.v.calendar.google.com'], 1),
    ])
      .then(([events, bdays]) => {
        setCalEvents(events.filter((e) => !e.summary?.toLowerCase().includes('geburtstag') && !e.calendarName?.toLowerCase().includes('geburtstag')));
        setBirthdays([
          ...bdays,
          ...events.filter((e) => e.summary?.toLowerCase().includes('geburtstag') || e.calendarName?.toLowerCase().includes('geburtstag')),
        ]);
      })
      .catch(() => {})
      .finally(() => setCalLoading(false));
  }, [settings.googleAccessToken, settings.googleCalendarEnabled, settings.selectedCalendarIds]);

  const now = new Date();
  const todayStr = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero ── */}
      <View style={styles.hero}>
        <View>
          <Text style={styles.heroGreeting}>{greeting()} 👋</Text>
          <Text style={styles.heroDate}>{todayStr}</Text>
        </View>
        <View style={styles.heroStats}>
          {overdueCount > 0 && (
            <Chip label={`${overdueCount} überfällig`} color={colors.danger} bg={colors.danger + '22'} />
          )}
          <Chip label={`${openCount} Tasks`} color={colors.accentNeon} bg={colors.accentNeon + '18'} />
          <Chip label={`${notes.length} Notizen`} color={colors.textSecondary} bg={colors.border} />
        </View>
      </View>

      {/* ── Geburtstage ── */}
      {birthdays.length > 0 && (
        <BirthdayCard events={birthdays} colors={colors} styles={styles} />
      )}

      {/* ── Mails ── */}
      {settings.googleAccessToken && (
        <View style={styles.section}>
          <SectionLabel icon="mail-outline" title="Posteingang" count={mails.length} onMore={() => router.push('/(tabs)/mail')} colors={colors} />
          <View style={styles.card}>
            {mailLoading ? (
              <View style={styles.loadingRow}><ActivityIndicator color={colors.accentNeon} size="small" /></View>
            ) : mails.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
                <Text style={styles.emptyText}>Posteingang leer</Text>
              </View>
            ) : mails.map((mail, i) => (
              <View key={mail.id} style={[styles.mailRow, i < mails.length - 1 && styles.rowDivider]}>
                <View style={styles.mailAvatar}>
                  <Text style={styles.mailAvatarText}>{parseDisplayFrom(mail.from).charAt(0).toUpperCase()}</Text>
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
        </View>
      )}

      {/* ── Tasks ── */}
      <View style={styles.section}>
        <SectionLabel icon="checkmark-circle-outline" title="Tasks" count={openCount} onMore={() => router.push('/(tabs)/')} colors={colors} />
        <View style={styles.card}>
          {upcomingTasks.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
              <Text style={styles.emptyText}>Alle Tasks erledigt 🎉</Text>
            </View>
          ) : upcomingTasks.map((task, i) => {
            const { label, urgent } = formatDue(task.dueDate);
            return (
              <Pressable
                key={task.id}
                style={[styles.taskRow, i < upcomingTasks.length - 1 && styles.rowDivider]}
                onPress={() => router.push(`/task/${task.id}` as any)}
              >
                <View style={[styles.taskAccent, { backgroundColor: urgent ? colors.danger : colors.accentNeon }]} />
                <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                {label !== '' && (
                  <Chip
                    label={label}
                    color={urgent ? colors.danger : colors.textSecondary}
                    bg={urgent ? colors.danger + '18' : colors.border}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Kalender ── */}
      {settings.googleCalendarEnabled && (
        <View style={styles.section}>
          <SectionLabel icon="calendar-outline" title="Nächste 2 Tage" count={calEvents.length} colors={colors} />
          <View style={styles.card}>
            {calLoading ? (
              <View style={styles.loadingRow}><ActivityIndicator color={colors.accentNeon} size="small" /></View>
            ) : calEvents.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
                <Text style={styles.emptyText}>Keine Termine</Text>
              </View>
            ) : calEvents.map((event, i) => {
              const { day, time } = formatEventTime(event);
              return (
                <View key={event.id} style={[styles.calRow, i < calEvents.length - 1 && styles.rowDivider]}>
                  <View style={styles.calTime}>
                    <Text style={styles.calDay}>{day}</Text>
                    <Text style={styles.calHour}>{time}</Text>
                  </View>
                  <View style={[styles.calBar, { backgroundColor: colors.accentNeon }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.calTitle} numberOfLines={1}>{event.summary}</Text>
                    {event.location ? <Text style={styles.calSub} numberOfLines={1}>📍 {event.location}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Notizen ── */}
      <View style={[styles.section, { marginBottom: 0 }]}>
        <SectionLabel icon="document-text-outline" title="Notizen" count={notes.length} onMore={() => router.push('/(tabs)/notes')} colors={colors} />
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
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { paddingTop: 12, paddingBottom: 40 },

    // Hero
    hero: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      gap: 10,
    },
    heroGreeting: {
      fontSize: 28,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.5,
    },
    heroDate: {
      fontSize: 13,
      color: c.textSecondary,
      marginTop: 1,
    },
    heroStats: {
      flexDirection: 'row',
      gap: 6,
      flexWrap: 'wrap',
    },

    // Birthday
    birthdayCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FFF3E0',
      marginHorizontal: 16,
      marginBottom: 14,
      borderRadius: 14,
      padding: 12,
      gap: 10,
      borderLeftWidth: 3,
      borderLeftColor: '#FF9500',
    },
    birthdayIcon: { fontSize: 24 },
    birthdayText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#7A4100',
    },

    // Section
    section: { marginBottom: 18 },

    // Card container
    card: {
      marginHorizontal: 16,
      backgroundColor: c.surface,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
    },

    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },

    loadingRow: { padding: 20, alignItems: 'center' },
    emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
    emptyText: { fontSize: 13, color: c.textSecondary },

    // Mail
    mailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 10,
    },
    mailAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.accentNeon + '22',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mailAvatarText: {
      fontSize: 14,
      fontWeight: '700',
      color: c.accentNeon,
    },
    mailMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    mailFrom: { fontSize: 13, fontWeight: '600', color: c.text, flex: 1, marginRight: 8 },
    mailDate: { fontSize: 11, color: c.textSecondary },
    mailSubject: { fontSize: 12, color: c.textSecondary },

    // Tasks
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 11,
      gap: 10,
    },
    taskAccent: { width: 3, height: '100%' as any, borderRadius: 2, minHeight: 18 },
    taskTitle: { flex: 1, fontSize: 14, fontWeight: '500', color: c.text },

    // Calendar
    calRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 10,
    },
    calTime: { width: 52, alignItems: 'center' },
    calDay: { fontSize: 10, fontWeight: '700', color: c.accentNeon, textTransform: 'uppercase', letterSpacing: 0.5 },
    calHour: { fontSize: 13, fontWeight: '600', color: c.text },
    calBar: { width: 3, borderRadius: 2, alignSelf: 'stretch', minHeight: 28 },
    calTitle: { fontSize: 14, fontWeight: '500', color: c.text },
    calSub: { fontSize: 11, color: c.textSecondary, marginTop: 1 },

    // Notes horizontal scroll
    noteScroll: {
      paddingHorizontal: 16,
      gap: 10,
    },
    noteCard: {
      width: 160,
      minHeight: 100,
      borderRadius: 14,
      padding: 12,
    },
    noteCardTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: 'rgba(0,0,0,0.8)',
      marginBottom: 4,
    },
    noteCardContent: {
      fontSize: 12,
      color: 'rgba(0,0,0,0.7)',
      lineHeight: 17,
    },
  });
}
