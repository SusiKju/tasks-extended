import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Animated,
  PanResponder,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { useTheme, ThemeColors } from '../utils/theme';
import { signInWithGoogle } from '../services/googleCalendar';
import { fetchRecentMails, trashMail, archiveMail, MailMessage } from '../services/googleMail';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ACTION_WIDTH = 140;
const SWIPE_THRESHOLD = 60;

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

function parseDisplayFrom(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*<?[^>]*>?$/);
  if (match) return match[1].trim();
  return from.replace(/<[^>]+>/, '').trim() || from;
}

// ─── Desktop Mail Item (Web) ──────────────────────────────────────────────────

interface MailItemProps {
  item: MailMessage;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

function DesktopMailItem({ item, colors, styles, onArchive, onDelete }: MailItemProps) {
  return (
    <View style={styles.desktopMailRow}><View style={styles.mailItem}>
      <View style={styles.mailHeader}>
        <Text style={styles.mailFrom} numberOfLines={1}>{parseDisplayFrom(item.from)}</Text>
        <View style={styles.desktopActions}>
          <Pressable
            style={({ hovered }: any) => [styles.desktopActionBtn, { opacity: hovered ? 1 : 0.55 }]}
            onPress={() => onArchive(item.id)}
          >
            <Ionicons name="archive-outline" size={18} color="#4A94C8" />
          </Pressable>
          <Pressable
            style={({ hovered }: any) => [styles.desktopActionBtn, { opacity: hovered ? 1 : 0.55 }]}
            onPress={() => onDelete(item.id)}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
          <Text style={styles.mailDate}>{parseDisplayDate(item.date)}</Text>
        </View>
      </View>
      <Text style={styles.mailSubject} numberOfLines={1}>{item.subject || '(Kein Betreff)'}</Text>
      <Text style={styles.mailSnippet} numberOfLines={2}>{item.snippet}</Text>
    </View></View>
  );
}

// ─── Swipeable Mail Item (Native) ─────────────────────────────────────────────

interface SwipeableMailItemProps {
  item: MailMessage;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

function SwipeableMailItem({ item, colors, styles, onArchive, onDelete }: SwipeableMailItemProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const actionOpacity = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy),
      onPanResponderMove: (_, { dx }) => {
        if (dx > 0) return;
        const clamped = Math.max(dx, -ACTION_WIDTH);
        translateX.setValue(clamped);
        actionOpacity.setValue(Math.min(Math.abs(clamped) / SWIPE_THRESHOLD, 1));
      },
      onPanResponderRelease: (_, { dx }) => {
        if (dx < -SWIPE_THRESHOLD) {
          Animated.spring(translateX, { toValue: -ACTION_WIDTH, useNativeDriver: true }).start();
          Animated.timing(actionOpacity, { toValue: 1, duration: 100, useNativeDriver: true }).start();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          Animated.timing(actionOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const close = useCallback(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    Animated.timing(actionOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start();
  }, [translateX, actionOpacity]);

  const handleArchive = useCallback(() => {
    close();
    onArchive(item.id);
  }, [close, onArchive, item.id]);

  const handleDelete = useCallback(() => {
    close();
    onDelete(item.id);
  }, [close, onDelete, item.id]);

  return (
    <View style={styles.swipeRow}>
      {/* Action buttons behind the row */}
      <Animated.View style={[styles.actionContainer, { opacity: actionOpacity }]}>
        <Pressable style={[styles.actionButton, styles.archiveButton]} onPress={handleArchive}>
          <Ionicons name="archive-outline" size={20} color="#fff" />
          <Text style={styles.actionLabel}>Archiv</Text>
        </Pressable>
        <Pressable style={[styles.actionButton, styles.deleteButton]} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.actionLabel}>Löschen</Text>
        </Pressable>
      </Animated.View>

      {/* Sliding mail row */}
      <Animated.View
        style={[styles.mailItem, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.mailHeader}>
          <Text style={styles.mailFrom} numberOfLines={1}>{parseDisplayFrom(item.from)}</Text>
          <Text style={styles.mailDate}>{parseDisplayDate(item.date)}</Text>
        </View>
        <Text style={styles.mailSubject} numberOfLines={1}>{item.subject || '(Kein Betreff)'}</Text>
        <Text style={styles.mailSnippet} numberOfLines={2}>{item.snippet}</Text>
      </Animated.View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function MailScreen() {
  const { settings, updateSettings } = useStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [mails, setMails] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const loadMails = useCallback(async (token: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetchRecentMails(token);
      setMails(result);
      setLoaded(true);
    } catch (e: any) {
      if (e?.message === 'UNAUTHORIZED') {
        updateSettings({ googleAccessToken: null, googleRefreshToken: null, googleCalendarEnabled: false });
        setError('Sitzung abgelaufen. Bitte neu verbinden.');
      } else {
        setError('E-Mails konnten nicht geladen werden.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [updateSettings]);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await signInWithGoogle();
      if (!auth) { setError('Anmeldung abgebrochen.'); return; }
      updateSettings({ googleAccessToken: auth.accessToken, googleRefreshToken: auth.refreshToken, googleCalendarEnabled: true });
      await loadMails(auth.accessToken);
    } catch {
      setError('Anmeldung fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }, [updateSettings, loadMails]);

  const removeFromList = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMails((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleArchive = useCallback(async (id: string) => {
    if (!settings.googleAccessToken) return;
    setPendingIds((s) => new Set(s).add(id));
    removeFromList(id);
    const ok = await archiveMail(settings.googleAccessToken, id);
    setPendingIds((s) => { const n = new Set(s); n.delete(id); return n; });
    if (!ok) {
      setMails((prev) => {
        const already = prev.find((m) => m.id === id);
        return already ? prev : prev;
      });
      setError('Archivieren fehlgeschlagen.');
    }
  }, [settings.googleAccessToken, removeFromList]);

  const handleDelete = useCallback(async (id: string) => {
    if (!settings.googleAccessToken) return;
    setPendingIds((s) => new Set(s).add(id));
    removeFromList(id);
    const ok = await trashMail(settings.googleAccessToken, id);
    setPendingIds((s) => { const n = new Set(s); n.delete(id); return n; });
    if (!ok) setError('Löschen fehlgeschlagen.');
  }, [settings.googleAccessToken, removeFromList]);

  React.useEffect(() => {
    if (settings.googleAccessToken && !loaded) {
      loadMails(settings.googleAccessToken);
    }
  }, [settings.googleAccessToken, loaded, loadMails]);

  if (!settings.googleAccessToken) {
    return (
      <View style={styles.center}>
        <Ionicons name="mail-outline" size={56} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Google Mail verbinden</Text>
        <Text style={styles.emptySubtitle}>
          Verbinde dein Google-Konto, um Nachrichten der letzten 2 Tage zu sehen.
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
      <FlatList
        data={mails}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) =>
          Platform.OS === 'web' ? (
            <DesktopMailItem
              item={item}
              colors={colors}
              styles={styles}
              onArchive={handleArchive}
              onDelete={handleDelete}
            />
          ) : (
            <SwipeableMailItem
              item={item}
              colors={colors}
              styles={styles}
              onArchive={handleArchive}
              onDelete={handleDelete}
            />
          )
        }
        contentContainerStyle={mails.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadMails(settings.googleAccessToken!, true)}
            tintColor={colors.accentNeon}
          />
        }
        ListHeaderComponent={
          mails.length > 0 && Platform.OS !== 'web' ? (
            <Text style={styles.hint}>← Nach links wischen zum Archivieren oder Löschen</Text>
          ) : null
        }
        ListEmptyComponent={
          loaded && !error ? (
            <View style={styles.center}>
              <Ionicons name="checkmark-circle-outline" size={48} color={colors.success} />
              <Text style={styles.emptyTitle}>Posteingang leer</Text>
              <Text style={styles.emptySubtitle}>Keine Nachrichten in den letzten 2 Tagen.</Text>
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
    listContent: { paddingVertical: 8 },
    hint: {
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: 6,
    },
    swipeRow: {
      marginHorizontal: 12,
      marginVertical: 4,
      borderRadius: 12,
      overflow: 'hidden',
    },

    actionContainer: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: ACTION_WIDTH,
      flexDirection: 'row',
      borderRadius: 12,
      overflow: 'hidden',
    },
    actionButton: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
    },
    archiveButton: { backgroundColor: '#4A94C8' },
    deleteButton: { backgroundColor: colors.danger },
    actionLabel: { color: '#fff', fontSize: 11, fontWeight: '600' },
    desktopMailRow: {
      marginHorizontal: 12,
      marginVertical: 4,
    },
    mailItem: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    mailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    mailFrom: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1, marginRight: 8 },
    mailDate: { fontSize: 12, color: colors.textSecondary },
    desktopActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    desktopActionBtn: { padding: 4, borderRadius: 6 },
    mailSubject: { fontSize: 13, color: colors.text, marginBottom: 4 },
    mailSnippet: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 16, marginBottom: 8, textAlign: 'center' },
    emptySubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    loadingText: { marginTop: 16, fontSize: 14, color: colors.textSecondary },
    errorText: { color: colors.danger, fontSize: 13, marginBottom: 16, textAlign: 'center' },
    errorBanner: { backgroundColor: colors.danger, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    errorBannerText: { color: '#fff', fontSize: 13, flex: 1 },
    retryText: { color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 12 },
    connectButton: { backgroundColor: colors.accentNeon, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, minWidth: 200, alignItems: 'center' },
    connectButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  });
}
