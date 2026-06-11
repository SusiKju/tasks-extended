/**
 * FussballKachel.tsx
 *
 * Fokus-Kachel(n) als kleine Icons – inline rechts in der Geistesblitze-Zeile
 * (nicht fixiert/sticky). In den Settings werden ein oder mehrere Themen
 * aktiviert (funTileThemes); pro Thema erscheint ein Icon. Klick öffnet einen
 * fast-fullscreen Notizdialog des jeweiligen Themas mit füllendem 2×2-Raster
 * aus vier editierbaren Notizabschnitten.
 *
 * Das Thema bestimmt Icon-/Kachelfarbe und das komplette Dialog-Styling inkl.
 * dekorativem Hintergrund:
 *   - fussball → Spielfeld
 *   - yoga     → konzentrische Zen-Ringe
 *   - garten   → Gartenbeete + Sonne
 *
 * Bewusster Farbtupfer im sonst strikt schwarz-weißen App-Theme (TE-7/TE-10/TE-14).
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useStore } from '../store';
import { FunTileTheme } from '../types';
import { useTheme, ThemeColors } from '../utils/theme';
import { DatePickerModal } from './DatePickerModal';
import {
  FussballAbschnitt,
  RosterEntry,
  defaultSections,
  isRosterField,
  loadFussballKachel,
  saveFussballKachel,
} from '../services/fussballKachel';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/** Indizes der Notizfelder, die als nummerierte Aufzählung geführt werden (TE-15). */
const NUMBERED_FIELDS = [0, 1];

/** Fixe Emoji-Vorauswahl für Namenslisten-Einträge (TE-16). */
const ROSTER_ICONS = ['⚽', '🧤', '🏃', '⭐', '🟢', '🔴', '🟡'];

/**
 * Macht aus jedem Zeilenumbruch eine fortlaufende Nummer: "1. …", "2. …".
 * Bestehende Nummern-Präfixe werden zuerst entfernt, damit Einfügen/Löschen
 * von Zeilen sauber neu durchnummeriert. Leerer Text bleibt leer (löschbar).
 *
 * Greift nur noch in Nicht-Roster-Feldern (yoga/garten); im fussball-Thema
 * sind die ersten zwei Felder seit TE-16 strukturierte Namenslisten.
 */
function numberLines(text: string): string {
  if (text === '') return '';
  return text
    .split('\n')
    .map((line, idx) => `${idx + 1}. ${line.replace(/^\s*\d+\.\s?/, '')}`)
    .join('\n');
}

// ─── Namensliste (TE-16) ───────────────────────────────────────────────────────

const emptyEntry = (): RosterEntry => ({ name: '', geburtstag: '', icon: '' });

