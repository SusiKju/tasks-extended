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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function formatDue(dueDate: string | null): string {
  if (!dueDate) return '';
  try {
    const d = new Date(dueDate);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return 'Überfällig';
    if (diff === 0) return 'Heute';
    if (diff === 1) return 'Morgen';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

function parseDisplayFrom(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*<?[^>]*>?$/);
  if (match) return match[1].trim();
  return from.replace(/<[^>]+>/, '').trim() || from;
}

function parseDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    return isToday
      ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  } catch {
    return dateStr;
  }
}

// ─── Section Header ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  icon: string;
  title: string;
  count?: number;
  onShowAll: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}

function SectionHeader({ icon, title, count, onShowAll, colors, styles }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name={icon as any} size={18} color={colors.accentNeon} style={{ marginRight: 6 }} />
        <Text style={styles.sectionTitle}>{title}</Text>
        {count !== undefined && (
          <View style={[styles.countBadge, { backgroundColor: colors.accentNeon + '22' }]}>
            <Text style={[styles.countBadgeText, { color: colors.accentNeon }]}>{count}</Text>
          </View>
        )}
      </View>
      <Pressable onPress={onShowAll} style={styles.showAllBtn}>
        <Text style={[styles.showAllText, { color: colors.accentNeon }]}>Alle</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.accentNeon} />
      </Pressable>
    </View>
  );
}

// ─── Task Widget ──────────────────────────────────────────────────────────────

interface TaskWidgetProps {
  tasks: Task[];
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  isDark: boolean;
  onPress: (id: string) => void;
}

