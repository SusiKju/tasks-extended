/**
 * GeistesKacheln.tsx
 *
 * Persönliche Gedanken-Kacheln auf dem Dashboard.
 * Design: kompakte Kachel mit Icon, Kurz-Label und Reifegrad-Punkten
 * (Funke → Gedanke → Plan → Aufgabe). Antippen öffnet das Sheet: dort wird
 * der nächste konkrete Schritt als Personal Task angelegt.
 * Symbol: MaterialCommunityIcons, immer automatisch aus Label/Text gewählt
 * (utils/iconSuggest) – keine manuelle Symbol- oder Farbwahl. Farbe ergibt
 * sich aus der Kategorie des Icons (iconColor). Weiter gereifte Geistesblitze
 * stehen vorn und sind ab „Plan“ größer.
 * URLs im Text werden als kompakte Link-Chips (Favicon + Domain) geführt.
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
import { ScratchEntry, makeNoteId, parseScratchpad, serializeScratchpad } from './Scratchpad';
import { LinkChip } from './LinkChip';
import { DatePickerModal } from './DatePickerModal';
import { addCountdown } from '../services/countdownsService';
import { DEFAULT_DASHBOARD_BLOCKS } from '../types';
import { autoIcon, iconColor } from '../utils/iconSuggest';

// ─── Typen ────────────────────────────────────────────────────────────────────


// ─── Symbol ───────────────────────────────────────────────────────────────────

type McIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Symbol immer aus Label/Text – ein gespeichertes `emoji` (Altbestand) wird ignoriert. */
function symbolFor(k: GeistesKachel): string {
  return autoIcon(k.label ?? '', k.text);
}

function colorFor(icon: string, label: string, text: string): string {
  return iconColor(icon, label.trim() || text);
}

function KachelSymbol({ value, size, color }: { value: string; size: number; color: string }) {
  return <MaterialCommunityIcons name={value as McIconName} size={size} color={color} />;
}

// ─── Links ────────────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** URLs aus dem Text ziehen; übrig bleibt der Text ohne URLs (Leerzeilen zusammengefasst). */
function extractLinks(text: string): { text: string; links: string[] } {
  const links = (text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?)\]]+$/, ''));
  if (links.length === 0) return { text, links };
  const rest = text.replace(URL_RE, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: rest, links };
}

// ─── Reifegrad ────────────────────────────────────────────────────────────────

const STALE_DAYS = 7;

function stageIndex(stage: GeistesStage | undefined): number {
  return GEISTES_STAGES.findIndex((st) => st.key === (stage ?? 'funke'));
}

