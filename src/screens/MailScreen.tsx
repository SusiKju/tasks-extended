import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { useTheme, ThemeColors } from '../utils/theme';
import { signInWithGoogle, getValidAccessToken } from '../services/googleCalendar';
import { fetchRecentMails, fetchMailsByIds, trashMail, MailMessage } from '../services/googleMail';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
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
      : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function parseDisplayFrom(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*<?[^>]*>?$/);
  if (match) return match[1].trim();
  return from.replace(/<[^>]+>/, '').trim() || from;
}

// TE-37: Tages-Überschrift für die visuelle Staffelung der Liste.
function dayLabel(d: Date): string {
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'Heute';
  if (diffDays === 1) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface MailSection {
  key: string;
  title: string;
  data: MailMessage[];
}

// TE-37: Mails nach Kalendertag gruppieren – neueste Gruppe zuerst, innerhalb
// der Gruppe die neueste Mail oben.
function groupMailsByDay(mails: MailMessage[]): MailSection[] {
  const buckets = new Map<string, { ts: number; title: string; data: MailMessage[] }>();
  for (const m of mails) {
    const d = new Date(m.date);
    const valid = !isNaN(d.getTime());
    const day = valid ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
    const key = day ? `${day.getTime()}` : 'unknown';
    if (!buckets.has(key)) {
      buckets.set(key, {
        ts: day ? day.getTime() : -1,
        title: day ? dayLabel(day) : 'Ohne Datum',
        data: [],
      });
    }
    buckets.get(key)!.data.push(m);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => b[1].ts - a[1].ts)
    .map(([key, v]) => ({
      key,
      title: v.title,
      data: v.data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }));
}

// ─── Mail Item ────────────────────────────────────────────────────────────────

interface MailItemProps {
  item: MailMessage;
  expanded: boolean;
  pinned: boolean;
  onToggle: () => void;
  onTogglePin: () => void;
  onDelete: (id: string) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}

function MailItem({ item, expanded, pinned, onToggle, onTogglePin, onDelete, colors, styles }: MailItemProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.mailCard,
        pinned && styles.mailCardPinned,
        pressed && !expanded && { opacity: 0.85 },
      ]}
      onPress={onToggle}
    >
      {/* Header row – immer sichtbar */}
      <View style={styles.mailHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.accentNeon + '22' }]}>
          <Text style={[styles.avatarText, { color: colors.accentNeon }]}>
            {parseDisplayFrom(item.from).charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.metaRow}>
            <Text style={styles.mailFrom} numberOfLines={1}>{parseDisplayFrom(item.from)}</Text>
            <Text style={styles.mailDate}>{parseDisplayDate(item.date)}</Text>
          </View>
          <Text style={styles.mailSubject} numberOfLines={expanded ? 0 : 1}>
            {item.subject || '(Kein Betreff)'}
          </Text>
        </View>
        {/* TE-38: Pin-Umschalter */}
        <Pressable
          onPress={onTogglePin}
          hitSlop={8}
          style={({ pressed }) => [{ marginLeft: 6, padding: 2 }, pressed && { opacity: 0.6 }]}
        >
          <Ionicons
            name={pinned ? 'bookmark' : 'bookmark-outline'}
            size={17}
            color={pinned ? colors.accentNeon : colors.textMuted}
          />
        </Pressable>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textSecondary}
          style={{ marginLeft: 6 }}
        />
      </View>

      {/* Expanded: vollständiger Inhalt + Aktionen */}
      {expanded && (
        <View style={styles.expandedContent}>
          <Text style={styles.mailSnippet}>{item.snippet}</Text>
          <View style={styles.expandedActions}>
            <Pressable
              style={({ pressed }) => [styles.pinBtn, pressed && { opacity: 0.75 }]}
              onPress={onTogglePin}
            >
              <Ionicons
                name={pinned ? 'bookmark' : 'bookmark-outline'}
                size={16}
                color={colors.accentNeon}
              />
              <Text style={styles.pinBtnText}>{pinned ? 'Lösen' : 'Anpinnen'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.75 }]}
              onPress={() => onDelete(item.id)}
            >
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.deleteBtnText}>Löschen</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function MailScreen() {
  const { settings, updateSettings, pinnedMailIds, togglePinnedMail, unpinMail } = useStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [mails, setMails] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // TE-37/TE-38: Fenster-Mails laden und angepinnte Mails außerhalb des Fensters
  // per ID nachladen, damit sie immer sichtbar bleiben.
  const fetchWindowed = useCallback(async (token: string): Promise<MailMessage[]> => {
    const windowMails = await fetchRecentMails(token, settings.mailWindowDays);
    const have = new Set(windowMails.map((m) => m.id));
    const missingPinned = pinnedMailIds.filter((id) => !have.has(id));
    const extra = missingPinned.length ? await fetchMailsByIds(token, missingPinned) : [];
    return [...extra, ...windowMails];
  }, [settings.mailWindowDays, pinnedMailIds]);

  const loadMails = useCallback(async (token: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setMails(await fetchWindowed(token));
      setLoaded(true);
    } catch (e: any) {
      if (e?.message === 'UNAUTHORIZED') {
        // Erst stillen Refresh versuchen (Web via GIS, nativ via Refresh-Token),
        // bevor der Login verworfen wird.
        const refreshed = await getValidAccessToken(true);
        if (refreshed && refreshed !== token) {
          try {
            setMails(await fetchWindowed(refreshed));
            setLoaded(true);
            return;
          } catch {
            // fällt unten in den Logout-Pfad
          }
        }
        updateSettings({ googleAccessToken: null, googleRefreshToken: null, googleTokenExpiry: null, googleCalendarEnabled: false });
        setError('Sitzung abgelaufen. Bitte neu verbinden.');
      } else {
        setError('E-Mails konnten nicht geladen werden.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [updateSettings, fetchWindowed]);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await signInWithGoogle();
      if (!auth) { setError('Anmeldung abgebrochen.'); return; }
      updateSettings({ googleAccessToken: auth.accessToken, googleRefreshToken: auth.refreshToken, googleTokenExpiry: Date.now() + auth.expiresIn * 1000, googleCalendarEnabled: true });
      await loadMails(auth.accessToken);
    } catch {
      setError('Anmeldung fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }, [updateSettings, loadMails]);

  const handleToggle = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!settings.googleAccessToken) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(null);
    setMails((prev) => prev.filter((m) => m.id !== id));
    unpinMail(id); // TE-38: gelöschte Mail nicht angepinnt halten
    const ok = await trashMail(settings.googleAccessToken, id);
    if (!ok) setError('Löschen fehlgeschlagen.');
  }, [settings.googleAccessToken, unpinMail]);

  // TE-38: Pin umschalten – angepinnte Mails wandern nach oben.
  const handleTogglePin = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    togglePinnedMail(id);
  }, [togglePinnedMail]);

  React.useEffect(() => {
    if (settings.googleAccessToken && !loaded) {
      loadMails(settings.googleAccessToken);
    }
  }, [settings.googleAccessToken, loaded, loadMails]);

  // TE-37: Zeitfenster im Settings-Tab geändert → Liste neu laden.
  React.useEffect(() => {
    if (settings.googleAccessToken && loaded) {
      loadMails(settings.googleAccessToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mailWindowDays]);

  // TE-38: Angepinnte Mails in einer eigenen Sektion ganz oben, der Rest nach Tagen.
  const pinnedSet = useMemo(() => new Set(pinnedMailIds), [pinnedMailIds]);
  const sections = useMemo(() => {
    const pinned = mails
      .filter((m) => pinnedSet.has(m.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const rest = mails.filter((m) => !pinnedSet.has(m.id));
    const out: MailSection[] = [];
    if (pinned.length) out.push({ key: 'pinned', title: '📌 Angepinnt', data: pinned });
    out.push(...groupMailsByDay(rest));
    return out;
  }, [mails, pinnedSet]);

  if (!settings.googleAccessToken) {
    return (
      <View style={styles.center}>
        <Ionicons name="mail-outline" size={56} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Google Mail verbinden</Text>
        <Text style={styles.emptySubtitle}>
          Verbinde dein Google-Konto, um Nachrichten der letzten {settings.mailWindowDays} Tage zu sehen.
        </Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable style={styles.connectButton} onPress={handleConnect} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.connectButtonText}>Mit Google verbinden</Text>
          }
        </Pressable>
      </View>
    );
  }

  if (loading && !loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accentNeon} />
        <Text style={styles.loadingText}>E-Mails werden geladen…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
          <Pressable onPress={() => { setError(null); loadMails(settings.googleAccessToken!); }}>
            <Text style={styles.retryText}>Wiederholen</Text>
          </Pressable>
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MailItem
            item={item}
            expanded={expandedId === item.id}
            pinned={pinnedSet.has(item.id)}
            onToggle={() => handleToggle(item.id)}
            onTogglePin={() => handleTogglePin(item.id)}
            onDelete={handleDelete}
            colors={colors}
            styles={styles}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{(section as MailSection).title}</Text>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadMails(settings.googleAccessToken!, true)}
            tintColor={colors.accentNeon}
          />
        }
        ListHeaderComponent={
          <Text style={styles.periodLabel}>
            E-Mails der letzten {settings.mailWindowDays} Tage · Tippen zum Öffnen
          </Text>
        }
        ListEmptyComponent={
          loaded && !error ? (
            <View style={styles.center}>
              <Ionicons name="checkmark-circle-outline" size={48} color={colors.success} />
              <Text style={styles.emptyTitle}>Posteingang leer</Text>
              <Text style={styles.emptySubtitle}>
                Keine Nachrichten in den letzten {settings.mailWindowDays} Tagen.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: colors.background },
    emptyContainer: { flex: 1 },
    listContent: { paddingVertical: 8, paddingHorizontal: 12, gap: 8 },
    periodLabel: {
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: 10,
      fontWeight: '500',
    },
    // TE-37: Tages-Trenner für die gestaffelte Liste
    sectionHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      backgroundColor: colors.background,
      paddingTop: 14,
      paddingBottom: 4,
      paddingHorizontal: 4,
    },

    // Mail card
    mailCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    // TE-38: visuelle Hervorhebung angepinnter Mails
    mailCardPinned: {
      borderColor: colors.accentNeon,
      borderWidth: 1.5,
      backgroundColor: colors.accentNeon + '0D',
    },
    mailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    avatarText: { fontSize: 15, fontWeight: '700' },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    mailFrom: { fontSize: 13, fontWeight: '600', color: colors.text, flex: 1, marginRight: 6 },
    mailDate: { fontSize: 11, color: colors.textSecondary },
    mailSubject: { fontSize: 13, color: colors.textSecondary },

    // Expanded
    expandedContent: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: 12,
    },
    mailSnippet: {
      fontSize: 13,
      color: colors.text,
      lineHeight: 19,
    },
    expandedActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
    pinBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceHigh,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.accentNeon,
    },
    pinBtnText: { color: colors.accentNeon, fontWeight: '600', fontSize: 13 },
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.danger,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 10,
    },
    deleteBtnText: { color: colors.dangerFg, fontWeight: '600', fontSize: 13 },

    // Misc
    emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 16, marginBottom: 8, textAlign: 'center' },
    emptySubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    loadingText: { marginTop: 16, fontSize: 14, color: colors.textSecondary },
    errorText: { color: colors.danger, fontSize: 13, marginBottom: 16, textAlign: 'center' },
    errorBanner: { backgroundColor: colors.danger, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    errorBannerText: { color: colors.dangerFg, fontSize: 13, flex: 1 },
    retryText: { color: colors.dangerFg, fontWeight: '700', fontSize: 13, marginLeft: 12 },
    connectButton: { backgroundColor: colors.accentNeon, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, minWidth: 200, alignItems: 'center' },
    connectButtonText: { color: colors.accentFg, fontWeight: '700', fontSize: 16 },
  });
}
