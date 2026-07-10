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
  Alert,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { useTheme, ThemeColors, readableTextOn, neonGlow } from '../utils/theme';
import { useScratchpad } from '../hooks/useScratchpad';
import { parseScratchpad, serializeScratchpad, sortScratch, makeNoteId } from '../components/Scratchpad';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useGoogleTasksSync } from '../hooks/useGoogleTasksSync';
import { useGoogleContactsBirthdaysSync } from '../hooks/useGoogleContactsBirthdaysSync';
import { isOverdue, isDueToday, localDateStr } from '../utils/dateFormat';
import { fetchRecentMails, fetchMailsByIds, MailMessage } from '../services/googleMail';
import { listUpcomingEvents, CalendarEvent } from '../services/googleCalendar';
import {
  ChildTask, subscribeToChildTasks,
} from '../services/kinderTasks';
import { AllowanceMonth, subscribeToAllowanceMonths, monthKey, formatEuro, formatMonthLabel, effectiveAllowance, setAllowanceOverride } from '../services/allowance';
import { useFamily } from '../hooks/useFamily';
import { SharedNotepad } from '../components/SharedNotepad';
import { GeistesKacheln } from '../components/GeistesKacheln';
import { LinkCardBar } from '../components/LinkCardBar';
import { WeatherWidget } from '../components/WeatherWidget';
import { GoogleConnectBanner } from '../components/GoogleConnectBanner';
import { CountdownStrip } from '../components/CountdownStrip';
import { FussballKachel } from '../components/FussballKachel';
import { FeedBlock, FeedItem } from '../components/FeedBlock';
import { subscribeToFeedOrder, saveFeedOrder, FeedOrder } from '../services/feedOrderService';
import { subscribeToFeedHighlight, saveFeedHighlight } from '../services/feedHighlightService';
import { SharedNoteItem, subscribeToSharedNotes } from '../services/sharedNotes';
import { addQuickNote, subscribeToQuickNotes } from '../services/quickNotesService';
import { GeistesKachel, subscribeToGeistesKacheln } from '../services/geistesKacheln';
import { DashboardBlockKey, QuickNote, Task } from '../types';

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

/** TE-150: Fälligkeit für Google/Personal Tasks: "heute" / "TT.MM." mit
 * Overdue-Markierung – analog zu dueInfo() für Kinder-Aufgaben. `dateStr` kann
 * ein voller RFC3339-Zeitstempel sein (Google Tasks liefern z. B.
 * "2025-06-25T10:00:00.000Z") – deshalb erst über localDateStr() auf das lokale
 * "YYYY-MM-DD" normalisieren, bevor Tag/Monat herausgelöst werden. */
function taskDue(dateStr?: string | null): { label: string; overdue: boolean } | null {
  if (!dateStr) return null;
  if (isDueToday(dateStr)) return { label: 'heute', overdue: false };
  const overdue = isOverdue(dateStr);
  const [, m, d] = localDateStr(dateStr).split('-');
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
  tasks:    '#3B82F6',   // Blau – Google Tasks
  calendar: '#4285F4',   // Google Kalender Blau
  important:'#FF3B30',   // Rot
  overdue:  '#FF3B30',
  personal: '#8B5CF6',   // Violett – Personal Tasks
  notes:    '#F59E0B',   // Amber – Notizen
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

// ─── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({
  title, onMore, moreLabel = 'Alle →', colors, onAdd,
}: {
  title: string; onMore?: () => void; moreLabel?: string; colors: ThemeColors;
  // TE-152: optionales Plus-Icon fürs schnelle Anlegen direkt aus dem Abschnitt.
  onAdd?: () => void;
}) {
  return (
    <View style={labelStyles.row}>
      <Text style={[labelStyles.title, { color: colors.textSecondary }]}>{title}</Text>
      <View style={labelStyles.actions}>
        {onAdd && (
          <Pressable onPress={onAdd} hitSlop={8} style={labelStyles.addBtn}>
            <Ionicons name="add" size={16} color={colors.textSecondary} />
          </Pressable>
        )}
        {onMore && (
          <Pressable onPress={onMore} hitSlop={8}>
            <Text style={[labelStyles.more, { color: colors.textMuted }]}>{moreLabel}</Text>
          </Pressable>
        )}
      </View>
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addBtn: {
    padding: 2,
  },
});

