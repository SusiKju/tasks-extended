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
  Dimensions,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { useTheme, ThemeColors, readableTextOn, neonGlow } from '../utils/theme';
import { useScratchpad } from '../hooks/useScratchpad';
import { parseScratchpad, ScratchEntry } from '../components/Scratchpad';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useGoogleTasksSync } from '../hooks/useGoogleTasksSync';
import { useGoogleContactsBirthdaysSync } from '../hooks/useGoogleContactsBirthdaysSync';
import { isOverdue } from '../utils/dateFormat';
import { fetchRecentMails, fetchMailsByIds, MailMessage } from '../services/googleMail';
import { listUpcomingEvents, CalendarEvent } from '../services/googleCalendar';
import {
  ChildTask, subscribeToChildTasks,
} from '../services/kinderTasks';
import { AllowanceMonth, subscribeToAllowanceMonths, monthKey, formatEuro, formatMonthLabel } from '../services/allowance';
import { useFamily } from '../hooks/useFamily';
import { SharedNotepad } from '../components/SharedNotepad';
import { GeistesKacheln } from '../components/GeistesKacheln';
import { LinkCardBar } from '../components/LinkCardBar';
import { WeatherWidget } from '../components/WeatherWidget';
import { GoogleConnectBanner } from '../components/GoogleConnectBanner';
import { CountdownStrip } from '../components/CountdownStrip';
import { FeedBlock, FeedItem } from '../components/FeedBlock';
import { subscribeToFeedOrder, saveFeedOrder, FeedOrder } from '../services/feedOrderService';
import { subscribeToFeedHighlight, saveFeedHighlight } from '../services/feedHighlightService';
import { SharedNoteItem, subscribeToSharedNotes } from '../services/sharedNotes';
import { GeistesKachel, subscribeToGeistesKacheln } from '../services/geistesKacheln';
import { Task, DashboardBlockKey } from '../types';

// Fallback-Farbe falls Kind keine Farbe gesetzt hat
const CHILD_COLOR_FALLBACK = '#4f86f7';
import { format } from 'date-fns';

const TODAY = format(new Date(), 'yyyy-MM-dd');

/** Fälligkeitsanzeige (TE-119): "heute" / "TT.MM." mit Markierung für überschrittene Termine. */
function dueInfo(task?: ChildTask): { label: string; overdue: boolean } | null {
  if (!task) return null;
  const overdue = !task.done && task.date < TODAY;
  if (task.date === TODAY) return { label: 'heute', overdue: false };
  const [, m, d] = task.date.split('-');
  return { label: `${d}.${m}.`, overdue };
}

/**
 * Feed-Block ("Mein Tag", TE-?): ordnet ein "YYYY-MM-DD"-Datum einer der vier
 * Zeitgruppen zu (Überfällig/Heute/Morgen/Ohne Termin) – dieselbe Semantik wie
 * der bisherige Tasks-Block, nur über alle Item-Kategorien hinweg angewandt.
 * Kein Datum (null/undefined) landet immer in "Ohne Termin".
 */
function feedDateGroup(dateStr: string | null | undefined): 'overdue' | 'today' | 'tomorrow' | 'later' {
  if (!dateStr) return 'later';
  if (dateStr < TODAY) return 'overdue';
  if (dateStr === TODAY) return 'today';
  const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
  return dateStr === tomorrow ? 'tomorrow' : 'later';
}

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
      else if (diff === 0) { /* TE-114: kein „Heute"-Label auf der Pille */ }
      else if (diff === 1) parts.push('Mo.');  // Morgen → Mo.
      else parts.push(d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }));
    } catch {}
  }
  if (task.dueTime) parts.push(task.dueTime);
  return parts.join(' ');
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

// TE-126: Pillen-Text wird nach 10 Zeichen hart gekappt (statt per numberOfLines
// von der Schrift abhängig umzubrechen) – bleibt dadurch unabhängig von Font-
// Skalierung zuverlässig einzeilig.
function chipText(text: string, max = 10): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ─── Task Chip ────────────────────────────────────────────────────────────────

function TaskChip({
  task,
  onPress,
  scale = 'lg',
  blink = false,
  overdue = false,
}: {
  task: Task;
  onPress: () => void;
  scale?: 'lg' | 'md' | 'sm';
  blink?: boolean;
  overdue?: boolean;
}) {
  const { isDark, isMono, reduceMotion } = useTheme();
  const label = chipDueLabel(task);
  const isImportant = task.important;
  // Calm-Theme: kein Blinken und keine rote Ausnahme – alles ruhig in Weiß.
  const blinkActive = blink && !reduceMotion;

  // Blink-Animation: nur wenn die Task heute fällig UND wichtig ist (siehe Aufruf).
  const blinkAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!blinkActive) { blinkAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => { loop.stop(); blinkAnim.setValue(1); };
  }, [blinkActive, blinkAnim]);

  // Farbe rein nach Priorität: wichtige Tasks rot, normale blau.
  // Dark-Themes: Tasks-Tab-Stil – keine Füllung, nur Rahmen + Schrift in der
  // Chip-Farbe (+ Glow). Light: solide Füllung mit lesbarem Text wie bisher.
  // Schwarz-Weiß-Theme: alles monochrom (weiß) – einzige Ausnahme bleibt Rot
  // für wichtige Tasks, die heute fällig sind (= blink). Im Calm-Theme entfällt
  // auch diese Ausnahme: alles bleibt weiß.
  const chipColor   = isMono
    ? (blinkActive ? C.important : '#FFFFFF')
    : (isImportant ? C.important : C.tasks);
  // TE-119/TE-125: überfällige, nicht-wichtige Pillen bekommen einen roten Rahmen
  // als eigenständigen Marker, behalten aber ihre normale Füllfarbe. Beide Themes
  // im Projekt sind Mono (isMono ist immer true), die alte "!isMono"-Bedingung
  // war daher totes Code – der rote Rahmen kam nie zustande.
  const borderColor = (overdue && !isImportant) ? C.overdue : chipColor;
  const bgColor     = isDark ? chipColor + '18' : chipColor;
  const textColor   = isMono && (blinkActive || isImportant)
    ? '#FFFFFF'
    : (isDark ? chipColor : readableTextOn(chipColor));

  const fontSize   = scale === 'lg' ? 13 : scale === 'md' ? 11 : 10;
  const padV       = scale === 'lg' ? 7  : scale === 'md' ? 5  : 4;
  const padH       = scale === 'lg' ? 11 : scale === 'md' ? 9  : 8;
  const chipOpacity= scale === 'sm' ? 0.65 : 1;

  // Neon-Glow wie die aktiven Filter-Chips im Tasks-Tab: Schatten in der
  // Chip-Farbe, Intensität nach Wichtigkeit (Heute/Überfällig kräftig, Später ohne).
  // Nur in den Dark-Themes – Light bleibt flach.
  const glow = isDark
    ? neonGlow(borderColor, scale === 'lg' ? 'medium' : scale === 'md' ? 'soft' : 'soft')
    : null;

  return (
    // TE-126: kein maxWidth-Cap mehr – chipText() begrenzt den Titel bereits auf
    // ~11 Zeichen, ein zusätzliches %-Limit war schmäler als das und drückte den
    // (fixbreiten) Text über den Pillen-Rand. chipWrap (flexWrap) schiebt eine
    // Pille, die nicht mehr in die Zeile passt, von selbst in die nächste Zeile.
    <Animated.View style={{ opacity: blinkAnim }}>
      <Pressable
        style={({ pressed }) => [
          chipStyles.chip,
          { backgroundColor: bgColor, borderColor, borderWidth: isDark ? 1.5 : 1,
            opacity: pressed ? 0.7 : chipOpacity,
            paddingVertical: padV, paddingHorizontal: padH },
          scale !== 'sm' && glow,
        ]}
        onPress={onPress}
      >
        {isImportant && (
          <Ionicons name="flag" size={scale === 'lg' ? 11 : 9} color={textColor} style={{ marginRight: 2 }} />
        )}
        <Text style={[chipStyles.title, { color: textColor, fontSize }]} numberOfLines={1}>
          {chipText(task.title)}
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
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    // TE-126: Text ist bereits per chipText() auf max. 10 Zeichen + „…" gekappt –
    // flexShrink:1 hätte die Box trotzdem im Flex-Row mit dem Datums-Label um
    // Platz konkurrieren lassen und sie unter die nötige Breite gedrückt, sodass
    // numberOfLines={1} schon nach ~4 Zeichen kappte. flexShrink:0 erzwingt die
    // volle Breite für den vorab gekappten Text; das Label weicht stattdessen.
    flexShrink: 0,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    flexShrink: 1,
  },
});

