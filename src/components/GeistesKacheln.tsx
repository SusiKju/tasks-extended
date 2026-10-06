/**
 * GeistesKacheln.tsx
 *
 * Persönliche Gedanken-Kacheln auf dem Dashboard.
 * Design: kompakte Kachel mit Emoji, Kurz-Label und Reifegrad-Punkten
 * (Funke → Gedanke → Plan → Aufgabe). Antippen öffnet das Sheet: dort wird
 * der nächste konkrete Schritt als Personal Task angelegt.
 * Symbol: Emoji, automatisch aus Label/Text vorgeschlagen (utils/emojiSuggest);
 * Altbestand mit Ionicons-Namen wird weiter als Icon gezeigt.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors, SOFT_BORDER } from '../utils/theme';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useFamily } from '../hooks/useFamily';
import { useStore } from '../store';
import {
  GeistesKachel,
  GeistesStage,
  GEISTES_STAGES,
  subscribeToGeistesKacheln,
  addGeistesKachel,
  updateGeistesKachel,
  deleteGeistesKachel,
} from '../services/geistesKacheln';
import { loadScratchpad, saveScratchpad } from '../services/scratchpadService';
import {
  ScratchEntry,
  makeNoteId,
  parseScratchpad,
  parseScratchHistory,
  serializeScratchpad,
} from './Scratchpad';
import { suggestEmojis, isIoniconName } from '../utils/emojiSuggest';

// ─── Typen ────────────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/** Status des aus dem Geistesblitz angelegten Personal Tasks. */
type LinkedTask = { text: string; done: boolean } | null;

// ─── Symbol ───────────────────────────────────────────────────────────────────

const DEFAULT_EMOJI = '💡';

/** Auswahl, wenn Label/Text (noch) nichts treffen. */
const QUICK_EMOJIS = ['💡', '⭐', '❤️', '🎯', '🛒', '✈️', '🎁', '🏠', '📚', '💰', '🏃', '🎵', '📷', '🍽️', '🌱', '🚗'];

function autoEmoji(label: string, text: string): string {
  return suggestEmojis(label, text, 1)[0] ?? DEFAULT_EMOJI;
}

function KachelSymbol({ value, size, color }: { value: string; size: number; color: string }) {
  if (isIoniconName(value)) return <Ionicons name={value as IoniconName} size={size} color={color} />;
  return <Text style={{ fontSize: Math.round(size * 0.9), lineHeight: Math.round(size * 1.15) }}>{value}</Text>;
}

// ─── Farb-Palette ─────────────────────────────────────────────────────────────

const COLORS = [
  '#6C63FF', '#FF6B9D', '#4ECDC4', '#45B7D1',
  '#FF7675', '#A29BFE', '#00B894', '#FD79A8',
  '#55EFC4', '#FDCB6E', '#E17055', '#0984E3',
];

function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// ─── Reifegrad ────────────────────────────────────────────────────────────────

const STALE_DAYS = 7;

function stageIndex(stage: GeistesStage | undefined): number {
  return GEISTES_STAGES.findIndex((st) => st.key === (stage ?? 'funke'));
}

/** Braucht der Geistesblitz Aufmerksamkeit? Liegt lange ohne Aufgabe, oder die Aufgabe ist erledigt. */
function needsStep(k: GeistesKachel, linked: LinkedTask): boolean {
  if (k.stage === 'aufgabe') return !!linked?.done;
  return Date.now() - new Date(k.createdAt).getTime() > STALE_DAYS * 86400000;
}

function StageDots({ stage, color, size = 5 }: { stage: GeistesStage | undefined; color: string; size?: number }) {
  const idx = stageIndex(stage);
  return (
    <View style={s.dots}>
      {GEISTES_STAGES.map((st, i) => (
        <View
          key={st.key}
          style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: i <= idx ? color : '#FFFFFF26' }}
        />
      ))}
    </View>
  );
}

// ─── Fälligkeit ───────────────────────────────────────────────────────────────

