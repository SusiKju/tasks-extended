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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { useTheme, ThemeColors, readableTextOn, neonGlow } from '../utils/theme';
import { subscribeToScratchpad, saveScratchpad } from '../services/scratchpadService';
import { useGoogleDriveNotesSync } from '../hooks/useGoogleDriveNotesSync';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useGoogleTasksSync } from '../hooks/useGoogleTasksSync';
import { useGoogleContactsBirthdaysSync } from '../hooks/useGoogleContactsBirthdaysSync';
import { isOverdue } from '../utils/dateFormat';
import { fetchRecentMails, MailMessage } from '../services/googleMail';
import { listUpcomingEvents, CalendarEvent } from '../services/googleCalendar';
import {
  ChildTask, subscribeToChildTasks,
} from '../services/kinderTasks';
import { useFamily } from '../hooks/useFamily';
import { SharedNotepad } from '../components/SharedNotepad';
import { WeatherWidget } from '../components/WeatherWidget';
import { GoogleConnectBanner } from '../components/GoogleConnectBanner';
import { CountdownStrip } from '../components/CountdownStrip';
import { Task } from '../types';

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
  scale = 'lg',
  blink = false,
}: {
  task: Task;
  onPress: () => void;
  scale?: 'lg' | 'md' | 'sm';
  blink?: boolean;
}) {
  const { isDark, isMono } = useTheme();
  const label = chipDueLabel(task);
  const isImportant = task.important;

  // Blink-Animation: nur wenn die Task heute fällig UND wichtig ist (siehe Aufruf).
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

  // Farbe rein nach Priorität: wichtige Tasks rot, normale blau.
  // Dark-Themes: Tasks-Tab-Stil – keine Füllung, nur Rahmen + Schrift in der
  // Chip-Farbe (+ Glow). Light: solide Füllung mit lesbarem Text wie bisher.
  // Schwarz-Weiß-Theme: alles monochrom (weiß) – einzige Ausnahme bleibt Rot
  // für wichtige Tasks, die heute fällig sind (= blink).
  const chipColor   = isMono
    ? (blink ? C.important : '#FFFFFF')
    : (isImportant ? C.important : C.tasks);
  const borderColor = chipColor;
  const bgColor     = isDark ? chipColor + '18' : chipColor;
  const textColor   = isMono && (blink || isImportant)
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
    <Animated.View style={{ opacity: blinkAnim, maxWidth: '100%' }}>
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

/**
 * Stabiler, pseudo-zufälliger Punkt-Farbton pro Eintrags-Position für das
 * Mono-Theme (TE-87). Deterministisch über die Position → flackert nicht beim
 * Tippen und braucht keine persistierte Farbe, sieht aber zufällig gestreut aus.
 */
function monoDotColor(idx: number): string {
  const h = ((idx + 1) * 2654435761) >>> 0; // Knuth-Multiplikativ-Hash
  return BUBBLE_PALETTE_NEON[h % BUBBLE_PALETTE_NEON.length];
}

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
  // Erkennt beide monochromen Themes (dunkles Schwarz-Weiß UND sein helles
  // Negativ) – unabhängig von isDark, denn das Negativ-Theme ist hell.
  const isMono = colors.accentNeon === '#FFFFFF' || colors.accentNeon === '#000000';
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
        // Neon-Theme: Tasks-Tab-Stil – keine Füllung, Rahmen + Schrift in der
        // Bubble-Farbe + Glow. Bessere Lesbarkeit, einheitlicher Look.
        // Sonst (dark-soft/neutral): solide Bubble mit weißem Text. Im
        // monochromen Theme – egal ob dunkel oder als Negativ hell – kommt
        // stattdessen die Theme-Textfarbe zum Einsatz, sonst wäre der Text
        // im hellen Negativ-Theme weiß auf hell und unleserlich.
        const fg = isNeon ? entry.color : isMono ? colors.text : '#fff';
        return (
        <View key={idx} style={[
          padStyles.bubble,
          isNeon
            ? { backgroundColor: entry.color + '14', borderWidth: 1.5, borderColor: entry.color, ...neonGlow(entry.color, 'soft') }
            : isMono
            ? { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border }
            : { backgroundColor: entry.color },
        ]}>
          <View style={[padStyles.bullet, { backgroundColor: isMono ? monoDotColor(idx) : fg + '99' }]} />
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
          <Pressable
            onPress={() => removeEntry(idx)}
            hitSlop={8}
            style={[padStyles.deleteBtn, { backgroundColor: colors.danger + '22' }]}
          >
            <Ionicons name="close" size={16} color={colors.danger} />
          </Pressable>
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
    width: 12,
    height: 12,
    borderRadius: 999,
    flexShrink: 0,
  },
  bubbleInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    padding: 0,
  },
  deleteBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const router = useRouter();
  const { familyId, children: familyChildren } = useFamily();
  const fid = familyId ?? '';
  // Lookup-Helfer für dynamische Kinder-Daten
  const childName = (id: string) => familyChildren.find((c) => c.id === id)?.name ?? id;
  const childColor = (id: string) => familyChildren.find((c) => c.id === id)?.color ?? CHILD_COLOR_FALLBACK;
  const childEmoji = (id: string) => familyChildren.find((c) => c.id === id)?.emoji ?? null;
  const { tasks, settings, scratchpad, setScratchpad, birthdays: storeBirthdays } = useStore();
  const { colors, isDark, theme, mono, isMono } = useTheme();
  const { syncDriveNotes } = useGoogleDriveNotesSync();
  const { user } = useFirebaseAuth();
  const { syncTasks } = useGoogleTasksSync();
  const { syncBirthdays } = useGoogleContactsBirthdaysSync();

  // Firestore-Echtzeit-Abo für den persönlichen Scratchpad
  useEffect(() => {
    if (!fid || !user?.uid) return;
    const unsub = subscribeToScratchpad(fid, user.uid, (raw) => {
      setScratchpad(raw);
    });
    return unsub;
  }, [fid, user?.uid]);

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

  // Debounced Firestore-Save 1,5 s nach letzter Eingabe
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fidRef = useRef(fid);
  fidRef.current = fid;
  const uidRef = useRef(user?.uid);
  uidRef.current = user?.uid;
  const handleScratchpadChange = useCallback((text: string) => {
    setScratchpad(text);
    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    uploadTimer.current = setTimeout(() => {
      const currentFid = fidRef.current;
      const uid = uidRef.current;
      if (!currentFid || !uid) return;
      const { scratchpad: latest } = useStore.getState();
      saveScratchpad(currentFid, uid, latest).catch(() => {});
    }, 1500);
  }, [setScratchpad]);
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [mails, setMails] = useState<MailMessage[]>([]);
  const [mailLoading, setMailLoading] = useState(false);
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [calLoading, setCalLoading] = useState(false);

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
  const richBirthday = theme === 'dark-neon' || theme === 'dark-mono' || theme === 'light-mono';
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
    if (!hasHighlight) { flameAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flameAnim, { toValue: 1, duration: 1600, useNativeDriver: false }),
        Animated.timing(flameAnim, { toValue: 0, duration: 1600, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => { loop.stop(); flameAnim.setValue(0); };
  }, [hasHighlight, flameAnim]);

  // Synchron zum Glow „atmende" Skalierung – gemeinsam für beide Card-Varianten.
  const flameScale = flameAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.05, 1] });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >

      {/* ── Geburtstage: ganz oben ── */}
      {todayBirthdays.length > 0 && (
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
              {
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

      {/* ── Wettervorhersage (TE-126, links) + Sync-Button (rechts) ── */}
      <View style={styles.syncRow}>
        <WeatherWidget colors={colors} />
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
            title="Heutige Tasks"
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
                    {!isToday && (
                      <Text style={[styles.dayLabel, { color: labelColor }]}>
                        {group.label}
                      </Text>
                    )}
                    <View style={styles.chipWrap}>
                      {group.tasks.map((task) => (
                        <TaskChip
                          key={task.id}
                          task={task}
                          scale={chipScale}
                          blink={isToday && !!task.important}
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

      {/* ── Countdowns (TE-128): filigrane, motivierende Karten oberhalb der Termine ── */}
      <CountdownStrip colors={colors} />

      {/* ── Kalender ── */}
      {settings.googleCalendarEnabled && (
        <View style={styles.section}>
          <SectionLabel title="Heutige Termine" colors={colors} />
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
                  {/* Titel */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        prominent ? styles.calTitleLg : styles.calTitleSm,
                        { color: eventTextColor }
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
                          {
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
      <SharedNotepad colors={colors} isDark={isDark} />

      {/* ── Aufgaben der Kinder (TE-110/TE-115) ── */}
      {(childrenWithTasks.length > 0 || groupTasks.length > 0) && (
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
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginBottom: -8,
    },
    syncBtn: {
      padding: 4,
      borderRadius: 16,
      ...(isDark ? neonGlow(c.accentNeon, 'soft') : {}),
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
      // Leuchtende Oberfläche wie im Tasks-Tab: dezenter Neon-Rand + soft Glow.
      borderColor: isDark ? c.accentNeon + '40' : c.border,
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
      borderLeftWidth: 0,
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
    kidCard: { marginHorizontal: 0, borderLeftWidth: 0 },
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