// ─── Note Chip (TE-114) ─────────────────────────────────────────────────────────
// Persönliche Notizen aus dem Notizblock als gefloatete Pillen – gleiche Optik wie
// die Task-Chips, damit Tasks (links) und Notizen (rechts) auf dem Dashboard
// einheitlich aussehen. Klick führt in den Tasks-Tab, wo der Notizblock liegt.
function NoteChip({ entry, onPress }: { entry: ScratchEntry; onPress: () => void }) {
  const { isDark } = useTheme();
  // Die vom Nutzer gewählte Notiz-Farbe gewinnt immer – auch im Mono-Theme,
  // analog zum „Mein Tag"-Feed (TE-85). Dark: nur Rahmen + farbige Schrift + Glow,
  // Light: solide Füllung mit lesbarem Text – exakt wie TaskChip.
  const chipColor   = entry.color;
  const borderColor = chipColor;
  const bgColor     = isDark ? chipColor + '18' : chipColor;
  const textColor   = isDark ? '#fff' : readableTextOn(chipColor);
  const glow        = isDark ? neonGlow(borderColor, 'soft') : null;

  return (
    <Pressable
      style={({ pressed }) => [
        chipStyles.chip,
        { backgroundColor: bgColor, borderColor, borderWidth: isDark ? 1.5 : 1,
          opacity: pressed ? 0.7 : entry.done ? 0.55 : 1,
          paddingVertical: 5, paddingHorizontal: 9 },
        glow,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          chipStyles.title,
          { color: textColor, fontSize: 11 },
          entry.done && { textDecorationLine: 'line-through' },
        ]}
        numberOfLines={1}
      >
        {chipText(entry.text)}
      </Text>
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const router = useRouter();
  const { familyId, children: familyChildren } = useFamily();
  const fid = familyId ?? '';
  // Lookup-Helfer für dynamische Kinder-Daten
  const childName = (id: string) => familyChildren.find((c) => c.id === id)?.name ?? id;
  const childColor = (id: string) => familyChildren.find((c) => c.id === id)?.color ?? CHILD_COLOR_FALLBACK;
  const childEmoji = (id: string) => familyChildren.find((c) => c.id === id)?.emoji ?? null;
  const { tasks, settings, birthdays: storeBirthdays, pinnedMailIds } = useStore();
  // TE-104: Notizblock-Wert + Firestore-Abo zentral aus dem Hook. Das Dashboard
  // zeigt ihn nur an (readOnly); bearbeitet wird er im Tasks-Tab.
  const { scratchpad } = useScratchpad();
  // TE-77: nur aktivierte Dashboard-Blöcke rendern. Fehlt ein Key (alter Stand /
  // neuer Block), gilt er als sichtbar – so verschwindet nichts versehentlich.
  const showBlock = useCallback(
    (key: DashboardBlockKey) => settings.dashboardBlocks?.[key] !== false,
    [settings.dashboardBlocks]
  );
  const { colors, isDark, theme, mono, isMono, reduceMotion } = useTheme();
  const { user } = useFirebaseAuth();
  const { syncTasks } = useGoogleTasksSync();
  const { syncBirthdays } = useGoogleContactsBirthdaysSync();

  // Sync-Button
  const [syncing, setSyncing] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;

  // "Mein Tag" (Feed): erscheint nicht mehr inline auf dem Dashboard,
  // sondern wird über das Icon links neben dem Sync-Button als Dialog geöffnet.
  const [feedDialogOpen, setFeedDialogOpen] = useState(false);
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);

  // TE-41/TE-75: Fenster-Mails + angepinnte Mails (auch außerhalb des Fensters) laden.
  // Das Fenster folgt settings.mailWindowDays (wie MailScreen, TE-37), damit ein
  // geändertes Zeitfenster die angeheftete Mails nicht aus der Card verdrängt.
  const loadDashboardMails = useCallback(async (token: string) => {
    setMailLoading(true);
    try {
      const windowMails = await fetchRecentMails(token, settings.mailWindowDays);
      const have = new Set(windowMails.map((m) => m.id));
      const missingPinned = pinnedMailIds.filter((id) => !have.has(id));
      const extra = missingPinned.length ? await fetchMailsByIds(token, missingPinned) : [];
      setMails([...extra, ...windowMails]);
    } catch {
      // still – Card bleibt beim letzten Stand
    } finally {
      setMailLoading(false);
    }
  }, [pinnedMailIds, settings.mailWindowDays]);

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
        syncBirthdays().catch(() => {}),
      ]);
      // Mails + Kalender neu laden
      if (settings.googleAccessToken) {
        loadDashboardMails(settings.googleAccessToken);
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
  }, [syncing, syncTasks, syncBirthdays, settings, loadDashboardMails]);

  const styles = useMemo(() => makeStyles(colors, isDark, reduceMotion), [colors, isDark, reduceMotion]);

  const [mails, setMails] = useState<MailMessage[]>([]);
  const [mailLoading, setMailLoading] = useState(false);
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  // TE-41: Auf dem Dashboard nur angepinnte + ungelesene Mails, angepinnte oben.
  const pinnedSet = useMemo(() => new Set(pinnedMailIds), [pinnedMailIds]);
  const dashboardMails = useMemo(() => {
    return mails
      .filter((m) => pinnedSet.has(m.id) || m.unread)
      .sort((a, b) => {
        const pa = pinnedSet.has(a.id) ? 0 : 1;
        const pb = pinnedSet.has(b.id) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      })
      .slice(0, 5);
  }, [mails, pinnedSet]);

  // TE-84: Im "Mein Tag"-Feed sollen nur tatsächlich gepinnte Mails erscheinen,
  // anders als die Dashboard-Mail-Card (pinned+unread, TE-41).
  const feedPinnedMails = useMemo(() => {
    return mails
      .filter((m) => pinnedSet.has(m.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [mails, pinnedSet]);

  // Heutige Aufgaben aller Kinder (TE-110) – ein Echtzeit-Listener pro Kind,
  // analog zum Kids-Tab. Abschnitt erscheint nur, wenn mindestens eine Aufgabe da ist.
  const [childTasks, setChildTasks] = useState<Record<string, ChildTask[]>>({});
  useEffect(() => {
    if (!fid || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToChildTasks(fid, child.id, TODAY, (tasks) =>
        setChildTasks((prev) => ({ ...prev, [child.id]: tasks }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [fid, familyChildren]);

  // Taschengeld-Status pro Kind (TE-78): ein Echtzeit-Listener pro Kind, analog
  // zu den Kinder-Aufgaben oben.
  const [allowanceByChild, setAllowanceByChild] = useState<Record<string, Record<string, AllowanceMonth>>>({});
  useEffect(() => {
    if (!fid || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToAllowanceMonths(fid, child.id, (months) =>
        setAllowanceByChild((prev) => ({ ...prev, [child.id]: months }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [fid, familyChildren]);

  // Kinder mit konfiguriertem Taschengeld, das für den laufenden Monat noch
  // nicht bestätigt wurde.
  const currentAllowanceMonth = monthKey();
  const openAllowanceChildren = useMemo(
    () => familyChildren.filter(
      (c) => (c.allowance ?? 0) > 0 && !allowanceByChild[c.id]?.[currentAllowanceMonth]?.received
    ),
    [familyChildren, allowanceByChild, currentAllowanceMonth]
  );

  // ── Feed-Block ("Mein Tag"): zusätzliche Datenquellen, die bisher nur in den ──
  // jeweiligen Einzel-Komponenten geladen wurden (Geteilte Liste, Countdowns,
  // Geistesblitze). Werden hier zusätzlich abonniert, damit der Feed sie als
  // Items zeigen kann – die Einzel-Blöcke laden ihre Daten weiterhin selbst.
  const [feedSharedNotes, setFeedSharedNotes] = useState<SharedNoteItem[]>([]);
  useEffect(() => {
    if (!fid) return;
    const unsub = subscribeToSharedNotes(
      fid,
      (active) => setFeedSharedNotes(active),
      () => setFeedSharedNotes([]),
    );
    return unsub;
  }, [fid]);

  const [feedGeistesKacheln, setFeedGeistesKacheln] = useState<GeistesKachel[]>([]);
  useEffect(() => {
    if (!fid || !user?.uid) return;
    const unsub = subscribeToGeistesKacheln(
      fid,
      user.uid,
      (tiles) => setFeedGeistesKacheln(tiles),
      () => setFeedGeistesKacheln([]),
    );
    return unsub;
  }, [fid, user?.uid]);

  // "Mein Tag": manuelle Sortierung der flachen Liste, pro User in Firestore
  // persistiert und live synchronisiert (siehe feedOrderService.ts).
  const [feedOrder, setFeedOrder] = useState<FeedOrder>([]);
  const feedOrderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!fid || !user?.uid) return;
    const unsub = subscribeToFeedOrder(fid, user.uid, (order) => setFeedOrder(order));
    return unsub;
  }, [fid, user?.uid]);

  const handleFeedReorder = useCallback(
    (orderedKeys: string[]) => {
      setFeedOrder(orderedKeys);
      if (fid && user?.uid) {
        if (feedOrderSaveTimer.current) clearTimeout(feedOrderSaveTimer.current);
        feedOrderSaveTimer.current = setTimeout(() => {
          saveFeedOrder(fid, user.uid, orderedKeys);
        }, 500);
      }
    },
    [fid, user?.uid],
  );

  // "Mein Tag": per Long-Press hervorgehobene Items (TE-95, Mehrfach-Auswahl
  // möglich), pro User in Firestore persistiert und live synchronisiert
  // (siehe feedHighlightService.ts).
  const [feedHighlightKeys, setFeedHighlightKeys] = useState<string[]>([]);
  useEffect(() => {
    if (!fid || !user?.uid) return;
    const unsub = subscribeToFeedHighlight(fid, user.uid, (keys) => setFeedHighlightKeys(keys));
    return unsub;
  }, [fid, user?.uid]);

  const handleFeedHighlight = useCallback(
    (keys: string[]) => {
      setFeedHighlightKeys(keys);
      if (fid && user?.uid) saveFeedHighlight(fid, user.uid, keys);
    },
    [fid, user?.uid],
  );

  // Gruppenaufgaben (TE-115): Kopien mit gemeinsamer groupId über die Kinder hinweg
  // zu je einer Gruppe bündeln – jede wird zu einer eigenen Extrakarte.
  const groupTasks = useMemo(() => {
    const map = new Map<string, { groupId: string; title: string; entries: { childId: string; task: ChildTask }[] }>();
    for (const child of familyChildren) {
      for (const task of (childTasks[child.id] ?? [])) {
        if (!task.groupId) continue;
        let g = map.get(task.groupId);
        if (!g) { g = { groupId: task.groupId, title: task.title, entries: [] }; map.set(task.groupId, g); }
        g.entries.push({ childId: child.id, task });
      }
    }
    // Teilnehmer in Familienreihenfolge sortieren.
    const childOrder = familyChildren.map((c) => c.id);
    for (const g of map.values()) {
      g.entries.sort((a, b) => childOrder.indexOf(a.childId) - childOrder.indexOf(b.childId));
    }
    return [...map.values()];
  }, [childTasks, familyChildren]);

  // Einzelaufgaben je Kind (ohne Gruppenaufgaben) für die Anzeige.
  const individualByChild = useMemo(() => {
    const out: Record<string, ChildTask[]> = {};
    for (const child of familyChildren) {
      out[child.id] = (childTasks[child.id] ?? []).filter((t) => !t.groupId);
    }
    return out;
  }, [childTasks, familyChildren]);

  // Nur Kinder mit mindestens einer Einzelaufgabe.
  const childrenWithTasks = useMemo(
    () => familyChildren.filter((c) => (individualByChild[c.id]?.length ?? 0) > 0).map((c) => c.id),
    [individualByChild, familyChildren]
  );

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
    ].filter((g) => g.tasks.length > 0);
  }, [tasks]);

  // Bunter Geburtstags-Stil (rotierender Regenbogen-Rand im AI-Komponenten-Stil):
  // im Neon-Theme und im Schwarz-Weiß-Theme – dort bleibt die Geburtstags-Card
  // bewusst bunt als Ausnahme zum sonst monochromen Look (TE-81).
  // Bunte Geburtstags-Card nur im Neon-Mono-Theme; das Calm-Theme bleibt schlicht.
  const richBirthday = theme === 'dark-mono';
  const rainbowRotate = useRef(new Animated.Value(0)).current;
  // Atmender, farbwechselnder Flammen-Glow (Gemini-Look).
  const flameAnim = useRef(new Animated.Value(0)).current;

  const todayBirthdays = useMemo(() => {
    const now = new Date();
    return storeBirthdays.filter(
      (b) => b.month === now.getMonth() + 1 && b.day === now.getDate()
    );
  }, [storeBirthdays]);

  // Termine "heute" / "morgen" – auf Komponentenebene berechnet (statt nur lokal
  // im Render), damit der Glow-Effekt unten auf "heutige Termine vorhanden?"
  // reagieren kann (TE-120: gleiche Hervorhebung wie Geburtstage).
  const { todayEvents, tomorrowEvents } = useMemo(() => {
    const todayStr    = new Date().toDateString();
    const tomorrowStr = new Date(Date.now() + 86400000).toDateString();
    return {
      todayEvents:    calEvents.filter((e) => new Date(e.start).toDateString() === todayStr),
      tomorrowEvents: calEvents.filter((e) => new Date(e.start).toDateString() === tomorrowStr),
    };
  }, [calEvents]);

  // Hervorhebung (Glow/Regenbogen) ist aktiv, sobald es heute etwas zu feiern
  // ODER einen Termin gibt – beide teilen sich denselben "Flammen"-Look (TE-120).
  const hasHighlight = todayBirthdays.length > 0 || todayEvents.length > 0;

  // Alle Quellen zu einer einheitlichen Item-Liste verschmelzen (TE-?: "Mein Tag").
  // Nur berechnet/gerendert, wenn der Block aktiv ist – additiv, ersetzt keine
  // bestehenden Blöcke (siehe .drills/2026-06-16/unified-feed-block.md).
  const feedItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];

    // Eigene Tasks (alle offenen, über alle Zeitgruppen).
    // Key: bei Google-Tasks-Sync die googleEventId verwenden statt der lokalen
    // Firestore-/Store-ID – die lokale ID kann je Gerät unterschiedlich entstehen
    // (z.B. lokal angelegt vs. von Google importiert), die googleEventId ist
    // geräteübergreifend stabil und damit für die manuelle Sortierung nötig.
    for (const t of tasks) {
      if (t.completed) continue;
      items.push({
        key: `task:${t.googleEventId ?? t.id}`,
        category: 'task',
        group: feedDateGroup(t.dueDate),
        title: t.title,
        important: !!t.important,
        overdue: !t.completed && !!t.dueDate && t.dueDate < TODAY,
        onPress: () => router.push(`/task/${t.id}` as any),
      });
    }

    // Kinder-Aufgaben (alle offenen je Kind, inkl. Gruppenaufgaben einzeln je Kind).
    for (const child of familyChildren) {
      for (const t of (childTasks[child.id] ?? [])) {
        if (t.done) continue;
        items.push({
          key: `kidTask:${child.id}:${t.id}`,
          category: 'kidsTask',
          group: feedDateGroup(t.date),
          title: `${t.title} · ${childName(child.id)}`,
          overdue: t.date < TODAY,
          onPress: () => router.push('/(tabs)/kids' as any),
        });
      }
    }

    // Posteingang (TE-84: nur gepinnt) – kein eigenes Fälligkeitsdatum → "Ohne Termin".
    for (const m of feedPinnedMails) {
      items.push({
        key: `mail:${m.id}`,
        category: 'mail',
        group: 'later',
        title: parseDisplayFrom(m.from),
        subtitle: m.subject || '(Kein Betreff)',
        important: true,
        onPress: () => router.push('/(tabs)/mail' as any),
      });
    }

    // Kalender-Termine (nur heute – Termine für morgen werden im Feed nicht angezeigt).
    for (const e of todayEvents) {
      items.push({
        key: `calendar:${e.id}`,
        category: 'calendar',
        group: 'today',
        title: e.summary || '(Ohne Titel)',
        subtitle: e.location ?? undefined,
      });
    }

    // Geburtstage (heute).
    for (const b of todayBirthdays) {
      items.push({
        key: `birthday:${b.id}`,
        category: 'birthday',
        group: 'today',
        title: b.name,
        important: true,
      });
    }

    // Geteilte Liste – offene (nicht abgehakte) Einträge, kein Termin.
    for (const n of feedSharedNotes) {
      if (n.done) continue;
      items.push({
        key: `sharedList:${n.id}`,
        category: 'sharedList',
        group: 'later',
        title: n.text,
        subtitle: `von ${n.addedBy}`,
        onPress: () => router.push('/(tabs)' as any),
      });
    }

    // Geistesblitze – persönliche Notiz-Kacheln, kein Termin.
    for (const k of feedGeistesKacheln) {
      items.push({
        key: `geistesblitz:${k.id}`,
        category: 'geistesblitz',
        group: 'later',
        title: k.text,
      });
    }

    // Notizblock – persönliche Notizen aus dem Scratchpad (TE-81), kein Termin.
    // Quelle ist derselbe `scratchpad`-Store-Wert wie der Notizblock selbst, daher
    // fließen Änderungen aus dem Notizblock automatisch in den Feed ein. Leere
    // Einträge (frische, noch ungetippte Notiz) werden ausgelassen. Die Bullet-
    // Farbe ist die vom Nutzer gewählte Notiz-Farbe (TE-85), damit Feed und
    // Notizblock identisch aussehen – auch im Mono-Theme.
    parseScratchpad(scratchpad).forEach((entry, idx) => {
      const text = entry.text.trim();
      if (!text) return;
      items.push({
        // Stabile entry.id statt Array-Index (TE-95): sonst "erbt" eine neu
        // oben eingefügte Notiz Highlight/manuelle Sortierung der alten
        // Notiz an Position 0, weil sich nur der Index, nicht die Notiz
        // selbst, verschoben hat.
        key: `note:${entry.id ?? idx}`,
        category: 'note',
        group: 'later',
        title: text,
        color: entry.color,
      });
    });

    // Taschengeld – Kinder, deren Betrag für den laufenden Monat noch offen ist (TE-78).
    for (const c of openAllowanceChildren) {
      items.push({
        key: `allowance:${c.id}`,
        category: 'allowance',
        group: 'later',
        title: `Taschengeld ${childName(c.id)}`,
        subtitle: `${formatEuro(c.allowance ?? 0)} · ${formatMonthLabel(currentAllowanceMonth)}`,
        onPress: () => router.push('/(tabs)/kids' as any),
      });
    }

    return items;
  }, [
    tasks, familyChildren, childTasks, feedPinnedMails, pinnedSet,
    todayEvents, todayBirthdays, feedSharedNotes,
    feedGeistesKacheln, openAllowanceChildren, currentAllowanceMonth, router,
    scratchpad, isMono, isDark, colors,
  ]);

  useEffect(() => {
    if (!settings.googleAccessToken) return;
    loadDashboardMails(settings.googleAccessToken);
  }, [settings.googleAccessToken, loadDashboardMails]);

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

  // Neon-Dark: Regenbogen-Gradient dreht sich endlos (läuft um den Rand).
  useEffect(() => {
    if (!hasHighlight || !richBirthday) { rainbowRotate.setValue(0); return; }
    const loop = Animated.loop(
      Animated.timing(rainbowRotate, { toValue: 1, duration: 2500, useNativeDriver: true })
    );
    loop.start();
    return () => { loop.stop(); rainbowRotate.setValue(0); };
  }, [hasHighlight, richBirthday, rainbowRotate]);

  // Atmender Flammen-Glow (Gemini-Look) – Schatten pulsiert + wechselt die Farbe,
  // dazu skaliert die Card synchron („atmen"). Läuft in ALLEN Themes, damit der
  // Geburtstag immer sehr präsent ist. useNativeDriver: false, weil Schatten-
  // werte animiert werden (Scale wird auf demselben Node mitgeführt).
  useEffect(() => {
    // Calm-Theme: kein atmender Flammen-Glow – Geburtstags-Card bleibt still.
    if (!hasHighlight || reduceMotion) { flameAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flameAnim, { toValue: 1, duration: 1600, useNativeDriver: false }),
        Animated.timing(flameAnim, { toValue: 0, duration: 1600, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => { loop.stop(); flameAnim.setValue(0); };
  }, [hasHighlight, reduceMotion, flameAnim]);

  // Synchron zum Glow „atmende" Skalierung – gemeinsam für beide Card-Varianten.
  const flameScale = flameAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.05, 1] });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >

      {/* ── Geburtstage: ganz oben ── */}
      {showBlock('birthdays') && todayBirthdays.length > 0 && (
        richBirthday ? (
          // Neon-Dark: AI-Style mit rotierendem Regenbogen-Rand + atmendem Flammen-Glow.
          <Animated.View
            style={[
              styles.birthdayNeonWrap,
              {
                shadowColor: flameAnim.interpolate({
                  inputRange: [0, 0.25, 0.5, 0.75, 1],
                  outputRange: ['#FF0080', '#FF8C00', '#00FF88', '#00EEFF', '#7A5CFF'],
                }),
                shadowOpacity: flameAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 1, 0.7] }),
                shadowRadius: flameAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [16, 46, 16] }),
                transform: [{ scale: flameScale }],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.birthdayRainbowLayer,
                { transform: [{ rotate: rainbowRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
              ]}
            >
              <LinearGradient
                colors={['#FF0080', '#FF8C00', '#FFE600', '#00FF88', '#00EEFF', '#7A5CFF', '#FF0080']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            <View style={styles.birthdayNeonInner}>
              <Text style={styles.birthdayIcon}>🎂</Text>
              <Text style={[styles.birthdayText, styles.birthdayTextNeon]} numberOfLines={1}>
                {todayBirthdays
                  .map((b) => `${b.name}${b.year != null ? ` (${new Date().getFullYear() - b.year})` : ''}`)
                  .join(', ')}
              </Text>
            </View>
          </Animated.View>
        ) : (
          <Animated.View
            style={[
              styles.birthdayCard,
              reduceMotion
                // Calm-Theme: keine farbige Flammen-Aura, kein Atmen – schlichte Card.
                ? { borderWidth: 1, borderColor: colors.border }
                : {
                    shadowColor: flameAnim.interpolate({
                      inputRange: [0, 0.25, 0.5, 0.75, 1],
                      outputRange: ['#FF6B00', '#FF0080', '#FF3B30', '#FF8C00', '#FF0080'],
                    }),
                    shadowOpacity: flameAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0.95, 0.5] }),
                    shadowRadius: flameAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [10, 34, 10] }),
                    transform: [{ scale: flameScale }],
                  },
            ]}
          >
            <Text style={styles.birthdayIcon}>🎂</Text>
            <Text style={styles.birthdayText} numberOfLines={1}>
              {todayBirthdays
                .map((b) => `${b.name}${b.year != null ? ` (${new Date().getFullYear() - b.year})` : ''}`)
                .join(', ')}
            </Text>
          </Animated.View>
        )
      )}

      {/* ── Google-Connect-Banner (nur wenn noch nicht verbunden) ── */}
      {!settings.googleCalendarEnabled && <GoogleConnectBanner colors={colors} />}

      {/* ── Wettervorhersage (TE-126, links) + "Mein Tag"-Icon + Sync-Button (rechts) ── */}
      <View style={styles.syncRow}>
        {showBlock('weather') ? <WeatherWidget colors={colors} /> : <View />}
        <View style={styles.syncRowRight}>
          {showBlock('feed') && (
            <Pressable
              onPress={() => setFeedDialogOpen(true)}
              style={({ pressed }) => [styles.syncBtn, { opacity: pressed ? 0.6 : 1 }]}
              hitSlop={12}
            >
              <Ionicons name="today-outline" size={18} color={colors.textSecondary} />
            </Pressable>
          )}
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
      </View>

      {/* ── "Mein Tag" (Feed): nicht mehr inline auf dem Dashboard, sondern als Dialog ── */}
      {/* über das Icon links neben dem Sync-Button (siehe oben), additiv, standardmäßig AUS. */}
      {showBlock('feed') && (
        <Modal
          visible={feedDialogOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setFeedDialogOpen(false)}
        >
          <View style={[styles.feedModalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setFeedDialogOpen(false)} />
            <View style={[styles.feedModalCard, { backgroundColor: colors.background }]}>
              <View style={styles.feedModalHeader}>
                <Text style={[styles.feedModalTitle, { color: colors.text }]}>Mein Tag</Text>
                <Pressable onPress={() => setFeedDialogOpen(false)} hitSlop={12}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                <FeedBlock
                  items={feedItems}
                  colors={colors}
                  manualOrder={feedOrder}
                  onReorder={handleFeedReorder}
                  highlightedKeys={feedHighlightKeys}
                  onHighlight={handleFeedHighlight}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Tasks + Scratchpad ── */}
      {(showBlock('tasks') || showBlock('scratchpad')) && (
      <View style={styles.topRow}>

        {/* Tasks */}
        {showBlock('tasks') && (
        <View style={styles.tasksCol}>
          {false && taskGroups.length > 0 && (
            <SectionLabel
              title="Heutige Tasks"
              onMore={() => router.push('/(tabs)/tasks' as any)}
              colors={colors}
            />
          )}
          {taskGroups.length === 0 ? (
            <View style={styles.emptyChips}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Alle erledigt 🎉</Text>
            </View>
          ) : (
            <View style={styles.chipRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.textSecondary} style={{ marginTop: 2 }} />
              <View style={styles.chipWrap}>
                {taskGroups.flatMap((group) => {
                  const isToday   = group.key === 'today';
                  const isOverdue = group.key === 'overdue';
                  return group.tasks.map((task) => (
                    <TaskChip
                      key={task.id}
                      task={task}
                      scale="md"
                      blink={isToday && !!task.important}
                      overdue={isOverdue}
                      onPress={() => router.push(`/task/${task.id}` as any)}
                    />
                  ));
                })}
              </View>
            </View>
          )}
        </View>
        )}

        {/* Trennlinie entfernt */}

        {/* Notizblock – TE-114: Notizen als gefloatete Pillen, einheitlich mit den
            Task-Chips links. Nur Anzeige; bearbeitet wird ausschließlich im
            Tasks-Tab (Klick auf eine Pille bzw. „Alle →" führt dorthin). */}
        {showBlock('scratchpad') && (() => {
          const notes = parseScratchpad(scratchpad).filter((e) => e.text.trim() !== '');
          return (
            <View style={styles.scratchCol}>
              {false && (
              <SectionLabel
                title="Notizblock"
                colors={colors}
                onMore={() => router.push('/(tabs)/tasks' as any)}
              />
              )}
              {notes.length === 0 ? (
                <View style={styles.emptyChips}>
                  <Ionicons name="document-text-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>Keine Notizen</Text>
                </View>
              ) : (
                <View style={styles.chipRow}>
                  <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} style={{ marginTop: 2 }} />
                  <View style={styles.chipWrap}>
                    {notes.map((entry, idx) => (
                      <NoteChip
                        key={entry.id ?? idx}
                        entry={entry}
                        onPress={() => router.push('/(tabs)/tasks' as any)}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>
          );
        })()}

      </View>
      )}

      {/* ── Links-Schnellleiste (TE-32): nur aktive Links, oberhalb der Geistesblitze ── */}
      {showBlock('links') && <LinkCardBar colors={colors} isDark={isDark} />}

      {/* ── Geistesblitze: persönliche Gedanken-Kacheln ── */}
      {showBlock('geistesblitze') && <GeistesKacheln colors={colors} isDark={isDark} />}

      {/* ── Countdowns (TE-128): filigrane, motivierende Karten oberhalb der Termine ── */}
      {showBlock('countdowns') && <CountdownStrip colors={colors} />}

      {/* ── Kalender ── */}
      {showBlock('calendar') && settings.googleCalendarEnabled && (
        <View style={styles.section}>
          {calLoading || calEvents.length > 0 ? (
            <SectionLabel title="Heutige Termine" colors={colors} />
          ) : null}
          {calLoading ? (
            <View style={[styles.card, styles.loadingRow]}>
              <ActivityIndicator color={mono(C.calendar)} size="small" />
            </View>
          ) : calEvents.length === 0 ? (
            <View style={[styles.card, styles.emptyRow]}>
              <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
              <Text style={styles.emptyText}>Keine Termine</Text>
            </View>
          ) : (() => {
            const renderEvent = (event: CalendarEvent, i: number, arr: CalendarEvent[], prominent: boolean) => {
              const { time } = formatEventTime(event);
              const eventColor = mono(event.color ?? C.calendar);
              // Mono-Theme: echte Kalenderfarbe als Punkt zeigen (nicht graustufen),
              // damit die Kategorie auf einen Blick erkennbar bleibt (TE-86).
              const realColor = event.color ?? C.calendar;
              // Dark-Mono: Termintext & Zeit immer strahlend weiß – das gedämpfte
              // Grau (textSecondary) ist auf Schwarz schlecht lesbar (TE-88).
              const eventTextColor = isMono
                ? colors.text
                : (prominent ? colors.text : colors.textSecondary);
              return (
                <View
                  key={event.id}
                  style={[
                    prominent ? styles.calRowProminent : styles.calRowDimmed,
                    i < arr.length - 1 && styles.rowDivider,
                  ]}
                >
                  {/* Mono: farbiger Punkt (echte Kalenderfarbe); sonst Farbbalken */}
                  {isMono ? (
                    <View style={[styles.calDot, {
                      backgroundColor: realColor,
                      width: prominent ? 12 : 10,
                      height: prominent ? 12 : 10,
                      opacity: prominent ? 1 : 0.7,
                    }]} />
                  ) : (
                    <View style={[styles.calBar, {
                      backgroundColor: eventColor,
                      width: prominent ? 4 : 3,
                      opacity: prominent ? 1 : 0.6,
                    }]} />
                  )}
                  {/* Zeit */}
                  <View style={prominent ? styles.calTimeLg : styles.calTimeSm}>
                    <Text style={[
                      prominent ? styles.calHourLg : styles.calHourSm,
                      { color: eventTextColor }
                    ]}>{time}</Text>
                  </View>
                  {/* Titel + Ort in einer Zeile (TE-116) */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        prominent ? styles.calTitleLg : styles.calTitleSm,
                        { color: eventTextColor }
                      ]}
                      numberOfLines={1}
                    >
                      {event.summary}
                      {event.location && prominent ? ` · 📍 ${event.location}` : ''}
                    </Text>
                  </View>
                </View>
              );
            };

            return (
              <View style={{ gap: 6 }}>
                {todayEvents.length > 0 && (
                  <View>
                    {/* Gleiche Hervorhebung wie die Geburtstags-Card: atmender
                        Flammen-Glow überall, zusätzlich rotierender Regenbogen-
                        Rand im Neon-/Mono-Dark-Theme (TE-120). */}
                    {richBirthday ? (
                      <Animated.View
                        style={[
                          styles.todayEventsNeonWrap,
                          {
                            shadowColor: flameAnim.interpolate({
                              inputRange: [0, 0.25, 0.5, 0.75, 1],
                              outputRange: ['#FF0080', '#FF8C00', '#00FF88', '#00EEFF', '#7A5CFF'],
                            }),
                            shadowOpacity: flameAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 1, 0.7] }),
                            shadowRadius: flameAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [16, 46, 16] }),
                            transform: [{ scale: flameScale }],
                          },
                        ]}
                      >
                        <Animated.View
                          style={[
                            styles.birthdayRainbowLayer,
                            { transform: [{ rotate: rainbowRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
                          ]}
                        >
                          <LinearGradient
                            colors={['#FF0080', '#FF8C00', '#FFE600', '#00FF88', '#00EEFF', '#7A5CFF', '#FF0080']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                          />
                        </Animated.View>
                        <View style={styles.todayEventsNeonInner}>
                          {todayEvents.map((e, i) => renderEvent(e, i, todayEvents, true))}
                        </View>
                      </Animated.View>
                    ) : (
                      <Animated.View
                        style={[
                          styles.card,
                          styles.todayEventsGlowCard,
                          reduceMotion
                            // Calm-Theme (TE-44): kein Flammen-Glow – ohne diese
                            // Gate bliebe selbst bei flameAnim=0 ein statischer
                            // oranger Schatten (Index-0-Wert) stehen. Schlichte
                            // Card mit dezentem blauem Rahmen (aus styles.card).
                            ? { elevation: 0 }
                            : {
                                shadowColor: flameAnim.interpolate({
                                  inputRange: [0, 0.25, 0.5, 0.75, 1],
                                  outputRange: ['#FF6B00', '#FF0080', '#FF3B30', '#FF8C00', '#FF0080'],
                                }),
                                shadowOpacity: flameAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0.95, 0.5] }),
                                shadowRadius: flameAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [10, 34, 10] }),
                                transform: [{ scale: flameScale }],
                              },
                        ]}
                      >
                        {todayEvents.map((e, i) => renderEvent(e, i, todayEvents, true))}
                      </Animated.View>
                    )}
                  </View>
                )}
              </View>
            );
          })()}
        </View>
      )}

      {/* ── Geteilte Liste (TE-121): bewusst auffällig gestaltete Card, ── */}
      {/* damit z. B. eine gemeinsame Einkaufsliste mit dem Partner sofort ins Auge fällt. */}
      {showBlock('sharedList') && <SharedNotepad colors={colors} isDark={isDark} />}

      {/* ── Aufgaben der Kinder (TE-110/TE-115) ── */}
      {showBlock('kidsTasks') && (childrenWithTasks.length > 0 || groupTasks.length > 0) && (
        <View style={styles.section}>
          <SectionLabel
            title="Aufgaben der Kinder"
            onMore={() => router.push('/(tabs)/kids' as any)}
            colors={colors}
          />

          {/* Eigene Karte (TE-123): kapselt den ganzen Abschnitt sichtbar ab */}
          <View style={styles.kidsSectionCard}>

            {/* Einzelne Kinder – einspaltig, mit Avatar + Fälligkeitsdatum (TE-119) */}
            {childrenWithTasks.length > 0 && (
              <View style={{ gap: 10 }}>
                {childrenWithTasks.map((childId) => {
                  const list = individualByChild[childId];
                  const doneCount = list.filter((t) => t.done).length;
                  return (
                    <View key={childId}>
                      <View style={styles.kidLabelRow}>
                        <View style={[styles.kidAvatar, { backgroundColor: childColor(childId) }]}>
                          <Text style={styles.kidAvatarText}>
                            {childEmoji(childId) ?? childName(childId).charAt(0)}
                          </Text>
                        </View>
                        <Text style={[styles.dayLabel, styles.kidColLabel, { color: colors.textMuted }]}>
                          {childName(childId)} · {doneCount}/{list.length}
                        </Text>
                      </View>
                      <Pressable
                        style={[styles.card, styles.kidCard]}
                        onPress={() => router.push('/(tabs)/kids' as any)}
                      >
                        {list.map((task, i) => {
                          const due = dueInfo(task);
                          return (
                            <View
                              key={task.id}
                              style={[styles.kidRow, i < list.length - 1 && styles.rowDivider]}
                            >
                              <Ionicons
                                name={task.done ? 'checkmark-circle' : task.rejected ? 'close-circle' : 'ellipse-outline'}
                                size={18}
                                color={task.done ? colors.success : task.rejected ? colors.danger : colors.textMuted}
                              />
                              <Text
                                style={[
                                  styles.kidTaskText,
                                  { color: colors.text },
                                  task.done && styles.kidTaskDone,
                                  task.rejected && { color: colors.danger },
                                ]}
                                numberOfLines={1}
                              >
                                {task.title}
                              </Text>
                              {due && (
                                <Text style={[styles.dueBadge, due.overdue && styles.dueBadgeOverdue]}>
                                  {due.label}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
  
            {/* Gruppenarbeiten – einspaltig mit eigenem Avatar + Fälligkeitsdatum (TE-115/TE-119) */}
            {groupTasks.length > 0 && (
              <View style={{ gap: 10, marginTop: childrenWithTasks.length > 0 ? 10 : 0 }}>
                {groupTasks.map((g) => {
                  const doneCount = g.entries.filter((e) => e.task.done).length;
                  const due = dueInfo(g.entries[0]?.task);
                  return (
                    <View key={g.groupId}>
                      <View style={styles.kidLabelRow}>
                        <View style={[styles.kidAvatar, { backgroundColor: colors.accentNeon }]}>
                          <Ionicons name="people" size={12} color="#000" />
                        </View>
                        <Text style={[styles.dayLabel, styles.kidColLabel, { color: colors.textMuted }]} numberOfLines={1}>
                          {g.title} · {doneCount}/{g.entries.length}
                        </Text>
                        {due && (
                          <Text style={[styles.dueBadge, due.overdue && styles.dueBadgeOverdue]}>
                            {due.label}
                          </Text>
                        )}
                      </View>
                      <Pressable
                        style={[styles.card, styles.kidCard]}
                        onPress={() => router.push('/(tabs)/kids' as any)}
                      >
                        {g.entries.map((e, i) => (
                          <View
                            key={e.childId}
                            style={[styles.kidRow, i < g.entries.length - 1 && styles.rowDivider]}
                          >
                            <Ionicons
                              name={e.task.done ? 'checkmark-circle' : e.task.rejected ? 'close-circle' : 'ellipse-outline'}
                              size={18}
                              color={e.task.done ? colors.success : e.task.rejected ? colors.danger : colors.textMuted}
                            />
                            <Text
                              style={[
                                styles.kidTaskText,
                                { color: colors.text },
                                e.task.done && styles.kidTaskDone,
                                e.task.rejected && { color: colors.danger },
                              ]}
                              numberOfLines={1}
                            >
                              {childName(e.childId)}
                            </Text>
                          </View>
                        ))}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── Taschengeld (TE-78): wer hat das Taschengeld für den laufenden Monat noch nicht bekommen? ── */}
      {showBlock('allowance') && openAllowanceChildren.length > 0 && (
        <View style={styles.section}>
          <SectionLabel
            title="Taschengeld offen"
            onMore={() => router.push('/(tabs)/kids' as any)}
            colors={colors}
          />
          <View style={[styles.card, styles.kidCard]}>
            {openAllowanceChildren.map((child, i) => (
              <View
                key={child.id}
                style={[styles.kidRow, i < openAllowanceChildren.length - 1 && styles.rowDivider]}
              >
                <View style={[styles.kidAvatar, { backgroundColor: childColor(child.id) }]}>
                  <Text style={styles.kidAvatarText}>
                    {childEmoji(child.id) ?? childName(child.id).charAt(0)}
                  </Text>
                </View>
                <Text style={[styles.kidTaskText, { color: colors.text }]} numberOfLines={1}>
                  {childName(child.id)}
                </Text>
                <Text style={[styles.dueBadge, styles.dueBadgeOverdue]}>
                  {formatEuro(child.allowance ?? 0)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Posteingang ── */}
      {showBlock('mail') && settings.googleAccessToken && (
        <View style={styles.section}>
          <SectionLabel
            title="Posteingang"
            onMore={() => router.push('/(tabs)/mail')}
            colors={colors}
          />
          <View style={[styles.card, !reduceMotion && { borderLeftColor: colors.border, borderLeftWidth: 3 }]}>
            {mailLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.textMuted} size="small" />
              </View>
            ) : dashboardMails.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={styles.emptyText}>Keine angepinnten oder ungelesenen Mails</Text>
              </View>
            ) : (
              dashboardMails.map((mail, i) => {
                const pinned = pinnedSet.has(mail.id);
                return (
                  <View
                    key={mail.id}
                    style={[styles.mailRow, i < dashboardMails.length - 1 && styles.rowDivider]}
                  >
                    <View style={[styles.mailAvatar, { backgroundColor: colors.surfaceHigh }]}>
                      <Text style={[styles.mailAvatarText, { color: colors.textSecondary }]}>
                        {parseDisplayFrom(mail.from).charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.mailMeta}>
                        <Text
                          style={[styles.mailFrom, { color: colors.text }, mail.unread && { fontWeight: '800' }]}
                          numberOfLines={1}
                        >
                          {parseDisplayFrom(mail.from)}
                        </Text>
                        <Text style={[styles.mailDate, { color: colors.textMuted }]}>
                          {formatMailDate(mail.date)}
                        </Text>
                      </View>
                      <View style={[styles.mailMeta, { alignItems: 'center', marginBottom: 0 }]}>
                        <Text
                          style={[
                            styles.mailSubject,
                            { color: mail.unread ? colors.text : colors.textSecondary, flex: 1 },
                          ]}
                          numberOfLines={1}
                        >
                          {mail.subject || '(Kein Betreff)'}
                        </Text>
                        {pinned && (
                          <Ionicons name="bookmark" size={12} color={colors.accentNeon} style={{ marginLeft: 6 }} />
                        )}
                        {mail.unread && !pinned && (
                          <View style={[styles.unreadDot, { backgroundColor: colors.accentNeon }]} />
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>
      )}

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors, isDark: boolean, calm: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { paddingTop: 16, paddingBottom: 48, gap: 24 },

    syncRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginBottom: -8,
    },
    syncRowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    syncBtn: {
      padding: 4,
      borderRadius: 16,
      ...(isDark ? neonGlow(c.accentNeon, 'soft') : {}),
    },

    feedModalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    feedModalCard: {
      maxHeight: '80%',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 16,
    },
    feedModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    feedModalTitle: {
      fontSize: 17,
      fontWeight: '700',
    },

    section: {},

    // Vertical layout: Tasks oben, Notizen unten
    topRow: {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
    tasksCol: {
      flex: 1,
      minWidth: 0,
    },
    scratchCol: {
      flex: 1,
      minWidth: 0,
      marginBottom: 20,
    },

    taskScratchDivider: {
      height: 1,
      backgroundColor: c.border,
      marginHorizontal: 16,
      marginVertical: 8,
    },

    card: {
      marginHorizontal: 16,
      backgroundColor: c.surface,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      // Neon/Mono-Dark: leuchtende Oberfläche wie im Tasks-Tab (weißer Neon-Rand
      // + soft Glow). Calm-Theme (TE-44): kein weißer Rand, sondern der dezente
      // blaue Border (c.border); Glow ist via glowSuppressed() ohnehin aus.
      borderColor: isDark && !calm ? c.accentNeon + '40' : c.border,
      ...(isDark ? neonGlow(c.accentNeon, 'soft') : {}),
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
    chipRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 16,
      gap: 8,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      flex: 1,
    },
    emptyChips: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
    },

    // Birthday – ganz oben, neon-gelb, schnell blinkend
    birthdayCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#EEFF00',
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 6,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
      gap: 8,
      // Flammen-Glow (animiert, inline) – Offset/Elevation hier als Basis.
      shadowOffset: { width: 0, height: 0 },
      elevation: 14,
    },
    birthdayIcon: { fontSize: 16 },
    birthdayText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1A1A00' },

    // Birthday – Neon-Dark: rotierender Regenbogen-Rand (AI-Style).
    // Schattenfarbe/-radius/-opacity werden inline animiert (Flammen-Glow).
    birthdayNeonWrap: {
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 6,
      borderRadius: 12,
      padding: 4,            // Dicke des Regenbogen-Rings
      overflow: 'hidden',
      shadowOffset: { width: 0, height: 0 },
      elevation: 16,
    },
    birthdayRainbowLayer: {
      position: 'absolute',
      width: Math.max(Dimensions.get('window').width, 480),
      height: Math.max(Dimensions.get('window').width, 480),
      left: '50%',
      top: '50%',
      marginLeft: -Math.max(Dimensions.get('window').width, 480) / 2,
      marginTop: -Math.max(Dimensions.get('window').width, 480) / 2,
    },
    birthdayNeonInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#0E0E16',
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    birthdayTextNeon: { color: '#EAEAFF' },

    // Termine "heute" – gleiche Hervorhebung wie die Geburtstags-Card (TE-120).
    todayEventsGlowCard: {
      // Neon/Mono: kein linker Rand (Glow trägt die Kante). Calm (TE-44):
      // einheitlicher 1px-Rahmen wie auf den anderen Seiten.
      borderLeftWidth: calm ? 1 : 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 14,
    },
    todayEventsNeonWrap: {
      marginHorizontal: 16,
      borderRadius: 12,
      padding: 4,
      overflow: 'hidden',
      shadowOffset: { width: 0, height: 0 },
      elevation: 16,
    },
    todayEventsNeonInner: {
      backgroundColor: '#0E0E16',
      borderRadius: 10,
      overflow: 'hidden',
    },

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
    unreadDot: { width: 7, height: 7, borderRadius: 3.5, marginLeft: 6 },

    // Calendar
    calRowProminent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
    calRowDimmed:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9,  gap: 10 },
    calTimeLg: { width: 46 },
    calTimeSm: { width: 40 },
    calHourLg: { fontSize: 15, fontWeight: '700' },
    calHourSm: { fontSize: 12, fontWeight: '500' },
    calBar: { borderRadius: 2, alignSelf: 'stretch', minHeight: 24 },
    calDot: { borderRadius: 999, alignSelf: 'center' },
    calTitleLg: { fontSize: 14, fontWeight: '600' },
    calTitleSm: { fontSize: 12, fontWeight: '400' },
    calSub: { fontSize: 11, marginTop: 2 },
    // compat
    calRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
    calTime: { width: 52, alignItems: 'center' as const },
    calDay: { fontSize: 9, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    calHour: { fontSize: 14, fontWeight: '700' as const },
    calTitle: { fontSize: 14, fontWeight: '500' as const },

    // Aufgaben der Kinder (TE-110/TE-115)
    kidRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    kidTaskText: { flex: 1, fontSize: 13, fontWeight: '500' },
    kidTaskDone: { textDecorationLine: 'line-through', color: c.textMuted },
    // Fälligkeitsdatum je Aufgabe (TE-119): rot, wenn der Termin überschritten ist.
    dueBadge: {
      fontSize: 11, fontWeight: '700', color: c.textMuted,
      paddingHorizontal: 6,
    },
    dueBadgeOverdue: { color: '#fff', backgroundColor: '#ef4444', borderRadius: 6, paddingVertical: 1, overflow: 'hidden' },
    // Zweispaltiges Kinder-Grid (TE-115)
    kidGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      rowGap: 10,
    },
    kidCol: { width: '48%' },
    kidColLabel: { paddingHorizontal: 0 },
    kidLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    // Eigene, abgekapselte Karte für die Kinder-Sektion (TE-123) – grenzt den
    // Abschnitt sichtbar von Kalender/Geteilter Liste/etc. ab.
    kidsSectionCard: {
      marginHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: c.surface,
      borderColor: c.border,
      padding: 12,
      gap: 12,
    },
    kidAvatar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    kidAvatarText: { fontSize: 11, fontWeight: '800', color: '#fff' },
    kidCard: { marginHorizontal: 0, borderLeftWidth: calm ? 1 : 0 },
    // Gruppenarbeit-Karte (TE-115)
    groupTitle: {
      fontSize: 14,
      fontWeight: '700',
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 4,
    },
  });
}
