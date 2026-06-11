/**
 * FussballKachel.tsx
 *
 * Persistente, nicht löschbare Fußball-Kachel am rechten Bildschirmrand.
 * Rasengrüner Hintergrund, statisches Fußball-Icon, kein Lösch-Button.
 * Klick öffnet einen fast-fullscreen Notizdialog im Fußball-Look (dunkelgrün)
 * mit einem 2×2-Raster aus vier unabhängigen, editierbaren Notizabschnitten.
 *
 * Die Kachel bewusst in Fußball-Grün – ein gewollter Farbtupfer im sonst
 * strikt schwarz-weißen App-Theme (TE-7).
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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useFamily } from '../hooks/useFamily';
import {
  FussballAbschnitt,
  DEFAULT_SECTIONS,
  subscribeToFussballKachel,
  saveFussballKachel,
} from '../services/fussballKachel';

// ─── Fußball-Farben (themeunabhängig, gewollter Farbtupfer) ────────────────────

const GRASS       = '#2E7D32'; // Rasengrün (Kachel)
const GRASS_DARK  = '#0E3A16'; // dunkelgrüner Dialog-Hintergrund
const GRASS_LINE  = '#3C8C44'; // Rahmen
const CELL_BG     = 'rgba(20,67,31,0.78)'; // halbtransparentes Notizfeld – Spielfeld scheint durch
const CHALK       = 'rgba(232,247,232,0.30)'; // Spielfeld-Markierungen (Kalk)
const FG          = '#F1FAF1'; // helle Schrift auf Grün
const FG_MUTED    = '#A7C8AB';

// ─── Hauptkomponente ───────────────────────────────────────────────────────────

export function FussballKachel() {
  const { user } = useFirebaseAuth();
  const { familyId } = useFamily();
  const fid = familyId ?? '';
  const uid = user?.uid ?? '';

  const [sections, setSections] = useState<FussballAbschnitt[]>(DEFAULT_SECTIONS);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FussballAbschnitt[]>(DEFAULT_SECTIONS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!fid || !uid) return;
    return subscribeToFussballKachel(fid, uid, (data) => setSections(data.sections));
  }, [fid, uid]);

  const openDialog = useCallback(() => {
    setDraft(sections);
    setOpen(true);
  }, [sections]);

  const patchDraft = useCallback((i: number, patch: Partial<FussballAbschnitt>) => {
    setDraft((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }, []);

  const handleSave = useCallback(async () => {
    if (!fid || !uid) { setOpen(false); return; }
    setSaving(true);
    try {
      await saveFussballKachel(fid, uid, draft);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }, [fid, uid, draft]);

  return (
    <>
      {/* Fixierte Kachel am rechten Rand */}
      <Pressable
        style={({ pressed }) => [s.tile, pressed && { opacity: 0.85 }]}
        onPress={openDialog}
        accessibilityRole="button"
        accessibilityLabel="Fußball-Notizen öffnen"
      >
        <Ionicons name="football" size={30} color="#FFFFFF" />
      </Pressable>

      {/* Fast-fullscreen Notizdialog */}
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          style={s.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.dialog}>
            {/* Kopfzeile */}
            <View style={s.header}>
              <Ionicons name="football" size={22} color={FG} />
              <Text style={s.headerTitle}>Fußball-Notizen</Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={12}
                style={s.closeBtn}
                accessibilityLabel="Schließen"
              >
                <Ionicons name="close" size={22} color={FG} />
              </Pressable>
            </View>

            {/* Spielfeld-Hintergrund + füllendes 2×2-Raster */}
            <View style={s.body}>
              {/* Eingezeichnetes Fußball-Spielfeld (rein dekorativ) */}
              <View style={s.pitch} pointerEvents="none">
                <View style={s.halfLine} />
                <View style={s.centerCircle} />
                <View style={s.centerSpot} />
                <View style={[s.penaltyBox, s.penaltyTop]} />
                <View style={[s.goalBox, s.goalTop]} />
                <View style={[s.penaltyBox, s.penaltyBottom]} />
                <View style={[s.goalBox, s.goalBottom]} />
              </View>

              {/* 2×2-Raster – füllt den Dialog vollständig */}
              <View style={s.grid}>
                {[[0, 1], [2, 3]].map((rowIdx) => (
                  <View key={rowIdx[0]} style={s.row}>
                    {rowIdx.map((i) => {
                      const sec = draft[i];
                      return (
                        <View key={i} style={s.cell}>
                          <TextInput
                            style={s.cellTitle}
                            value={sec.title}
                            onChangeText={(t) => patchDraft(i, { title: t })}
                            placeholder="Titel"
                            placeholderTextColor={FG_MUTED}
                          />
                          <TextInput
                            style={s.cellBody}
                            value={sec.body}
                            onChangeText={(t) => patchDraft(i, { body: t })}
                            placeholder={'Freitext oder Liste\n- Spieler 1\n- Spieler 2'}
                            placeholderTextColor={FG_MUTED}
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

            {/* Speichern */}
            <Pressable
              style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.85 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.saveBtnText}>Speichern</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Kachel – fest am rechten Bildschirmrand, vertikal mittig
  tile: {
    position: 'absolute',
    right: 0,
    top: '42%',
    width: 56,
    height: 56,
    backgroundColor: GRASS,
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
    backgroundColor: GRASS_DARK,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GRASS_LINE,
    padding: 14,
    gap: 12,
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { flex: 1, color: FG, fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  closeBtn: { padding: 4 },

  // Füllende Spielfläche: Spielfeld-Layer + Raster übereinander
  body: { flex: 1, position: 'relative' },

  // ── Spielfeld-Markierungen (rein dekorativ, hinter dem Raster) ──
  pitch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  halfLine: {
    position: 'absolute', left: 0, right: 0, top: '50%',
    borderTopWidth: 2, borderColor: CHALK,
  },
  centerCircle: {
    position: 'absolute', left: '50%', top: '50%',
    width: 120, height: 120, marginLeft: -60, marginTop: -60,
    borderRadius: 60, borderWidth: 2, borderColor: CHALK,
  },
  centerSpot: {
    position: 'absolute', left: '50%', top: '50%',
    width: 6, height: 6, marginLeft: -3, marginTop: -3,
    borderRadius: 3, backgroundColor: CHALK,
  },
  penaltyBox: {
    position: 'absolute', left: '18%', right: '18%', height: '14%',
    borderWidth: 2, borderColor: CHALK,
  },
  penaltyTop: { top: 0, borderTopWidth: 0 },
  penaltyBottom: { bottom: 0, borderBottomWidth: 0 },
  goalBox: {
    position: 'absolute', left: '36%', right: '36%', height: '6%',
    borderWidth: 2, borderColor: CHALK,
  },
  goalTop: { top: 0, borderTopWidth: 0 },
  goalBottom: { bottom: 0, borderBottomWidth: 0 },

  // ── 2×2-Raster, füllt den ganzen body ──
  grid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, gap: 10 },
  row: { flex: 1, flexDirection: 'row', gap: 10 },
  cell: {
    flex: 1,
    backgroundColor: CELL_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GRASS_LINE,
    padding: 10,
    gap: 8,
  },
  cellTitle: {
    color: FG,
    fontSize: 14,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: GRASS_LINE,
    paddingBottom: 6,
  },
  cellBody: {
    flex: 1,
    color: FG,
    fontSize: 13,
    lineHeight: 19,
    minHeight: 100,
  },

  saveBtn: {
    backgroundColor: GRASS,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