function TaskWidget({ tasks, colors, styles, isDark, onPress }: TaskWidgetProps) {
  if (tasks.length === 0) {
    return (
      <View style={styles.emptyWidget}>
        <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
        <Text style={styles.emptyWidgetText}>Alle Tasks erledigt</Text>
      </View>
    );
  }
  return (
    <View style={styles.widgetList}>
      {tasks.map((task) => {
        const overdue = isOverdue(task.dueDate);
        const dueLabel = formatDue(task.dueDate);
        return (
          <Pressable
            key={task.id}
            style={[
              styles.taskRow,
              isDark && overdue ? neonGlow(colors.danger, 'soft') : {},
            ]}
            onPress={() => onPress(task.id)}
          >
            <View style={[styles.taskDot, { backgroundColor: overdue ? colors.danger : colors.accentNeon }]} />
            <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
            {dueLabel !== '' && (
              <Text style={[styles.taskDue, { color: overdue ? colors.danger : colors.textSecondary }]}>
                {dueLabel}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Notes Widget ─────────────────────────────────────────────────────────────

interface NotesWidgetProps {
  notes: Note[];
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}

function NotesWidget({ notes, colors, styles }: NotesWidgetProps) {
  if (notes.length === 0) {
    return (
      <View style={styles.emptyWidget}>
        <Ionicons name="document-text-outline" size={28} color={colors.textMuted} />
        <Text style={styles.emptyWidgetText}>Keine Notizen vorhanden</Text>
      </View>
    );
  }
  return (
    <View style={styles.notesGrid}>
      {notes.map((note) => (
        <View key={note.id} style={[styles.noteCard, { backgroundColor: note.color }]}>
          {note.title ? (
            <Text style={styles.noteCardTitle} numberOfLines={1}>{note.title}</Text>
          ) : null}
          <Text style={styles.noteCardContent} numberOfLines={3}>
            {note.content || (note.checklist?.map((i) => `• ${i.text}`).join('\n')) || ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Mail Widget ──────────────────────────────────────────────────────────────

interface MailWidgetProps {
  mails: MailMessage[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onConnectPress: () => void;
}

function MailWidget({ mails, loading, error, connected, colors, styles, onConnectPress }: MailWidgetProps) {
  if (!connected) {
    return (
      <Pressable style={styles.connectCard} onPress={onConnectPress}>
        <Ionicons name="mail-outline" size={22} color={colors.accentNeon} />
        <Text style={[styles.connectCardText, { color: colors.accentNeon }]}>Google Mail verbinden</Text>
      </Pressable>
    );
  }
  if (loading) {
    return (
      <View style={styles.emptyWidget}>
        <ActivityIndicator color={colors.accentNeon} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.emptyWidget}>
        <Text style={[styles.emptyWidgetText, { color: colors.danger }]}>{error}</Text>
      </View>
    );
  }
  if (mails.length === 0) {
    return (
      <View style={styles.emptyWidget}>
        <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
        <Text style={styles.emptyWidgetText}>Posteingang leer</Text>
      </View>
    );
  }
  return (
    <View style={styles.widgetList}>
      {mails.map((mail) => (
        <View key={mail.id} style={styles.mailRow}>
          <View style={styles.mailRowMain}>
            <Text style={styles.mailFrom} numberOfLines={1}>{parseDisplayFrom(mail.from)}</Text>
            <Text style={styles.mailDate}>{parseDisplayDate(mail.date)}</Text>
          </View>
          <Text style={styles.mailSubject} numberOfLines={1}>{mail.subject || '(Kein Betreff)'}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Calendar Widget ──────────────────────────────────────────────────────────

interface CalendarWidgetProps {
  events: CalendarEvent[];
  loading: boolean;
  connected: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}

function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) return 'Ganztägig';
  try {
    const d = new Date(event.start);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const dayLabel = isToday ? 'Heute' : isTomorrow ? 'Morgen' : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `${dayLabel}, ${time}`;
  } catch { return ''; }
}

function CalendarWidget({ events, loading, connected, colors, styles }: CalendarWidgetProps) {
  if (!connected) return null;
  if (loading) return (
    <View style={styles.emptyWidget}>
      <ActivityIndicator color={colors.accentNeon} />
    </View>
  );
  if (events.length === 0) return (
    <View style={styles.emptyWidget}>
      <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
      <Text style={styles.emptyWidgetText}>Keine Termine in den nächsten 2 Tagen</Text>
    </View>
  );
  return (
    <View style={styles.widgetList}>
      {events.map((event) => (
        <View key={event.id} style={styles.calEventRow}>
          <View style={[styles.calEventBar, { backgroundColor: colors.accentNeon }]} />
          <View style={styles.calEventContent}>
            <Text style={styles.calEventTitle} numberOfLines={1}>{event.summary}</Text>
            <Text style={[styles.calEventTime, { color: colors.textSecondary }]}>{formatEventTime(event)}</Text>
            {event.location ? (
              <Text style={[styles.calEventLocation, { color: colors.textMuted }]} numberOfLines={1}>
                📍 {event.location}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const router = useRouter();
  const { tasks, notes, settings, updateSettings } = useStore();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [mails, setMails] = useState<MailMessage[]>([]);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState<string | null>(null);
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  const upcomingTasks = useMemo(() => {
    const open = tasks.filter((t) => !t.completed);
    return [...open]
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 5);
  }, [tasks]);

  const recentNotes = useMemo(() => {
    return [...notes]
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })
      .slice(0, 4);
  }, [notes]);

  const openTaskCount = useMemo(() => tasks.filter((t) => !t.completed).length, [tasks]);
  const overdueCount = useMemo(
    () => tasks.filter((t) => !t.completed && isOverdue(t.dueDate)).length,
    [tasks]
  );

  const loadMails = useCallback(async (token: string) => {
    setMailLoading(true);
    setMailError(null);
    try {
      const result = await fetchRecentMails(token);
      setMails(result.slice(0, 4));
    } catch (e: any) {
      if (e?.message === 'UNAUTHORIZED') {
        updateSettings({ googleAccessToken: null, googleRefreshToken: null, googleCalendarEnabled: false });
        setMailError('Sitzung abgelaufen.');
      } else {
        setMailError('E-Mails konnten nicht geladen werden.');
      }
    } finally {
      setMailLoading(false);
    }
  }, [updateSettings]);

  useEffect(() => {
    if (settings.googleAccessToken) {
      loadMails(settings.googleAccessToken);
    }
  }, [settings.googleAccessToken, loadMails]);

  useEffect(() => {
    if (settings.googleAccessToken && settings.googleCalendarId) {
      setCalLoading(true);
      listUpcomingEvents(settings.googleAccessToken, settings.googleCalendarId, 2)
        .then(setCalEvents)
        .catch(() => {})
        .finally(() => setCalLoading(false));
    }
  }, [settings.googleAccessToken, settings.googleCalendarId]);

  const handleConnectMail = useCallback(() => {
    router.push('/(tabs)/mail');
  }, [router]);

  const todayStr = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Greeting */}
      <View style={styles.greetingSection}>
        <Text style={styles.greetingText}>{greeting()} 👋</Text>
        <Text style={styles.dateText}>{todayStr}</Text>
        {overdueCount > 0 && (
          <View style={[styles.overduePill, isDark ? neonGlow(colors.danger, 'soft') : {}]}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
            <Text style={[styles.overduePillText, { color: colors.danger }]}>
              {overdueCount} überfällig
            </Text>
          </View>
        )}
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, isDark ? neonGlow(colors.accentNeon, 'soft') : {}]}>
          <Text style={styles.statNumber}>{openTaskCount}</Text>
          <Text style={styles.statLabel}>Offene Tasks</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{notes.length}</Text>
          <Text style={styles.statLabel}>Notizen</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{mails.length > 0 ? mails.length + '+' : settings.googleAccessToken ? '…' : '–'}</Text>
          <Text style={styles.statLabel}>Neue Mails</Text>
        </View>
      </View>

      {/* Tasks widget */}
      <View style={styles.section}>
        <SectionHeader
          icon="checkmark-circle-outline"
          title="Kommende Tasks"
          count={openTaskCount}
          onShowAll={() => router.push('/(tabs)/')}
          colors={colors}
          styles={styles}
        />
        <View style={[styles.widget, isDark ? { borderColor: colors.border } : {}]}>
          <TaskWidget
            tasks={upcomingTasks}
            colors={colors}
            styles={styles}
            isDark={isDark}
            onPress={(id) => router.push(`/task/${id}` as any)}
          />
        </View>
      </View>

      {/* Notes widget */}
      <View style={styles.section}>
        <SectionHeader
          icon="document-text-outline"
          title="Letzte Notizen"
          count={notes.length}
          onShowAll={() => router.push('/(tabs)/notes')}
          colors={colors}
          styles={styles}
        />
        <View style={[styles.widget, isDark ? { borderColor: colors.border } : {}]}>
          <NotesWidget notes={recentNotes} colors={colors} styles={styles} />
        </View>
      </View>

      {/* Calendar widget */}
      {settings.googleCalendarEnabled && (
        <View style={styles.section}>
          <SectionHeader
            icon="calendar-outline"
            title="Nächste 2 Tage"
            count={calEvents.length}
            onShowAll={() => {}}
            colors={colors}
            styles={styles}
          />
          <View style={[styles.widget, isDark ? { borderColor: colors.border } : {}]}>
            <CalendarWidget
              events={calEvents}
              loading={calLoading}
              connected={!!settings.googleAccessToken}
              colors={colors}
              styles={styles}
            />
          </View>
        </View>
      )}

      {/* Mail widget */}
      <View style={[styles.section, styles.lastSection]}>
        <SectionHeader
          icon="mail-outline"
          title="Neueste Mails"
          onShowAll={() => router.push('/(tabs)/mail')}
          colors={colors}
          styles={styles}
        />
        <View style={[styles.widget, isDark ? { borderColor: colors.border } : {}]}>
          <MailWidget
            mails={mails}
            loading={mailLoading}
            error={mailError}
            connected={!!settings.googleAccessToken}
            colors={colors}
            styles={styles}
            onConnectPress={handleConnectMail}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, paddingBottom: 32 },

    // Greeting
    greetingSection: { marginBottom: 20 },
    greetingText: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 2 },
    dateText: { fontSize: 14, color: colors.textSecondary, marginBottom: 8 },
    overduePill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.danger + '1A',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      gap: 4,
      marginTop: 4,
    },
    overduePillText: { fontSize: 12, fontWeight: '600' },

    // Stats
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    statNumber: { fontSize: 22, fontWeight: '700', color: colors.accentNeon, marginBottom: 2 },
    statLabel: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },

    // Section
    section: { marginBottom: 20 },
    lastSection: { marginBottom: 0 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    countBadge: {
      marginLeft: 8,
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    countBadgeText: { fontSize: 11, fontWeight: '700' },
    showAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    showAllText: { fontSize: 13, fontWeight: '600' },

    // Widget container
    widget: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },

    // Empty state
    emptyWidget: {
      padding: 24,
      alignItems: 'center',
      gap: 8,
    },
    emptyWidgetText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },

    // Task rows
    widgetList: { paddingVertical: 4 },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 11,
      paddingHorizontal: 16,
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    taskDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
    taskTitle: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '500' },
    taskDue: { fontSize: 12, fontWeight: '600', flexShrink: 0 },

    // Note grid
    notesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: 10,
      gap: 8,
    },
    noteCard: {
      width: Platform.OS === 'web' ? 'calc(50% - 4px)' as any : '48%',
      borderRadius: 10,
      padding: 10,
      minHeight: 70,
    },
    noteCardTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: '#1C1C1E',
      marginBottom: 3,
    },
    noteCardContent: { fontSize: 12, color: '#1C1C1E', lineHeight: 17 },

    // Mail rows
    mailRow: {
      paddingVertical: 11,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    mailRowMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    mailFrom: { fontSize: 13, fontWeight: '600', color: colors.text, flex: 1, marginRight: 8 },
    mailDate: { fontSize: 11, color: colors.textSecondary },
    mailSubject: { fontSize: 12, color: colors.textSecondary },

    // Calendar event rows
    calEventRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      paddingVertical: 10,
      paddingHorizontal: 16,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    calEventBar: {
      width: 3,
      borderRadius: 2,
      alignSelf: 'stretch',
      minHeight: 36,
    },
    calEventContent: { flex: 1 },
    calEventTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 },
    calEventTime: { fontSize: 12, marginBottom: 1 },
    calEventLocation: { fontSize: 11 },

    // Connect card
    connectCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 10,
    },
    connectCardText: { fontSize: 14, fontWeight: '600' },
  });
}