/** Braucht der Geistesblitz Aufmerksamkeit? Liegt länger als STALE_DAYS, ohne zur Aufgabe geworden zu sein. */
function needsStep(k: GeistesKachel): boolean {
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

const snapshot = (text: string, links: string[], label: string, stage: GeistesStage, icon: string | null) =>
  JSON.stringify([text.trim(), [...links].sort(), label.trim(), stage, icon]);

interface ModalProps {
  visible: boolean;
  editing: GeistesKachel | null;
  onSave: (text: string, icon: string, color: string, label: string, stage: GeistesStage, links: string[]) => Promise<void>;
  onCreateTask: (step: string, dueDate: string | null, text: string, links: string[]) => Promise<void>;
  onCreateCountdown: (date: Date, c: { title: string; text: string; links: string[]; icon: string; color: string }) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  colors: ThemeColors;
}

function KachelModal({ visible, editing, onSave, onCreateTask, onCreateCountdown, onDelete, onClose, colors }: ModalProps) {
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [textHeight, setTextHeight] = useState(0);
  const [stage, setStage] = useState<GeistesStage>('funke');
  const [step, setStep] = useState('');
  const [due, setDue] = useState<DueKey>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const initial = useRef('');

  useEffect(() => {
    if (visible) {
      // Altbestand: URLs, die noch im Text stehen, gleich in Chips überführen.
      const parsed = extractLinks(editing?.text ?? '');
      setText(parsed.text);
      setLinks([...new Set([...(editing?.links ?? []), ...parsed.links])]);
      setTextHeight(0);
      setLabel(editing?.label ?? '');
      setStage(editing?.stage ?? 'funke');
      setStep('');
      setDue(null);
      initial.current = snapshot(parsed.text, [...new Set([...(editing?.links ?? []), ...parsed.links])], editing?.label ?? '', editing?.stage ?? 'funke', null);
      if (!editing) setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [visible, editing]);

  // Symbol folgt live dem Inhalt; keine manuelle Wahl.
  const icon = useMemo(() => autoIcon(label, text), [label, text]);
  const color = colorFor(icon, label, text);

  // Eingefügte URLs sofort zu Chips machen. Beim Tippen erst beim Verlassen des
  // Feldes, sonst würde eine halb getippte Adresse abgeschnitten.
  const takeLinks = (value: string) => {
    const parsed = extractLinks(value);
    if (parsed.links.length) setLinks((prev) => [...new Set([...prev, ...parsed.links])]);
    setText(parsed.text);
  };
  const handleTextChange = (value: string) => {
    if (value.length - text.length > 8) takeLinks(value);
    else setText(value);
  };

  /** Text + Links final, falls noch eine getippte URL im Text steht. */
  const finalParts = () => {
    const parsed = extractLinks(text);
    return { text: parsed.text, links: [...new Set([...links, ...parsed.links])] };
  };
  const hasContent = !!text.trim() || links.length > 0;

  const handleSave = async () => {
    if (!hasContent) return;
    setSaving(true);
    try {
      const f = finalParts();
      await onSave(f.text, icon, color, label, stage, f.links);
      onClose();
    }
    finally { setSaving(false); }
  };

  // Tippen daneben / Zurück übernimmt Änderungen statt sie zu verwerfen (TE-13).
  const dirty = () => {
    const f = finalParts();
    return snapshot(f.text, f.links, label, stage, null) !== initial.current;
  };
  const dismiss = () => {
    if (saving || deleting) return;
    if (hasContent && dirty()) handleSave();
    else onClose();
  };

  const handleCreateTask = async () => {
    if (!hasContent || !step.trim()) return;
    setSaving(true);
    try {
      // Alles wandert in die Aufgabe, der Geistesblitz wird danach gelöscht.
      const f = finalParts();
      await onCreateTask(step, dueISO(due), f.text, f.links);
      onClose();
    } finally { setSaving(false); }
  };

  // TE-20: Geistesblitz → Countdown. Text, Links, Icon und Farbe wandern mit,
  // der Geistesblitz wird danach gelöscht.
  const handleCreateCountdown = async (date: Date) => {
    setDatePickerVisible(false);
    if (!hasContent) return;
    setSaving(true);
    try {
      const f = finalParts();
      const title = label.trim() || f.text.split('\n')[0].slice(0, 30).trim() || 'Countdown';
      await onCreateCountdown(date, { title, text: f.text, links: f.links, icon, color });
      onClose();
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(); onClose(); }
    finally { setDeleting(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <ScrollView
          style={[s.sheet, { backgroundColor: colors.surface, borderTopColor: color }]}
          contentContainerStyle={s.sheetContent}
          keyboardShouldPersistTaps="handled"
        >

          {/* Vorschau-Symbol */}
          <View style={[s.previewIcon, { borderColor: color, backgroundColor: color + '22' }]}>
            <KachelSymbol value={icon} size={24} color={color} />
          </View>

          {/* Texteingabe */}
          <TextInput
            ref={inputRef}
            style={[s.textInput, { color: colors.text, borderColor: color + '50', height: Math.max(90, textHeight) }]}
            value={text}
            onChangeText={handleTextChange}
            onBlur={() => takeLinks(text)}
            // Feld wächst mit dem Inhalt statt intern zu scrollen.
            onContentSizeChange={(e) => setTextHeight(e.nativeEvent.contentSize.height + (Platform.OS === 'web' ? 0 : 24))}
            scrollEnabled={false}
            placeholder="Dein Gedanke, deine Idee… (Links einfach einfügen)"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Gedanke"
          />

          {links.length > 0 && (
            <View style={s.linkRow}>
              {links.map((u) => (
                <LinkChip key={u} url={u} color={color} colors={colors} onRemove={() => setLinks((prev) => prev.filter((x) => x !== u))} />
              ))}
            </View>
          )}

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

              <>
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
                    style={[s.taskBtn, { backgroundColor: color, opacity: step.trim() && hasContent ? 1 : 0.4 }]}
                    onPress={handleCreateTask}
                    disabled={saving || !step.trim() || !hasContent}
                  >
                    <Text style={[s.saveBtnText, { color: '#111' }]}>Als Aufgabe anlegen</Text>
                    <Ionicons name="arrow-forward" size={16} color="#111" />
                  </Pressable>
                  <Text style={[s.hint, { color: colors.textMuted }]}>Text und Links wandern mit in die Aufgabe, der Geistesblitz verschwindet dann hier.</Text>

                  {/* TE-20: Steht ein Termin fest (Urlaub gebucht …), lebt der Geistesblitz als Countdown weiter. */}
                  <Pressable
                    style={[s.countdownBtn, { borderColor: color, opacity: hasContent ? 1 : 0.4 }]}
                    onPress={() => setDatePickerVisible(true)}
                    disabled={saving || !hasContent}
                  >
                    <MaterialCommunityIcons name="timer-sand" size={17} color={color} />
                    <Text style={[s.countdownBtnText, { color: colors.text }]}>Als Countdown – Datum wählen</Text>
                  </Pressable>
                  <Text style={[s.hint, { color: colors.textMuted }]}>Für Gebuchtes und Feststehendes: Details und Links hängen am Countdown.</Text>
              </>
            </>
          )}

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
              style={[s.btn, s.saveBtn, { borderWidth: 1, borderColor: color, opacity: hasContent ? 1 : 0.4 }]}
              onPress={handleSave}
              disabled={saving || !hasContent}
            >
              {saving
                ? <ActivityIndicator size="small" color={color} />
                : <Text style={[s.saveBtnText, { color: colors.text }]}>{editing ? 'Speichern' : 'Hinzufügen'}</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <DatePickerModal
        visible={datePickerVisible}
        value={null}
        onConfirm={handleCreateCountdown}
        onCancel={() => setDatePickerVisible(false)}
        colors={colors}
      />
    </Modal>
  );
}

// ─── Kachel ───────────────────────────────────────────────────────────────────

// Redesign: Im kompakten Dashboard-Layout (einziger Einsatzort dieser
// Komponente) trägt nicht mehr die Kachel-Fläche die vom User gewählte
// Volltonfarbe, sondern nur noch Symbol + Reifegrad-Punkte – neutrale dunkle
// Fläche wird mit der Kontextfarbe getönt (farbig, damit Kacheln unterscheidbar
// sind). Braucht der Geistesblitz einen Schritt, sitzt oben rechts ein Punkt.
function KachelCard({ kachel, onPress, size, colors, compact, attention }: {
  kachel: GeistesKachel;
  onPress: () => void;
  size: number;
  colors: ThemeColors;
  compact?: boolean;
  attention: boolean;
}) {
  const symbol = symbolFor(kachel);
  const label = kachel.label?.trim();
  const color = colorFor(symbol, label ?? '', kachel.text);
  return (
    <Pressable
      style={({ pressed }) => [
        s.card,
        compact
          ? { width: size, height: size, backgroundColor: color + '33', borderWidth: 1.5, borderColor: color + 'AA', opacity: pressed ? 0.8 : 1 }
          : { width: size, height: size, backgroundColor: color, opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={onPress}
      accessibilityLabel={`Geistesblitz ${label ?? kachel.text}`}
    >
      <KachelSymbol value={symbol} size={Math.round(size * (compact && label ? 0.34 : 0.42))} color={compact ? color : '#fff'} />
      {compact && label ? (
        <Text style={[s.cardLabel, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
      ) : null}
      <StageDots stage={kachel.stage} color={compact ? color : '#fff'} size={Math.max(3, Math.round(size / 16))} />
      {/* Braucht einen Schritt: Punkt statt Rahmen, damit die Kachelfarbe sichtbar bleibt. */}
      {attention && <View style={[s.attentionDot, { backgroundColor: colors.warning, borderColor: colors.background }]} />}
    </Pressable>
  );
}

const BIG_FACTOR = 1.25; // Kachel ab „Plan“
const ADD_FACTOR = 0.5;  // Plus-Feld neben Kacheln: halb so breit
const MIN_TILE = 44;

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export function GeistesKacheln({ colors, isDark, areaWidth, columns, compact = false }: { colors: ThemeColors; isDark: boolean; areaWidth?: number; columns?: number; compact?: boolean }) {
  const { user } = useFirebaseAuth();
  const { familyId } = useFamily();
  const [tiles, setTiles] = useState<GeistesKachel[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<GeistesKachel | null>(null);

  const fid = familyId ?? '';
  const uid = user?.uid ?? '';

  useEffect(() => {
    if (!fid || !uid) return;
    // Bereits umgewandelte Geistesblitze (Altbestand vor TE-16, stage 'aufgabe')
    // nicht mehr zeigen – neue werden beim Umwandeln gelöscht.
    return subscribeToGeistesKacheln(fid, uid, (all) => setTiles(all.filter((k) => k.stage !== 'aufgabe')));
  }, [fid, uid]);


  const attentionCount = tiles.filter(needsStep).length;

  const openNew    = useCallback(() => { setEditing(null); setModalVisible(true); }, []);
  const openEdit   = useCallback((k: GeistesKachel) => { setEditing(k); setModalVisible(true); }, []);

  const handleSave = useCallback(async (text: string, icon: string, color: string, label: string, stage: GeistesStage, links: string[]) => {
    if (!fid || !uid) return;
    const trimmedLabel = label.trim() || null;
    if (editing) await updateGeistesKachel(fid, uid, editing.id, { text, emoji: icon, color, label: trimmedLabel, stage, links });
    else         await addGeistesKachel(fid, uid, text, icon, color, trimmedLabel, links);
  }, [fid, uid, editing]);

  // Geistesblitz → Personal Task (Notizblock-Eintrag) ganz oben: nächster
  // Schritt als Titel, Ideentext als Notiz, Links mit. Danach wird der
  // Geistesblitz gelöscht – die Aufgabe trägt alle Infos.
  // Frisch vom Server lesen: der lokale Store kann beim Kaltstart noch alt sein.
  const handleCreateTask = useCallback(async (step: string, dueDate: string | null, text: string, links: string[]) => {
    if (!fid || !uid || !editing) return;
    const prefix = editing.label?.trim();
    const entry: ScratchEntry = {
      id: makeNoteId(),
      text: prefix ? `${prefix}: ${step.trim()}` : step.trim(),
      color: colorFor(symbolFor(editing), prefix ?? '', editing.text),
      dueDate,
      note: text.trim() || null,
      links,
    };
    const current = parseScratchpad(await loadScratchpad(fid, uid));
    // parseScratchpad liefert bei leerem Notizblock einen id-losen Platzhalter.
    const isPlaceholder = current.length === 1 && !current[0].id && !current[0].text.trim();
    const raw = serializeScratchpad([entry, ...(isPlaceholder ? [] : current)]);
    useStore.getState().setScratchpad(raw);
    await saveScratchpad(fid, uid, raw);
    await deleteGeistesKachel(fid, uid, editing.id);
  }, [fid, uid, editing]);

  const handleCreateCountdown = useCallback(async (date: Date, c: { title: string; text: string; links: string[]; icon: string; color: string }) => {
    if (!fid || !uid || !editing) return;
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    await addCountdown(fid, uid, c.title, iso, null, { icon: c.icon, color: c.color, note: c.text.trim() || null, links: c.links });
    await deleteGeistesKachel(fid, uid, editing.id);
    // Wer ausdrücklich „Als Countdown“ wählt, will ihn sehen – ausgeblendeten
    // Countdown-Block auf dem Dashboard daher wieder einschalten.
    const { settings, updateSettings } = useStore.getState();
    if (settings.dashboardBlocks?.countdowns === false) {
      updateSettings({ dashboardBlocks: { ...DEFAULT_DASHBOARD_BLOCKS, ...settings.dashboardBlocks, countdowns: true } });
    }
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
  const colSize = Math.floor((aw - 32 - (cols - 1) * 6) / cols);

  // Weiter gereift = weiter vorn; innerhalb gleicher Stufe neueste zuerst.
  const sortedTiles = useMemo(
    () => [...tiles].sort((a, b) => stageIndex(b.stage) - stageIndex(a.stage) || b.createdAt.localeCompare(a.createdAt)),
    [tiles],
  );

  // Kacheln (Plan+ zählt 1,25) und schmales Plus-Feld (0,5) sollen in eine Reihe
  // passen; dafür notfalls etwas kleiner, aber nie unter MIN_TILE – dann bricht um.
  const units = sortedTiles.reduce((n, k) => n + (stageIndex(k.stage) >= 2 ? BIG_FACTOR : 1), 0) + ADD_FACTOR;
  const fitSize = Math.floor((aw - 32 - sortedTiles.length * 6) / units);
  const tileSize = Math.min(colSize, Math.max(MIN_TILE, fitSize));

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
              { width: colSize, height: colSize, borderColor: SOFT_BORDER, opacity: pressed ? 0.6 : 1 },
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
          {sortedTiles.map((k) => (
            <KachelCard
              key={k.id}
              kachel={k}
              onPress={() => openEdit(k)}
              // Ab „Plan“ (3 Punkte) etwas größer – Reife soll man sehen.
              size={stageIndex(k.stage) >= 2 ? Math.floor(tileSize * BIG_FACTOR) : tileSize}
              colors={colors}
              compact={compact}
              attention={needsStep(k)}
            />
          ))}
          <Pressable
            style={({ pressed }) => [
              s.addCard,
              { width: Math.floor(tileSize * ADD_FACTOR), height: tileSize, borderColor: SOFT_BORDER, opacity: pressed ? 0.6 : 1 },
            ]}
            onPress={openNew}
            accessibilityLabel="Geistesblitz anlegen"
          >
            <Ionicons name="add" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      <KachelModal
        visible={modalVisible}
        editing={editing}
        onSave={handleSave}
        onCreateTask={handleCreateTask}
        onCreateCountdown={handleCreateCountdown}
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

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  // Redesign: Radius an die Countdown-/Artefakt-Mini-Kachel angeglichen
  // (14 statt 10) – wirkten nebeneinander sonst unterschiedlich rund.
  card: { borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, gap: 2 },
  cardLabel: { fontSize: 8.5, fontWeight: '600', textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 2, marginTop: 1 },
  attentionDot: { position: 'absolute', top: 5, right: 5, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
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
    width: 44, height: 44,
    borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },

  textInput: {
    borderWidth: 1.5, borderRadius: 10, padding: 12,
    fontSize: 14, lineHeight: 20,
  },

  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  labelInput: {
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14,
  },

  pickerLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },

  stageRow: { flexDirection: 'row', gap: 6 },
  stageItem: { flex: 1, gap: 6, alignItems: 'center', paddingVertical: 4 },
  stageBar: { height: 4, borderRadius: 2, alignSelf: 'stretch' },
  stageText: { fontSize: 12 },

  hint: { fontSize: 12, lineHeight: 17 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '600' },
  countdownBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, paddingVertical: 12, marginTop: 4 },
  countdownBtnText: { fontSize: 14, fontWeight: '700' },
  taskBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13 },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  btn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { borderWidth: 1, borderColor: '#FF3B3040' },
  saveBtn: { minWidth: 120 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