type DueKey = 'heute' | 'morgen' | 'wochenende' | null;
const DUE_OPTIONS: { key: DueKey; label: string }[] = [
  { key: null, label: 'Ohne Datum' },
  { key: 'heute', label: 'Heute' },
  { key: 'morgen', label: 'Morgen' },
  { key: 'wochenende', label: 'Wochenende' },
];

/** Lokaler Mittag als ISO-String – gleiche Konvention wie die Personal Tasks (TE-141). */
function dueISO(key: DueKey): string | null {
  if (!key) return null;
  const d = new Date();
  let add = 0;
  if (key === 'morgen') add = 1;
  // Wochenende: kommender Samstag; Sa/So → heute.
  if (key === 'wochenende') add = d.getDay() === 0 ? 0 : 6 - d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + add, 12, 0, 0).toISOString();
}

// ─── Modal ────────────────────────────────────────────────────────────────────

const LABEL_MAX_LENGTH = 16;

interface ModalProps {
  visible: boolean;
  editing: GeistesKachel | null;
  linkedTask: LinkedTask;
  onSave: (text: string, icon: string, color: string, label: string, stage: GeistesStage) => Promise<void>;
  onCreateTask: (step: string, dueDate: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  colors: ThemeColors;
}

function KachelModal({ visible, editing, linkedTask, onSave, onCreateTask, onDelete, onClose, colors }: ModalProps) {
  const [text, setText] = useState('');
  const [icon, setIcon] = useState(DEFAULT_EMOJI);
  const [color, setColor] = useState(COLORS[0]);
  const [label, setLabel] = useState('');
  const [stage, setStage] = useState<GeistesStage>('funke');
  const [step, setStep] = useState('');
  const [due, setDue] = useState<DueKey>(null);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [iconLocked, setIconLocked] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText(editing?.text ?? '');
      setIcon(editing?.emoji ?? DEFAULT_EMOJI);
      setColor(editing?.color ?? randomColor());
      setLabel(editing?.label ?? '');
      setStage(editing?.stage ?? 'funke');
      setStep('');
      setDue(null);
      setEmojiQuery('');
      setIconLocked(!!editing?.emoji);
      if (!editing) setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [visible, editing]);

  // Auto-Emoji, solange der User keins selbst gewählt hat.
  useEffect(() => {
    if (!iconLocked && (text || label)) setIcon(autoEmoji(label, text));
  }, [text, label, iconLocked]);

