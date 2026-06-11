/**
 * FussballKachel.tsx
 *
 * Persistente, nicht löschbare Fokus-Kachel am rechten Bildschirmrand.
 * Standardmäßig ausgeblendet – erst über die Settings (funTileEnabled)
 * sichtbar. Klick öffnet einen fast-fullscreen Notizdialog mit einem
 * füllenden 2×2-Raster aus vier editierbaren Notizabschnitten.
 *
 * Das in den Settings gewählte Thema (funTileTheme) bestimmt Kachelfarbe,
 * Icon und das komplette Dialog-Styling inkl. dekorativem Hintergrund:
 *   - fussball → Spielfeld
 *   - yoga     → konzentrische Zen-Ringe
 *   - garten   → Gartenbeete + Sonne
 *
 * Bewusster Farbtupfer im sonst strikt schwarz-weißen App-Theme (TE-7/TE-10).
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useFamily } from '../hooks/useFamily';
import { useStore } from '../store';
import { FunTileTheme } from '../types';
import {
  FussballAbschnitt,
  defaultSections,
  subscribeToFussballKachel,
  saveFussballKachel,
} from '../services/fussballKachel';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

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

export function FussballKachel() {
  const { user } = useFirebaseAuth();
  const { familyId } = useFamily();
  const enabled = useStore((st) => st.settings.funTileEnabled);
  const theme = useStore((st) => st.settings.funTileTheme);
  const fid = familyId ?? '';
  const uid = user?.uid ?? '';

  const [sections, setSections] = useState<FussballAbschnitt[]>(() => defaultSections(theme));
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FussballAbschnitt[]>(() => defaultSections(theme));

  useEffect(() => {
    if (!enabled || !fid || !uid) {
      // Ohne Subscription beim Themenwechsel zumindest die Default-Titel zeigen.
      setSections(defaultSections(theme));
      return;
    }
    return subscribeToFussballKachel(fid, uid, theme, (data) => setSections(data.sections));
  }, [enabled, fid, uid, theme]);

  const openDialog = useCallback(() => {
    setDraft(sections);
    setOpen(true);
  }, [sections]);

  const patchDraft = useCallback((i: number, patch: Partial<FussballAbschnitt>) => {
    setDraft((prev) => prev.map((sec, idx) => (idx === i ? { ...sec, ...patch } : sec)));
  }, []);

  // Dialog sofort schließen; im Hintergrund speichern (Fehler nur loggen).
  const handleSave = useCallback(() => {
    setOpen(false);
    if (!fid || !uid) return;
    saveFussballKachel(fid, uid, theme, draft).catch((e) =>
      console.warn('saveFussballKachel failed', e),
    );
  }, [fid, uid, theme, draft]);

  // Standardmäßig versteckt – nur sichtbar, wenn in den Settings aktiviert.
  if (!enabled) return null;

  const cfg = FUN_THEMES[theme] ?? FUN_THEMES.fussball;

  return (
    <>
      {/* Fixierte Kachel am rechten Rand */}
      <Pressable
        style={({ pressed }) => [s.tile, { backgroundColor: cfg.tile }, pressed && { opacity: 0.85 }]}
        onPress={openDialog}
        accessibilityRole="button"
        accessibilityLabel={`${cfg.label}-Notizen öffnen`}
      >
        <Ionicons name={cfg.icon} size={30} color="#FFFFFF" />
      </Pressable>

      {/* Fast-fullscreen Notizdialog */}
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          style={s.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[s.dialog, { backgroundColor: cfg.dialogBg, borderColor: cfg.line }]}>
            {/* Kopfzeile */}
            <View style={s.header}>
              <Ionicons name={cfg.icon} size={22} color={cfg.fg} />
              <Text style={[s.headerTitle, { color: cfg.fg }]}>{cfg.title}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12} style={s.closeBtn} accessibilityLabel="Schließen">
                <Ionicons name="close" size={22} color={cfg.fg} />
              </Pressable>
            </View>

            {/* Dekorativer Hintergrund + füllendes 2×2-Raster */}
            <View style={s.body}>
              <ThemeBackground theme={theme} chalk={cfg.chalk} />

              <View style={s.grid}>
                {[[0, 1], [2, 3]].map((rowIdx) => (
                  <View key={rowIdx[0]} style={s.row}>
                    {rowIdx.map((i) => {
                      const sec = draft[i];
                      return (
                        <View key={i} style={[s.cell, { backgroundColor: cfg.cellBg, borderColor: cfg.line }]}>
                          <TextInput
                            style={[s.cellTitle, { color: cfg.fg, borderBottomColor: cfg.line }]}
                            value={sec.title}
                            onChangeText={(t) => patchDraft(i, { title: t })}
                            placeholder="Titel"
                            placeholderTextColor={cfg.fgMuted}
                          />
                          <TextInput
                            style={[s.cellBody, { color: cfg.fg }]}
                            value={sec.body}
                            onChangeText={(t) => patchDraft(i, { body: t })}
                            placeholder={cfg.placeholder}
                            placeholderTextColor={cfg.fgMuted}
                            multiline
                            textAlignVertical="top"
                          />
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
      </Modal>
    </>
  );
}

// ─── Styles (Geometrie; Farben kommen themenabhängig inline) ───────────────────

const s = StyleSheet.create({
  // Kachel – fest am rechten Bildschirmrand, vertikal mittig
  tile: {
    position: 'absolute',
    right: 0,
    top: '42%',
    width: 56,
    height: 56,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
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

  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