// TE-150: NoteChip/chipStyles/chipText entfernt – Personal Tasks erscheinen nicht
// mehr als gefloatete Pillen, sondern zeilenweise in der dezenten Kurzübersicht
// (siehe „dezentRow"-Styles + Kurzübersicht-Block im Render).

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const router = useRouter();
  const { familyId, children: familyChildren } = useFamily();
  const fid = familyId ?? '';
  // Lookup-Helfer für dynamische Kinder-Daten
  const childName = (id: string) => familyChildren.find((c) => c.id === id)?.name ?? id;
  const childColor = (id: string) => familyChildren.find((c) => c.id === id)?.color ?? CHILD_COLOR_FALLBACK;
  const childEmoji = (id: string) => familyChildren.find((c) => c.id === id)?.emoji ?? null;
  const { settings, birthdays: storeBirthdays, pinnedMailIds, tasks } = useStore();
  // TE-104: Notizblock-Wert + Firestore-Abo zentral aus dem Hook. Das Dashboard
  // zeigt ihn nur an (readOnly); bearbeitet wird er im Tasks-Tab.
  // TE-152: `onChange` wird zusätzlich fürs Schnell-Anlegen über das Plus-Icon
  // gebraucht (neuer Eintrag oben, kein voller Bearbeitungsmodus).
  const { scratchpad, onChange: saveScratchpadText } = useScratchpad();
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

  // TE-152: Schnell-Anlegen für Personal Tasks & Notizen direkt aus der
  // Kurzübersicht – kleines Text-Modal statt vollem Formular (Google Tasks
  // gehen weiterhin über das bestehende Anlegen-Formular, siehe onAdd unten).
  const [quickAddKind, setQuickAddKind] = useState<'personal' | 'notiz' | null>(null);
  const [quickAddText, setQuickAddText] = useState('');

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

  // Taschengeld-Korrektur für den laufenden Monat (TE-154): Eltern passen den
  // Betrag eines Kindes nur für diesen Monat an, optional mit Grund.
  const [allowanceEdit, setAllowanceEdit] = useState<{
    childId: string; amount: string; reason: string;
  } | null>(null);
  const openAllowanceEdit = useCallback((childId: string) => {
    const m = allowanceByChild[childId]?.[currentAllowanceMonth];
    const configured = familyChildren.find((c) => c.id === childId)?.allowance ?? 0;
    setAllowanceEdit({
      childId,
      amount: String(m?.overrideAmount != null ? m.overrideAmount : configured),
      reason: m?.overrideReason ?? '',
    });
  }, [allowanceByChild, currentAllowanceMonth, familyChildren]);
  const saveAllowanceEdit = useCallback(async () => {
    if (!allowanceEdit || !fid) { setAllowanceEdit(null); return; }
    const t = allowanceEdit.amount.trim().replace(',', '.');
    const n = t === '' ? NaN : parseFloat(t);
    const configured = familyChildren.find((c) => c.id === allowanceEdit.childId)?.allowance ?? 0;
    // Betrag == regulär → Korrektur entfernen; sonst als Override speichern.
    const override = Number.isFinite(n) && n >= 0 && n !== configured ? n : null;
    try {
      await setAllowanceOverride(
        fid, allowanceEdit.childId, currentAllowanceMonth,
        override, allowanceEdit.reason.trim() || null,
      );
    } catch (e: any) {
      Alert.alert('Fehler', e?.message ?? 'Korrektur speichern fehlgeschlagen.');
    }
    setAllowanceEdit(null);
  }, [allowanceEdit, fid, currentAllowanceMonth, familyChildren]);

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

  // TE-148: Schnelle Notizen (eigener Dashboard-Block, nur Anzeige – bearbeitet
  // wird im Notizen-Tab). Neueste zuerst; auf dem Dashboard gekappt.
  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);
  useEffect(() => {
    if (!fid || !user?.uid) return;
    const unsub = subscribeToQuickNotes(fid, user.uid, setQuickNotes, () => setQuickNotes([]));
    return unsub;
  }, [fid, user?.uid]);

  // TE-160: Nur wichtige Schnellnotizen erscheinen im Dashboard.
  const importantQuickNotes = useMemo(
    () => quickNotes.filter((n) => n.important),
    [quickNotes],
  );

  // TE-150: Google Tasks fürs Dashboard – offene Tasks, wichtig zuerst, dann nach
  // Fälligkeit. Zeilenweise & dezent über den Links dargestellt (Klick → Tasks-Tab).
  const dashboardTasks = useMemo<Task[]>(
    () =>
      tasks
        .filter((t) => !t.completed)
        .sort((a, b) => {
          if (!!a.important !== !!b.important) return a.important ? -1 : 1;
          const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return da - db;
        }),
    [tasks],
  );

  // TE-150/TE-160: Personal Tasks (Notizblock/Scratchpad) – offene Einträge,
  // intelligent sortiert (wichtig/Fälligkeit), erledigte raus. Auf dem Dashboard
  // nur wichtige oder bereits fällige (heute/überfällig) Einträge – zukünftige,
  // nicht als wichtig markierte Einträge bleiben dem Tasks-Tab vorbehalten.
  const personalNotes = useMemo(
    () =>
      sortScratch(
        parseScratchpad(scratchpad).filter(
          (e) => e.text.trim() !== '' && !e.done && (e.important || isDueToday(e.dueDate ?? null) || isOverdue(e.dueDate ?? null)),
        ),
      ),
    [scratchpad],
  );

  // TE-152: Übernimmt den Text aus dem Schnell-Anlegen-Modal – je nach
  // `quickAddKind` entweder als neuer Scratchpad-Eintrag (oben eingefügt, wie
  // addEntryAtTop in components/Scratchpad.tsx) oder als neue Notiz über den
  // bestehenden quickNotesService.
  const handleQuickAddSubmit = useCallback(() => {
    const text = quickAddText.trim();
    if (!text) { setQuickAddKind(null); return; }
    if (quickAddKind === 'personal') {
      const current = parseScratchpad(scratchpad).filter((e) => e.text.trim() !== '');
      saveScratchpadText(serializeScratchpad([
        { id: makeNoteId(), text, color: '#9E9E9E' },
        ...current,
      ]));
    } else if (quickAddKind === 'notiz') {
      if (fid && user?.uid) addQuickNote(fid, user.uid, text).catch(() => {});
    }
    setQuickAddText('');
    setQuickAddKind(null);
  }, [quickAddKind, quickAddText, scratchpad, saveScratchpadText, fid, user?.uid]);

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

  // TE-138: Tasks-Gruppierung fürs Dashboard entfernt – Tasks erscheinen nur
  // noch im Tasks-Tab, nicht mehr auf dem Dashboard.

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

    // TE-138: Eigene Tasks erscheinen nicht mehr im „Mein Tag"-Feed – das
    // Dashboard ist tasks-frei, der Tasks-Tab bleibt die einzige Quelle dafür.

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
    familyChildren, childTasks, feedPinnedMails, pinnedSet,
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

  // TE-161: Google Tasks/Personal Tasks/Notizen laufen jetzt einspaltig über
  // die volle Breite; Links/Geistesblitze/Countdowns sitzen als eigener,
  // ebenfalls volle-Breite-Block ganz unten (siehe Render). Die Spaltenzahl
  // für die Geistesblitze wird aus der *tatsächlichen Container-Breite*
  // abgeleitet (onLayout), nicht aus der Fensterbreite – das Dashboard
  // rendert oft in einem schmalen Panel, das viel kleiner als das Fenster
  // ist. Countdowns haben seit TE-162 wieder eine feste Kachelgröße (wie am
  // Anfang) und brauchen daher keine berechnete Spaltenzahl mehr – sie
  // brechen per flexWrap von selbst um.
  const { width: winW } = useWindowDimensions();
  const [dashW, setDashW] = useState(0);
  const effW = dashW || winW;
  const wideCols = Math.max(4, Math.round((effW - 26) / 86));

  return (
    <View style={styles.root}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onLayout={(e) => setDashW(e.nativeEvent.layout.width)}
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

      {/* ── Kurzübersicht (TE-150/TE-161/TE-164): Google Tasks, Personal Tasks, Notizen ──
          Zeilenweise & extrem dezent (schlichte Textzeilen, kein Karten-Chrome pro
          Zeile), aber TE-164: die drei Abschnitte teilen sich jetzt einen
          gemeinsamen Rahmen (wie kidsSectionCard bei "Aufgaben der Kinder"), damit
          die Kurzübersicht als ein zusammengehöriger Block erkennbar ist. Innerhalb
          des Rahmens trennt eine farbige linke Akzentleiste pro Kategorie
          (Blau/Violett/Amber) die drei Bereiche optisch, plus ein Trennstrich
          zwischen den vorhandenen Abschnitten.
          Reihenfolge: 1. Google Tasks, 2. Personal Tasks, 3. Notizen.
          TE-161: läuft über die volle Breite – die frühere zweispaltige
          Aufteilung (schmale rechte Spalte für Links/Geistesblitze/Countdowns)
          ist entfallen, jene drei Blöcke sitzen jetzt ganz unten (siehe dort). */}
      {(showBlock('googleTasks') || showBlock('scratchpad') || showBlock('quickNotes')) && (
        <View style={styles.quickOverviewCard}>

          {/* 1. Google Tasks – offene Tasks aus dem Google-Tasks-Store (Klick → Tasks-Tab).
              TE-152: Abschnitt bleibt auch ohne offene Tasks sichtbar, damit das
              Plus-Icon zum schnellen Anlegen jederzeit erreichbar ist. */}
          {showBlock('googleTasks') && (
            <View style={[styles.quickOverviewSection, { borderLeftColor: mono(C.tasks) }]}>
              <SectionLabel
                title="Google Tasks"
                onMore={() => router.push('/(tabs)/tasks' as any)}
                onAdd={() => router.push('/task/new' as any)}
                colors={colors}
              />
              <View>
                {dashboardTasks.slice(0, 6).map((t) => {
                  const due = taskDue(t.dueDate);
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => router.push('/(tabs)/tasks' as any)}
                      style={({ pressed }) => [styles.dezentRow, { opacity: pressed ? 0.6 : 1 }]}
                    >
                      <View style={[styles.dezentBullet, t.important && { backgroundColor: C.important }]} />
                      <Text style={styles.dezentText} numberOfLines={1}>{t.title}</Text>
                      {due && (
                        <Text style={[styles.dueBadge, due.overdue && styles.dueBadgeOverdue]}>{due.label}</Text>
                      )}
                    </Pressable>
                  );
                })}
                {dashboardTasks.length > 6 && (
                  <Text style={[styles.dezentMore, { color: colors.textMuted }]}>
                    +{dashboardTasks.length - 6} weitere
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* 2. Personal Tasks – persönlicher Notizblock (Scratchpad), Klick → Tasks-Tab.
              TE-152: Abschnitt bleibt auch ohne offene Einträge sichtbar, Plus-Icon
              öffnet das Schnell-Anlegen-Modal statt des vollen Tasks-Tabs. */}
          {showBlock('scratchpad') && (
            <View
              style={[
                styles.quickOverviewSection,
                showBlock('googleTasks') && styles.quickOverviewDivider,
                { borderLeftColor: mono(C.personal) },
              ]}
            >
              <SectionLabel
                title="Personal Tasks"
                onMore={() => router.push('/(tabs)/tasks' as any)}
                onAdd={() => setQuickAddKind('personal')}
                colors={colors}
              />
              <View>
                {personalNotes.slice(0, 6).map((entry, idx) => {
                  const due = taskDue(entry.dueDate);
                  return (
                    <Pressable
                      key={entry.id ?? idx}
                      onPress={() => router.push('/(tabs)/tasks' as any)}
                      style={({ pressed }) => [styles.dezentRow, { opacity: pressed ? 0.6 : 1 }]}
                    >
                      <View style={[styles.dezentBullet, entry.important && { backgroundColor: C.important }]} />
                      <Text style={styles.dezentText} numberOfLines={1}>{entry.text}</Text>
                      {due && (
                        <Text style={[styles.dueBadge, due.overdue && styles.dueBadgeOverdue]}>{due.label}</Text>
                      )}
                    </Pressable>
                  );
                })}
                {personalNotes.length > 6 && (
                  <Text style={[styles.dezentMore, { color: colors.textMuted }]}>
                    +{personalNotes.length - 6} weitere
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* 3. Notizen – kurze Notizen ohne Datum aus dem Notizen-Tab (TE-148).
              TE-152: Abschnitt bleibt auch ohne Notizen sichtbar, Plus-Icon öffnet
              das Schnell-Anlegen-Modal statt des vollen Notizen-Tabs.
              TE-160: nur mit Wichtig-Label markierte Schnellnotizen erscheinen hier. */}
          {showBlock('quickNotes') && (
            <View
              style={[
                styles.quickOverviewSection,
                (showBlock('googleTasks') || showBlock('scratchpad')) && styles.quickOverviewDivider,
                { borderLeftColor: mono(C.notes) },
              ]}
            >
              <SectionLabel
                title="Notizen"
                onMore={() => router.push('/(tabs)/notes' as any)}
                onAdd={() => setQuickAddKind('notiz')}
                colors={colors}
              />
              <View>
                {importantQuickNotes.slice(0, 6).map((n) => (
                  <Pressable
                    key={n.id}
                    onPress={() => router.push('/(tabs)/notes' as any)}
                    style={({ pressed }) => [styles.dezentRow, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <View style={[styles.dezentBullet, { backgroundColor: C.important }]} />
                    <Text style={styles.dezentText} numberOfLines={1}>{n.text}</Text>
                  </Pressable>
                ))}
                {importantQuickNotes.length > 6 && (
                  <Text style={[styles.dezentMore, { color: colors.textMuted }]}>
                    +{importantQuickNotes.length - 6} weitere
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      )}

      {/* TE-152: Schnell-Anlegen-Modal für Personal Tasks & Notizen – ein Textfeld,
          Absenden legt den Eintrag direkt an (kein voller Formular-Umweg). */}
      <Modal
        visible={quickAddKind !== null}
        animationType="fade"
        transparent
        onRequestClose={() => { setQuickAddKind(null); setQuickAddText(''); }}
      >
        <View style={[styles.feedModalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => { setQuickAddKind(null); setQuickAddText(''); }}
          />
          <View style={[styles.quickAddCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.feedModalTitle, { color: colors.text }]}>
              {quickAddKind === 'personal' ? 'Neuer Personal Task' : 'Neue Notiz'}
            </Text>
            <TextInput
              value={quickAddText}
              onChangeText={setQuickAddText}
              placeholder="Text eingeben …"
              placeholderTextColor={colors.textMuted}
              style={[styles.quickAddInput, { color: colors.text, borderColor: colors.border }]}
              autoFocus
              onSubmitEditing={handleQuickAddSubmit}
              returnKeyType="done"
            />
            <Pressable
              onPress={handleQuickAddSubmit}
              style={({ pressed }) => [styles.quickAddSaveBtn, { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={styles.quickAddSaveText}>Speichern</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
          <View style={styles.card}>
            {openAllowanceChildren.map((child, i) => {
              const m = allowanceByChild[child.id]?.[currentAllowanceMonth];
              const corrected = m?.overrideAmount != null;
              const amount = effectiveAllowance(child.allowance ?? 0, m);
              return (
                <Pressable
                  key={child.id}
                  onPress={() => openAllowanceEdit(child.id)}
                  style={[styles.kidRow, i < openAllowanceChildren.length - 1 && styles.rowDivider]}
                >
                  <View style={[styles.kidAvatar, { backgroundColor: childColor(child.id) }]}>
                    <Text style={styles.kidAvatarText}>
                      {childEmoji(child.id) ?? childName(child.id).charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.kidTaskText, { color: colors.text }]} numberOfLines={1}>
                      {childName(child.id)}
                    </Text>
                    {corrected && (
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }} numberOfLines={1}>
                        angepasst{m?.overrideReason ? ` · ${m.overrideReason}` : ''}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.dueBadge, styles.dueBadgeOverdue]}>
                    {formatEuro(amount)}
                  </Text>
                  <Ionicons name="pencil" size={13} color={colors.textMuted} style={{ marginLeft: 6 }} />
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Taschengeld-Korrektur (TE-154): Betrag nur für diesen Monat anpassen ── */}
      <Modal visible={allowanceEdit !== null} transparent animationType="fade">
        <Pressable style={styles.allowanceEditOverlay} onPress={() => setAllowanceEdit(null)}>
          <Pressable style={[styles.allowanceEditBox, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={[styles.allowanceEditTitle, { color: colors.text }]}>
              Taschengeld anpassen
            </Text>
            <Text style={[styles.allowanceEditSub, { color: colors.textMuted }]}>
              {allowanceEdit ? `${childName(allowanceEdit.childId)} · ${formatMonthLabel(currentAllowanceMonth)}` : ''}
              {'  ·  '}gilt nur diesen Monat
            </Text>
            <View style={styles.allowanceEditRow}>
              <TextInput
                style={[styles.allowanceEditInput, { color: colors.text, borderColor: colors.border }]}
                value={allowanceEdit?.amount ?? ''}
                onChangeText={(v) => setAllowanceEdit((s) => (s ? { ...s, amount: v } : s))}
                keyboardType="decimal-pad"
                placeholder="Betrag"
                placeholderTextColor={colors.placeholder}
                autoFocus
              />
              <Text style={{ color: colors.text, fontWeight: '700' }}>€</Text>
            </View>
            <TextInput
              style={[styles.allowanceEditInput, { color: colors.text, borderColor: colors.border, marginTop: 8 }]}
              value={allowanceEdit?.reason ?? ''}
              onChangeText={(v) => setAllowanceEdit((s) => (s ? { ...s, reason: v } : s))}
              placeholder="Grund (optional, z.B. geborgt)"
              placeholderTextColor={colors.placeholder}
            />
            <View style={styles.allowanceEditActions}>
              <Pressable onPress={() => setAllowanceEdit(null)} hitSlop={8}>
                <Text style={{ color: colors.textMuted, fontWeight: '700' }}>Abbrechen</Text>
              </Pressable>
              <Pressable onPress={saveAllowanceEdit} hitSlop={8} style={[styles.allowanceEditSave, { backgroundColor: colors.accentNeon }]}>
                <Text style={{ color: readableTextOn(colors.accentNeon), fontWeight: '800' }}>Speichern</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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

      {/* ── Links, Geistesblitze, Countdowns (TE-161) ──
          Ganz unten, über die volle Breite – größere, besser lesbare und
          tapbare Kacheln als in der früheren schmalen rechten Spalte (TE-153,
          jetzt entfallen). Bricht bei vielen Einträgen einfach in weitere
          Zeilen um, statt zu scrollen oder abzuschneiden. */}
      <View style={styles.bottomWideSection}>
        {showBlock('links') && <LinkCardBar colors={colors} />}
        {showBlock('geistesblitze') && (
          <GeistesKacheln colors={colors} isDark={isDark} areaWidth={effW} columns={wideCols} compact />
        )}
        {showBlock('countdowns') && (
          <CountdownStrip colors={colors} compact />
        )}
      </View>

    </ScrollView>

      {/* TE-153: Fokus-Kachel fixiert rechts-mittig am Viewport – klebt beim
          Scrollen, weil sie außerhalb der ScrollView liegt. box-none lässt
          Klicks überall durch, nur die Kachel selbst ist antippbar. */}
      <View style={styles.focusFab} pointerEvents="box-none">
        <FussballKachel iconSize={16} iconStyle={styles.focusFabTile} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors, isDark: boolean, calm: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    container: { flex: 1, backgroundColor: c.background },
    content: { paddingTop: 16, paddingBottom: 48, gap: 24 },

    // TE-153: Fokus-Kachel als fixierter Button, rechts mittig am Viewport.
    // Der volle-Höhe-Streifen zentriert die Kachel vertikal; pointerEvents wird
    // im JSX auf "box-none" gesetzt, damit nur die Kachel Klicks abfängt.
    focusFab: { position: 'absolute', right: 6, top: 0, bottom: 0, justifyContent: 'center', zIndex: 20 },
    focusFabTile: {
      width: 34,
      height: 34,
      borderRadius: 10,
      ...(isDark ? neonGlow(c.accentNeon, 'soft') : {}),
    },

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

    // TE-152: Schnell-Anlegen-Modal (Personal Tasks / Notizen).
    quickAddCard: {
      marginHorizontal: 24,
      borderRadius: 16,
      padding: 20,
      gap: 12,
    },
    quickAddInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    quickAddSaveBtn: {
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
    },
    quickAddSaveText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },

    section: {},

    // TE-164: gemeinsamer Rahmen für die Kurzübersicht (Google Tasks/Personal
    // Tasks/Notizen) – analog zu kidsSectionCard, damit die drei Kategorien als
    // ein zusammengehöriger Block erkennbar sind. Die einzelnen Abschnitte
    // bekommen darin je eine farbige linke Akzentleiste (quickOverviewSection)
    // zur Unterscheidung, getrennt durch einen dezenten Strich (quickOverviewDivider).
    quickOverviewCard: {
      marginHorizontal: 16,
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    quickOverviewSection: {
      paddingVertical: 10,
      borderLeftWidth: 3,
    },
    quickOverviewDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
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

    // Kurzübersicht (TE-150): extrem dezente Textzeile – kein Karten-Hintergrund,
    // kein Rahmen, kein Glow. Nur ein kleiner Punkt + gedämpfter Text (+ Fälligkeit).
    dezentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 5,
    },
    dezentBullet: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: c.textMuted,
    },
    dezentText: { flex: 1, fontSize: 13, color: c.textSecondary },
    dezentMore: { fontSize: 12, paddingHorizontal: 16, paddingTop: 2 },

    // TE-153: Zwei-Spalten-Layout auf dem Dashboard. Auf breiten Screens stehen
    // linke Spalte (Kurzübersicht) und rechte Spalte (Links/Geistesblitze/
    // Countdowns) nebeneinander; auf schmalen Screens bricht die rechte Spalte
    // per flexWrap unter die linke um.
    // TE-153: strikte Zeile ohne Umbruch – linke Spalte nimmt den Rest, rechte
    // Spalte hat eine feste (aus der Container-Breite abgeleitete) Breite. So
    // stehen die beiden Spalten immer nebeneinander, egal wie schmal das Panel ist.
    // TE-161: voller-Breite-Block ganz unten für Links/Geistesblitze/Countdowns.
    bottomWideSection: { gap: 20 },

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
    // Taschengeld-Korrektur-Modal (TE-154)
    allowanceEditOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    allowanceEditBox: {
      width: '100%', maxWidth: 340, borderRadius: 16, padding: 20,
      borderWidth: 1, borderColor: c.border,
    },
    allowanceEditTitle: { fontSize: 17, fontWeight: '800' },
    allowanceEditSub: { fontSize: 12, marginTop: 2, marginBottom: 14 },
    allowanceEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    allowanceEditInput: {
      flex: 1, borderWidth: 1, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 9, fontSize: 15,
    },
    allowanceEditActions: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
      gap: 18, marginTop: 18,
    },
    allowanceEditSave: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 },
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