  const emojiChoices = useMemo(() => {
    const found = emojiQuery.trim()
      ? suggestEmojis(emojiQuery, '', 16)
      : suggestEmojis(label, text, 12);
    const list = found.length ? found : QUICK_EMOJIS;
    // Aktuelle Wahl immer sichtbar halten (auch Altbestand-Icon).
    return list.includes(icon) ? list : [icon, ...list];
  }, [emojiQuery, label, text, icon]);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try { await onSave(text, icon, color, label, stage); onClose(); }
    finally { setSaving(false); }
  };

  const handleCreateTask = async () => {
    if (!text.trim() || !step.trim()) return;
    setSaving(true);
    try {
      await onSave(text, icon, color, label, stage);
      await onCreateTask(step, dueISO(due));
      onClose();
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(); onClose(); }
    finally { setDeleting(false); }
  };

  const taskOpen = stage === 'aufgabe' && linkedTask && !linkedTask.done;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ScrollView
          style={[s.sheet, { backgroundColor: colors.surface, borderTopColor: color }]}
          contentContainerStyle={s.sheetContent}
          keyboardShouldPersistTaps="handled"
        >

          {/* Vorschau-Symbol */}
          <View style={[s.previewIcon, { borderColor: color }]}>
            <KachelSymbol value={icon} size={34} color={color} />
          </View>

          {/* Texteingabe */}
          <TextInput
            ref={inputRef}
            style={[s.textInput, { color: colors.text, borderColor: color + '50' }]}
            value={text}
            onChangeText={setText}
            placeholder="Dein Gedanke, deine Idee…"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Gedanke"
          />

          {/* Kurz-Label für die Kachel – bewusst getrennt vom freien Gedanken-Text
              oben, den der User explizit vergibt, damit er kurz bleibt. */}
          <Text style={[s.pickerLabel, { color: colors.textMuted }]}>Label auf der Kachel (optional)</Text>
          <TextInput
            style={[s.labelInput, { color: colors.text, borderColor: color + '50' }]}
            value={label}
            onChangeText={setLabel}
            placeholder="z. B. Fotowand"
            placeholderTextColor={colors.textMuted}
            maxLength={LABEL_MAX_LENGTH}
            accessibilityLabel="Label auf der Kachel"
          />

          {/* Reifegrad + nächster Schritt – erst für gespeicherte Geistesblitze. */}
          {editing && (
            <>
              <Text style={[s.pickerLabel, { color: colors.textMuted }]}>Reifegrad</Text>
              <View style={s.stageRow}>
                {GEISTES_STAGES.map((st, i) => {
                  const reached = i <= stageIndex(stage);
                  const isAufgabe = st.key === 'aufgabe';
                  return (
                    <Pressable
                      key={st.key}
                      style={s.stageItem}
                      onPress={() => { if (!isAufgabe) setStage(st.key); }}
                      disabled={isAufgabe}
                      accessibilityRole="button"
                      accessibilityState={{ selected: stage === st.key }}
                    >
                      <View style={[s.stageBar, { backgroundColor: reached ? color : '#FFFFFF1F' }]} />
                      <Text style={[s.stageText, { color: stage === st.key ? colors.text : colors.textMuted, fontWeight: stage === st.key ? '700' : '500' }]}>
                        {st.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {taskOpen ? (
                <View style={[s.taskBox, { borderColor: color + '60' }]}>
                  <Text style={[s.taskBoxLabel, { color }]}>AUFGABE LÄUFT</Text>
                  <Text style={[s.taskBoxText, { color: colors.text }]}>{linkedTask!.text}</Text>
                  <Text style={[s.hint, { color: colors.textMuted }]}>In Personal Tasks. Ist sie erledigt, fragt der Geistesblitz nach dem nächsten Schritt.</Text>
                </View>
              ) : (
                <>
                  {stage === 'aufgabe' && linkedTask?.done && (
                    <Text style={[s.doneNote, { color: colors.textSecondary }]}>✓ „{linkedTask.text}“ ist erledigt.</Text>
                  )}
                  <Text style={[s.pickerLabel, { color: colors.textMuted }]}>Nächster konkreter Schritt</Text>
                  <TextInput
                    style={[s.labelInput, { color: colors.text, borderColor: step.trim() ? color : color + '50' }]}
                    value={step}
                    onChangeText={setStep}
                    placeholder="z. B. Wand ausmessen"
                    placeholderTextColor={colors.textMuted}
                    accessibilityLabel="Nächster konkreter Schritt"
                  />
                  <View style={s.chipRow}>
                    {DUE_OPTIONS.map((o) => {
                      const active = due === o.key;
                      return (
                        <Pressable
                          key={o.label}
                          style={[s.chip, { borderColor: active ? color : SOFT_BORDER }]}
                          onPress={() => setDue(o.key)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={[s.chipText, { color: active ? color : colors.textSecondary }]}>{o.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    style={[s.taskBtn, { backgroundColor: color, opacity: step.trim() && text.trim() ? 1 : 0.4 }]}
                    onPress={handleCreateTask}
                    disabled={saving || !step.trim() || !text.trim()}
                  >
                    <Text style={s.saveBtnText}>Als Aufgabe anlegen</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </Pressable>
                </>
              )}
            </>
          )}

          {/* Emoji-Auswahl: Vorschläge aus Label/Text, oder per Suche */}
          <Text style={[s.pickerLabel, { color: colors.textMuted }]}>Symbol</Text>
          <TextInput
            style={[s.searchInput, { color: colors.text, borderColor: SOFT_BORDER }]}
            value={emojiQuery}
            onChangeText={setEmojiQuery}
            placeholder="Emoji suchen, z. B. Zug, Garten, Geschenk"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Emoji suchen"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.iconRow} keyboardShouldPersistTaps="handled">
            {emojiChoices.map((em) => (
              <Pressable
                key={em}
                style={[s.iconBtn, icon === em && { borderColor: color, backgroundColor: color + '33' }]}
                onPress={() => { setIcon(em); setIconLocked(true); }}
                accessibilityLabel={`Symbol ${em}`}
              >
                <KachelSymbol value={em} size={22} color={colors.textSecondary} />
              </Pressable>
            ))}
          </ScrollView>

          {/* Farb-Auswahl */}
          <Text style={[s.pickerLabel, { color: colors.textMuted }]}>Farbe</Text>
          <View style={s.colorRow}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                style={[s.colorDot, { backgroundColor: c }, color === c && s.colorDotActive]}
                onPress={() => setColor(c)}
                accessibilityLabel={`Farbe ${c}`}
              />
            ))}
          </View>

          {/* Aktionen */}
          <View style={s.actions}>
            {editing && (
              <Pressable style={[s.btn, s.deleteBtn]} onPress={handleDelete} disabled={deleting} accessibilityLabel="Geistesblitz löschen">
                {deleting
                  ? <ActivityIndicator size="small" color="#FF3B30" />
                  : <Ionicons name="trash-outline" size={18} color="#FF3B30" />}
              </Pressable>
            )}
            <Pressable
              style={[s.btn, s.saveBtn, { borderWidth: 1, borderColor: color, opacity: text.trim() ? 1 : 0.4 }]}
              onPress={handleSave}
              disabled={saving || !text.trim()}
            >
              {saving
                ? <ActivityIndicator size="small" color={color} />
                : <Text style={[s.saveBtnText, { color: colors.text }]}>{editing ? 'Speichern' : 'Hinzufügen'}</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Kachel ───────────────────────────────────────────────────────────────────

// Redesign: Im kompakten Dashboard-Layout (einziger Einsatzort dieser
// Komponente) trägt nicht mehr die Kachel-Fläche die vom User gewählte
// Volltonfarbe, sondern nur noch Symbol + Reifegrad-Punkte – neutrale dunkle
// Fläche + dezenter Rahmen, exakt wie Countdown-Kacheln daneben. Braucht der
// Geistesblitz einen Schritt, wird der Rahmen gelb.
function KachelCard({ kachel, onPress, size, colors, compact, attention }: {
  kachel: GeistesKachel;
  onPress: () => void;
  size: number;
  colors: ThemeColors;
  compact?: boolean;
  attention: boolean;
}) {
  const symbol = kachel.emoji ?? autoEmoji(kachel.label ?? '', kachel.text);
  const label = kachel.label?.trim();
  return (
    <Pressable
      style={({ pressed }) => [
        s.card,
        compact
          ? { width: size, height: size, backgroundColor: colors.surface, borderWidth: 1, borderColor: attention ? colors.warning : SOFT_BORDER, opacity: pressed ? 0.8 : 1 }
          : { width: size, height: size, backgroundColor: kachel.color, opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={onPress}
      accessibilityLabel={`Geistesblitz ${label ?? kachel.text}`}
    >
      <KachelSymbol value={symbol} size={Math.round(size * (compact && label ? 0.3 : 0.38))} color={compact ? kachel.color : '#fff'} />
      {compact && label ? (
        <Text style={[s.cardLabel, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
      ) : null}
      <StageDots stage={kachel.stage} color={compact ? kachel.color : '#fff'} size={Math.max(3, Math.round(size / 16))} />
    </Pressable>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export function GeistesKacheln({ colors, isDark, areaWidth, columns, compact = false }: { colors: ThemeColors; isDark: boolean; areaWidth?: number; columns?: number; compact?: boolean }) {
  const { user } = useFirebaseAuth();
  const { familyId } = useFamily();
  const [tiles, setTiles] = useState<GeistesKachel[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<GeistesKachel | null>(null);
  const scratchpad = useStore((st) => st.scratchpad);
  const scratchpadHistory = useStore((st) => st.scratchpadHistory);

  const fid = familyId ?? '';
  const uid = user?.uid ?? '';

  useEffect(() => {
    if (!fid || !uid) return;
    return subscribeToGeistesKacheln(fid, uid, setTiles);
  }, [fid, uid]);

  // Verknüpfte Personal Tasks: offen im Notizblock, abgehakt (done) oder
  // gelöscht (liegt dann im Verlauf) = erledigt. Unbekannte Id → null.
  const linkedById = useMemo(() => {
    const map = new Map<string, LinkedTask>();
    for (const e of parseScratchpad(scratchpad)) if (e.id) map.set(e.id, { text: e.text, done: !!e.done });
    for (const h of parseScratchHistory(scratchpadHistory)) if (!map.has(h.id)) map.set(h.id, { text: h.text, done: true });
    return map;
  }, [scratchpad, scratchpadHistory]);
  const linkedFor = useCallback((k: GeistesKachel | null): LinkedTask => (k?.taskId ? linkedById.get(k.taskId) ?? null : null), [linkedById]);

  const attentionCount = tiles.filter((k) => needsStep(k, linkedFor(k))).length;

  const openNew    = useCallback(() => { setEditing(null); setModalVisible(true); }, []);
  const openEdit   = useCallback((k: GeistesKachel) => { setEditing(k); setModalVisible(true); }, []);

  const handleSave = useCallback(async (text: string, icon: string, color: string, label: string, stage: GeistesStage) => {
    if (!fid || !uid) return;
    const trimmedLabel = label.trim() || null;
    if (editing) await updateGeistesKachel(fid, uid, editing.id, { text, emoji: icon, color, label: trimmedLabel, stage });
    else         await addGeistesKachel(fid, uid, text, icon, color, trimmedLabel);
  }, [fid, uid, editing]);

  // Nächsten Schritt als Personal Task (Notizblock-Eintrag) ganz oben anlegen.
  // Frisch vom Server lesen: der lokale Store kann beim Kaltstart noch alt sein.
  const handleCreateTask = useCallback(async (step: string, dueDate: string | null) => {
    if (!fid || !uid || !editing) return;
    const id = makeNoteId();
    const prefix = editing.label?.trim();
    const entry: ScratchEntry = { id, text: prefix ? `${prefix}: ${step.trim()}` : step.trim(), color: editing.color, dueDate };
    const current = parseScratchpad(await loadScratchpad(fid, uid));
    // parseScratchpad liefert bei leerem Notizblock einen id-losen Platzhalter.
    const isPlaceholder = current.length === 1 && !current[0].id && !current[0].text.trim();
    const raw = serializeScratchpad([entry, ...(isPlaceholder ? [] : current)]);
    useStore.getState().setScratchpad(raw);
    await saveScratchpad(fid, uid, raw);
    await updateGeistesKachel(fid, uid, editing.id, { stage: 'aufgabe', taskId: id });
  }, [fid, uid, editing]);

  const handleDelete = useCallback(async () => {
    if (!fid || !uid || !editing) return;
    await deleteGeistesKachel(fid, uid, editing.id);
  }, [fid, uid, editing]);

  // TE-153: Kachelgröße aus der verfügbaren Fläche + Spaltenzahl ableiten, damit
  // die Kacheln auch in der schmalen Dashboard-Spalte passen. Ohne Props gilt der
  // bisherige Vollbild-Fall (8 Spalten über die Fensterbreite).
  const cols = columns ?? 8;
  const aw = areaWidth ?? Dimensions.get('window').width;
  const tileSize = Math.floor((aw - 32 - (cols - 1) * 6) / cols);

  return (
    <View style={s.section}>
      <View style={s.header}>
        <View style={s.headerTitleRow}>
          <Ionicons name="bulb-outline" size={13} color={colors.textMuted} />
          <Text style={[s.headerTitle, { color: colors.textSecondary }]}>GEISTESBLITZE</Text>
        </View>
        {attentionCount > 0 && (
          <Text style={[s.attention, { color: colors.warning }]}>
            {attentionCount === 1 ? '1 braucht einen Schritt' : `${attentionCount} brauchen einen Schritt`}
          </Text>
        )}
      </View>

      {tiles.length === 0 && compact ? (
        // Redesign: im kompakten Dashboard-Layout dieselbe Kachel-Reihen-Optik
        // wie bei den Countdowns – eine einzelne Add-Kachel statt der breiten
        // gestrichelten Box mit Fließtext (vorher inkonsistent zur
        // Countdown-Leiste direkt darunter).
        <View style={s.grid}>
          <Pressable
            style={({ pressed }) => [
              s.addCard,
              { width: tileSize, height: tileSize, borderColor: SOFT_BORDER, opacity: pressed ? 0.6 : 1 },
            ]}
            onPress={openNew}
            accessibilityLabel="Geistesblitz anlegen"
          >
            <Ionicons name="add" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : tiles.length === 0 ? (
        <Pressable
          style={({ pressed }) => [s.empty, { borderColor: SOFT_BORDER, opacity: pressed ? 0.7 : 1 }]}
          onPress={openNew}
        >
          <Ionicons name="bulb-outline" size={20} color={colors.textMuted} />
          <Text style={[s.emptyText, { color: colors.textMuted }]}>Ersten Geistesblitz festhalten</Text>
        </Pressable>
      ) : (
        <View style={s.grid}>
          {tiles.map((k) => (
            <KachelCard
              key={k.id}
              kachel={k}
              onPress={() => openEdit(k)}
              size={tileSize}
              colors={colors}
              compact={compact}
              attention={needsStep(k, linkedFor(k))}
            />
          ))}
          <Pressable
            style={({ pressed }) => [
              s.addCard,
              { width: tileSize, height: tileSize, borderColor: SOFT_BORDER, opacity: pressed ? 0.6 : 1 },
            ]}
            onPress={openNew}
            accessibilityLabel="Geistesblitz anlegen"
          >
            <Ionicons name="add" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      <KachelModal
        visible={modalVisible}
        editing={editing}
        linkedTask={linkedFor(editing)}
        onSave={handleSave}
        onCreateTask={handleCreateTask}
        onDelete={handleDelete}
        onClose={() => setModalVisible(false)}
        colors={colors}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  section: { paddingHorizontal: 16, gap: 10 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  attention: { fontSize: 11, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  // Redesign: Radius an die Countdown-/Artefakt-Mini-Kachel angeglichen
  // (14 statt 10) – wirkten nebeneinander sonst unterschiedlich rund.
  card: { borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, gap: 2 },
  cardLabel: { fontSize: 8.5, fontWeight: '600', textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 2, marginTop: 1 },
  addCard: { borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 3 },

  empty: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, padding: 16 },
  emptyText: { fontSize: 13 },

  // Modal
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' },
  sheet: {
    flexGrow: 0,
    maxHeight: '90%',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 3,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    gap: 12,
    paddingTop: 20,
  },

  previewIcon: {
    alignSelf: 'center',
    width: 64, height: 64,
    borderRadius: 16, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },

  textInput: {
    borderWidth: 1.5, borderRadius: 10, padding: 12,
    fontSize: 14, minHeight: 90, maxHeight: 200, lineHeight: 20,
  },

  labelInput: {
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14,
  },
  searchInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13,
  },

  pickerLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },

  stageRow: { flexDirection: 'row', gap: 6 },
  stageItem: { flex: 1, gap: 6, alignItems: 'center', paddingVertical: 4 },
  stageBar: { height: 4, borderRadius: 2, alignSelf: 'stretch' },
  stageText: { fontSize: 12 },

  taskBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  taskBoxLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },
  taskBoxText: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 17 },
  doneNote: { fontSize: 13 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '600' },
  taskBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13 },

  iconRow: { gap: 8, paddingVertical: 2 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#FFFFFF15',
    backgroundColor: '#FFFFFF08',
  },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: { width: 24, height: 24, borderRadius: 12 },
  colorDotActive: { borderWidth: 3, borderColor: '#FFFFFF', transform: [{ scale: 1.2 }] },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  btn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { borderWidth: 1, borderColor: '#FF3B3040' },
  saveBtn: { minWidth: 120 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