/** ISO 'YYYY-MM-DD' → 'DD.MM.YYYY' (string-basiert, ohne Zeitzonen-Fallen). */
function formatGeb(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/** ISO 'YYYY-MM-DD' → lokales Date (für den Picker-Startwert). */
function parseGeb(iso: string): Date | null {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** Lokales Date → ISO 'YYYY-MM-DD' (kein UTC-Shift). */
function toISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Zwei Einträge tauschen; out-of-range no-op. */
function moveItem(list: RosterEntry[], idx: number, dir: -1 | 1): RosterEntry[] {
  const j = idx + dir;
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[idx], copy[j]] = [copy[j], copy[idx]];
  return copy;
}

interface RosterCellProps {
  entries: RosterEntry[];
  cfg: FunThemeCfg;
  colors: ThemeColors;
  onAdd: () => void;
  onPatch: (idx: number, patch: Partial<RosterEntry>) => void;
  onRemove: (idx: number) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
}

/** ISO 'YYYY-MM-DD' → kompaktes "'JJ" Jahres-Badge (z. B. "'19"). */
function yearBadge(iso: string): string {
  const y = iso.split('-')[0];
  return y.length === 4 ? `'${y.slice(2)}` : '';
}

/**
 * Editor für die strukturierte Namensliste eines Roster-Feldes – kompakt:
 * eine Zeile pro Eintrag (Nummer · optionales Icon · Name · optionales
 * Jahres-Badge · Löschen). Tippen auf die Zeile klappt ein Detail-Panel auf
 * (Icon-Auswahl, voller Geburtstag per Picker, ▲▼-Sortieren). So passen auch
 * 15–16 Namen sichtbar untereinander.
 */
function RosterCell({ entries, cfg, colors, onAdd, onPatch, onRemove, onMove }: RosterCellProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [datePickerIdx, setDatePickerIdx] = useState<number | null>(null);
  const toggle = (idx: number) => setExpandedIdx((cur) => (cur === idx ? null : idx));

  return (
    <>
      <ScrollView style={s.rosterScroll} keyboardShouldPersistTaps="handled">
        {entries.map((e, idx) => {
          const open = expandedIdx === idx;
          return (
            <View key={idx}>
              {/* Kompakte Zeile: ein Name = eine Zeile */}
              <View style={[s.entryLine, { borderBottomColor: cfg.line }]}>
                <Pressable onPress={() => toggle(idx)} hitSlop={4} style={s.lineLeft} accessibilityLabel="Details">
                  <Text style={[s.entryNum, { color: cfg.fgMuted }]}>{idx + 1}.</Text>
                  {e.icon ? <Text style={s.lineEmoji}>{e.icon}</Text> : null}
                </Pressable>
                <TextInput
                  style={[s.lineInput, { color: cfg.fg }]}
                  value={e.name}
                  onChangeText={(t) => onPatch(idx, { name: t })}
                  placeholder="Name"
                  placeholderTextColor={cfg.fgMuted}
                />
                {e.geburtstag ? (
                  <Text style={[s.lineYear, { color: cfg.fgMuted }]}>{yearBadge(e.geburtstag)}</Text>
                ) : null}
                <Pressable onPress={() => toggle(idx)} hitSlop={4} style={s.lineBtn} accessibilityLabel="Details">
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={cfg.fgMuted} />
                </Pressable>
                <Pressable onPress={() => onRemove(idx)} hitSlop={4} style={s.lineBtn} accessibilityLabel="Eintrag löschen">
                  <Ionicons name="close" size={14} color={cfg.fgMuted} />
                </Pressable>
              </View>

              {/* Detail-Panel (nur für die aufgeklappte Zeile) */}
              {open && (
                <View style={s.expand}>
                  <View style={s.iconPicker}>
                    {ROSTER_ICONS.map((ic) => (
                      <Pressable
                        key={ic}
                        onPress={() => onPatch(idx, { icon: e.icon === ic ? '' : ic })}
                        style={[s.iconOption, e.icon === ic && { backgroundColor: cfg.line, borderRadius: 6 }]}
                      >
                        <Text style={s.iconOptionText}>{ic}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.expandRow}>
                    <Pressable
                      onPress={() => setDatePickerIdx(idx)}
                      style={[s.dateChip, { borderColor: cfg.line }]}
                      accessibilityLabel="Geburtstag wählen"
                    >
                      <Ionicons name="calendar-outline" size={13} color={cfg.fgMuted} />
                      <Text style={[s.dateChipText, { color: e.geburtstag ? cfg.fg : cfg.fgMuted }]}>
                        {e.geburtstag ? formatGeb(e.geburtstag) : 'Geburtstag'}
                      </Text>
                    </Pressable>
                    <View style={s.entrySpacer} />
                    <Pressable onPress={() => onMove(idx, -1)} disabled={idx === 0} hitSlop={6} style={s.ctrlBtn}>
                      <Ionicons name="chevron-up" size={16} color={idx === 0 ? cfg.line : cfg.fg} />
                    </Pressable>
                    <Pressable
                      onPress={() => onMove(idx, 1)}
                      disabled={idx === entries.length - 1}
                      hitSlop={6}
                      style={s.ctrlBtn}
                    >
                      <Ionicons name="chevron-down" size={16} color={idx === entries.length - 1 ? cfg.line : cfg.fg} />
                    </Pressable>
                  </View>
                </View>
              )}

              {datePickerIdx === idx && (
                <DatePickerModal
                  visible
                  value={parseGeb(e.geburtstag)}
                  onConfirm={(d) => {
                    onPatch(idx, { geburtstag: toISODate(d) });
                    setDatePickerIdx(null);
                  }}
                  onCancel={() => setDatePickerIdx(null)}
                  colors={colors}
                />
              )}
            </View>
          );
        })}
      </ScrollView>

      <Pressable onPress={onAdd} style={[s.addBtn, { borderColor: cfg.line }]}>
        <Ionicons name="add" size={16} color={cfg.fg} />
        <Text style={[s.addBtnText, { color: cfg.fg }]}>Eintrag</Text>
      </Pressable>
    </>
  );
}

// ─── Themen-Konfiguration (themeunabhängige Farbtupfer) ────────────────────────

interface FunThemeCfg {
  label: string;
  title: string;       // Dialog-Titel
  icon: IoniconName;   // Kachel-/Header-Icon
  tile: string;        // Kachel- & Speichern-Farbe
  dialogBg: string;    // Dialog-Hintergrund
  cellBg: string;      // halbtransparentes Notizfeld (Hintergrund scheint durch)
  line: string;        // Rahmen/Trennlinien
  chalk: string;       // dekorative Hintergrund-Markierungen
  fg: string;          // Schrift
  fgMuted: string;     // Platzhalter
  placeholder: string; // Platzhalter-Text der Notizfelder (themenspezifisch)
}

export const FUN_THEMES: Record<FunTileTheme, FunThemeCfg> = {
  fussball: {
    label: 'Fußball',
    title: 'Fußball-Notizen',
    icon: 'football',
    tile: '#2E7D32',
    dialogBg: '#0E3A16',
    cellBg: 'rgba(20,67,31,0.78)',
    line: '#3C8C44',
    chalk: 'rgba(232,247,232,0.30)',
    fg: '#F1FAF1',
    fgMuted: '#A7C8AB',
    placeholder: 'Freitext oder Liste\n- Spieler 1\n- Spieler 2',
  },
  yoga: {
    label: 'Yoga',
    title: 'Yoga-Notizen',
    icon: 'flower',
    tile: '#7E6BD6',
    dialogBg: '#241A33',
    cellBg: 'rgba(58,44,84,0.78)',
    line: '#5B4A86',
    chalk: 'rgba(240,235,250,0.26)',
    fg: '#F4F1FB',
    fgMuted: '#BCAFD6',
    placeholder: 'Freitext oder Liste\n- Asana 1\n- Atemübung',
  },
  garten: {
    label: 'Garten',
    title: 'Garten-Notizen',
    icon: 'leaf',
    tile: '#7CB342',
    dialogBg: '#1C2912',
    cellBg: 'rgba(44,58,28,0.78)',
    line: '#4E6B30',
    chalk: 'rgba(238,247,228,0.28)',
    fg: '#F1F7EA',
    fgMuted: '#B6CBA0',
    placeholder: 'Freitext oder Liste\n- Tomaten säen\n- Beet gießen',
  },
};

// ─── Dekorativer Hintergrund je Thema ──────────────────────────────────────────

function ThemeBackground({ theme, chalk }: { theme: FunTileTheme; chalk: string }) {
  if (theme === 'fussball') {
    return (
      <View style={s.bgLayer} pointerEvents="none">
        <View style={[s.halfLine, { borderColor: chalk }]} />
        <View style={[s.centerCircle, { borderColor: chalk }]} />
        <View style={[s.centerSpot, { backgroundColor: chalk }]} />
        <View style={[s.penaltyBox, s.penaltyTop, { borderColor: chalk }]} />
        <View style={[s.goalBox, s.goalTop, { borderColor: chalk }]} />
        <View style={[s.penaltyBox, s.penaltyBottom, { borderColor: chalk }]} />
        <View style={[s.goalBox, s.goalBottom, { borderColor: chalk }]} />
      </View>
    );
  }
  if (theme === 'yoga') {
    return (
      <View style={s.bgLayer} pointerEvents="none">
        {[220, 150, 80].map((d) => (
          <View
            key={d}
            style={[s.ring, { width: d, height: d, borderRadius: d / 2, marginLeft: -d / 2, marginTop: -d / 2, borderColor: chalk }]}
          />
        ))}
        <View style={[s.centerSpot, { backgroundColor: chalk }]} />
      </View>
    );
  }
  // garten: Beete (horizontale Reihen) + Sonne
  return (
    <View style={s.bgLayer} pointerEvents="none">
      {['16%', '34%', '52%', '70%', '88%'].map((top) => (
        <View key={top} style={[s.gardenRow, { top: top as any, borderColor: chalk }]} />
      ))}
      <View style={[s.sun, { borderColor: chalk }]} />
    </View>
  );
}

// ─── Hauptkomponente ───────────────────────────────────────────────────────────

/** Reihenfolge der Icons folgt der festen Themen-Reihenfolge, nicht der Auswahl. */
const THEME_ORDER: FunTileTheme[] = ['fussball', 'yoga', 'garten'];

export function FussballKachel() {
  const { user } = useFirebaseAuth();
  // Defensive Defaults: alt persistierte Stände kennen das Array evtl. noch
  // nicht (Migration v18).
  const themes = useStore((st) => st.settings.funTileThemes) ?? [];
  const uid = user?.uid ?? '';
  // App-Theme nur für den Datums-Picker der Namensliste (TE-16).
  const { colors } = useTheme();

  const [openTheme, setOpenTheme] = useState<FunTileTheme | null>(null);
  const [draft, setDraft] = useState<FussballAbschnitt[]>([]);
  // Verhindert, dass ein verspätet geladenes Dokument bereits getippte
  // Eingaben überschreibt.
  const editedRef = useRef(false);

  const openDialog = useCallback((theme: FunTileTheme) => {
    editedRef.current = false;
    setDraft(defaultSections(theme));
    setOpenTheme(theme);
    if (!uid) return;
    loadFussballKachel(uid, theme)
      .then((data) => { if (!editedRef.current) setDraft(data.sections); })
      .catch((e) => console.warn('loadFussballKachel failed', e));
  }, [uid]);

  const patchDraft = useCallback((i: number, patch: Partial<FussballAbschnitt>) => {
    editedRef.current = true;
    setDraft((prev) => prev.map((sec, idx) => (idx === i ? { ...sec, ...patch } : sec)));
  }, []);

  // Namensliste-Einträge eines Roster-Feldes mutieren (TE-16).
  const mutateEntries = useCallback(
    (i: number, fn: (entries: RosterEntry[]) => RosterEntry[]) => {
      editedRef.current = true;
      setDraft((prev) =>
        prev.map((sec, idx) => (idx === i ? { ...sec, entries: fn(sec.entries ?? []) } : sec)),
      );
    },
    [],
  );

  // Dialog sofort schließen; im Hintergrund speichern (Fehler nur loggen).
  const handleSave = useCallback(() => {
    const theme = openTheme;
    setOpenTheme(null);
    if (!uid || !theme) return;
    saveFussballKachel(uid, theme, draft).catch((e) =>
      console.warn('saveFussballKachel failed', e),
    );
  }, [uid, openTheme, draft]);

  // Nur die in den Settings ausgewählten Themen, in fester Reihenfolge.
  const activeThemes = THEME_ORDER.filter((t) => themes.includes(t));
  if (activeThemes.length === 0) return null;

  const cfg = openTheme ? (FUN_THEMES[openTheme] ?? FUN_THEMES.fussball) : null;

  return (
    <>
      {/* Inline-Icons – eine kleine Kachel pro aktivem Thema (nicht sticky) */}
      <View style={s.iconRow}>
        {activeThemes.map((t) => {
          const c = FUN_THEMES[t];
          return (
            <Pressable
              key={t}
              style={({ pressed }) => [s.iconTile, { backgroundColor: c.tile }, pressed && { opacity: 0.85 }]}
              onPress={() => openDialog(t)}
              accessibilityRole="button"
              accessibilityLabel={`${c.label}-Notizen öffnen`}
            >
              <Ionicons name={c.icon} size={18} color="#FFFFFF" />
            </Pressable>
          );
        })}
      </View>

      {/* Fast-fullscreen Notizdialog des gewählten Themas */}
      <Modal visible={!!openTheme} animationType="slide" transparent onRequestClose={() => setOpenTheme(null)}>
        {cfg && openTheme && (
          <KeyboardAvoidingView
            style={s.backdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[s.dialog, { backgroundColor: cfg.dialogBg, borderColor: cfg.line }]}>
              {/* Kopfzeile */}
              <View style={s.header}>
                <Ionicons name={cfg.icon} size={22} color={cfg.fg} />
                <Text style={[s.headerTitle, { color: cfg.fg }]}>{cfg.title}</Text>
                <Pressable onPress={() => setOpenTheme(null)} hitSlop={12} style={s.closeBtn} accessibilityLabel="Schließen">
                  <Ionicons name="close" size={22} color={cfg.fg} />
                </Pressable>
              </View>

              {/* Dekorativer Hintergrund + füllendes 2×2-Raster */}
              <View style={s.body}>
                <ThemeBackground theme={openTheme} chalk={cfg.chalk} />

                <View style={s.grid}>
                  {[[0, 1], [2, 3]].map((rowIdx) => (
                    <View key={rowIdx[0]} style={s.row}>
                      {rowIdx.map((i) => {
                        const sec = draft[i];
                        return (
                          <View key={i} style={[s.cell, { backgroundColor: cfg.cellBg, borderColor: cfg.line }]}>
                            <TextInput
                              style={[s.cellTitle, { color: cfg.fg, borderBottomColor: cfg.line }]}
                              value={sec?.title ?? ''}
                              onChangeText={(t) => patchDraft(i, { title: t })}
                              placeholder="Titel"
                              placeholderTextColor={cfg.fgMuted}
                            />
                            {isRosterField(openTheme, i) ? (
                              <RosterCell
                                entries={sec?.entries ?? []}
                                cfg={cfg}
                                colors={colors}
                                onAdd={() => mutateEntries(i, (es) => [...es, emptyEntry()])}
                                onPatch={(k, patch) =>
                                  mutateEntries(i, (es) => es.map((e, n) => (n === k ? { ...e, ...patch } : e)))
                                }
                                onRemove={(k) => mutateEntries(i, (es) => es.filter((_, n) => n !== k))}
                                onMove={(k, dir) => mutateEntries(i, (es) => moveItem(es, k, dir))}
                              />
                            ) : (
                              <TextInput
                                style={[s.cellBody, { color: cfg.fg }]}
                                value={sec?.body ?? ''}
                                onChangeText={(t) =>
                                  patchDraft(i, { body: NUMBERED_FIELDS.includes(i) ? numberLines(t) : t })
                                }
                                placeholder={cfg.placeholder}
                                placeholderTextColor={cfg.fgMuted}
                                multiline
                                textAlignVertical="top"
                              />
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>

              {/* Speichern – schließt den Dialog sofort */}
              <Pressable
                style={({ pressed }) => [s.saveBtn, { backgroundColor: cfg.tile }, pressed && { opacity: 0.85 }]}
                onPress={handleSave}
              >
                <Text style={s.saveBtnText}>Speichern</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </Modal>
    </>
  );
}

// ─── Styles (Geometrie; Farben kommen themenabhängig inline) ───────────────────

const s = StyleSheet.create({
  // Inline-Icons rechts in der Geistesblitze-Kopfzeile (nicht sticky)
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconTile: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Dialog
  backdrop: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center' },
  dialog: {
    flex: 1,
    margin: 12,
    marginTop: Platform.OS === 'ios' ? 48 : 24,
    marginBottom: Platform.OS === 'ios' ? 32 : 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  closeBtn: { padding: 4 },

  // Füllende Spielfläche: Hintergrund-Layer + Raster übereinander
  body: { flex: 1, position: 'relative' },
  bgLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  // ── Fußball-Spielfeld ──
  halfLine: { position: 'absolute', left: 0, right: 0, top: '50%', borderTopWidth: 2 },
  centerCircle: { position: 'absolute', left: '50%', top: '50%', width: 120, height: 120, marginLeft: -60, marginTop: -60, borderRadius: 60, borderWidth: 2 },
  centerSpot: { position: 'absolute', left: '50%', top: '50%', width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: 3 },
  penaltyBox: { position: 'absolute', left: '18%', right: '18%', height: '14%', borderWidth: 2 },
  penaltyTop: { top: 0, borderTopWidth: 0 },
  penaltyBottom: { bottom: 0, borderBottomWidth: 0 },
  goalBox: { position: 'absolute', left: '36%', right: '36%', height: '6%', borderWidth: 2 },
  goalTop: { top: 0, borderTopWidth: 0 },
  goalBottom: { bottom: 0, borderBottomWidth: 0 },

  // ── Yoga: konzentrische Ringe (zentriert via left/top 50% + neg. margin) ──
  ring: { position: 'absolute', left: '50%', top: '50%', borderWidth: 2 },

  // ── Garten: Beet-Reihen + Sonne ──
  gardenRow: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1.5, borderStyle: 'dashed' },
  sun: { position: 'absolute', top: 14, right: 14, width: 46, height: 46, borderRadius: 23, borderWidth: 2 },

  // ── 2×2-Raster, füllt den ganzen body ──
  grid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, gap: 10 },
  row: { flex: 1, flexDirection: 'row', gap: 10 },
  cell: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 10, gap: 8 },
  cellTitle: { fontSize: 14, fontWeight: '700', borderBottomWidth: 1, paddingBottom: 6 },
  cellBody: { flex: 1, fontSize: 13, lineHeight: 19, minHeight: 100 },

  // ── Namensliste (TE-16) – kompakt: eine Zeile pro Name ──
  rosterScroll: { flex: 1 },
  entryLine: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 1, borderBottomWidth: StyleSheet.hairlineWidth },
  lineLeft: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  entryNum: { fontSize: 11, fontWeight: '700', minWidth: 18 },
  lineEmoji: { fontSize: 13 },
  lineInput: { flex: 1, fontSize: 13, paddingVertical: 2, paddingHorizontal: 0 },
  lineYear: { fontSize: 10, fontWeight: '600' },
  lineBtn: { paddingHorizontal: 2, paddingVertical: 2 },
  // Detail-Panel
  expand: { paddingLeft: 18, paddingBottom: 6, gap: 6 },
  expandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  iconOption: { padding: 3 },
  iconOptionText: { fontSize: 18 },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  dateChipText: { fontSize: 11 },
  entrySpacer: { flex: 1 },
  ctrlBtn: { padding: 3 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 6, marginTop: 4 },
  addBtnText: { fontSize: 12, fontWeight: '600' },

  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
