/**
 * GeistesKacheln.tsx
 *
 * Persönliche Gedanken-Kacheln auf dem Dashboard.
 * Design: App-Icon-Stil – quadratische Kacheln mit vollfarbigem Hintergrund
 * und großem weißem Ionicons-Symbol. Kein Text auf der Kachel – erst im Modal.
 * 4-spaltig, Symbol per Keyword-Erkennung oder manueller Auswahl.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { ThemeColors } from '../utils/theme';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useFamily } from '../hooks/useFamily';
import {
  GeistesKachel,
  subscribeToGeistesKacheln,
  addGeistesKachel,
  updateGeistesKachel,
  deleteGeistesKachel,
} from '../services/geistesKacheln';
import { FussballKachel } from './FussballKachel';

// ─── Typen ────────────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── Icon-Palette ─────────────────────────────────────────────────────────────

const ICON_OPTIONS: IoniconName[] = [
  'bulb-outline',
  'checkmark-circle-outline',
  'heart-outline',
  'star-outline',
  'flag-outline',
  'rocket-outline',
  'cart-outline',
  'airplane-outline',
  'musical-notes-outline',
  'restaurant-outline',
  'barbell-outline',
  'people-outline',
  'briefcase-outline',
  'wallet-outline',
  'book-outline',
  'film-outline',
  'camera-outline',
  'gift-outline',
  'home-outline',
  'leaf-outline',
  'car-outline',
  'help-circle-outline',
  'alert-circle-outline',
  'happy-outline',
];

/** Automatische Icon-Erkennung aus dem Text-Inhalt (Deutsch + Englisch). */
function detectIcon(text: string): IoniconName {
  const t = text.toLowerCase();
  if (/idee|gedanke|einfall|geistesblitz|idea/.test(t))   return 'bulb-outline';
  if (/aufgabe|todo|erledigen|machen|task/.test(t))        return 'checkmark-circle-outline';
  if (/liebe|herz|romantik|love/.test(t))                  return 'heart-outline';
  if (/ziel|traum|wunsch|goal|dream/.test(t))              return 'star-outline';
  if (/plan|projekt|vorhaben|project/.test(t))             return 'flag-outline';
  if (/start|launch|neu|new|rocket/.test(t))               return 'rocket-outline';
  if (/einkauf|kaufen|liste|shop|shopping/.test(t))        return 'cart-outline';
  if (/reise|urlaub|flug|travel|trip/.test(t))             return 'airplane-outline';
  if (/musik|lied|song|music/.test(t))                     return 'musical-notes-outline';
  if (/essen|rezept|kochen|food|restaurant/.test(t))       return 'restaurant-outline';
  if (/sport|fitness|gym|training/.test(t))                return 'barbell-outline';
  if (/familie|kind|kinder|family/.test(t))                return 'people-outline';
  if (/arbeit|job|büro|meeting|work/.test(t))              return 'briefcase-outline';
  if (/geld|budget|kosten|money|finance/.test(t))          return 'wallet-outline';
  if (/buch|lesen|lektüre|book/.test(t))                   return 'book-outline';
  if (/film|kino|serie|movie/.test(t))                     return 'film-outline';
  if (/foto|bild|kamera|photo/.test(t))                    return 'camera-outline';
  if (/geschenk|geburtstag|feier|gift/.test(t))            return 'gift-outline';
  if (/haus|wohnung|zuhause|home/.test(t))                 return 'home-outline';
  if (/natur|garten|pflanze|nature/.test(t))               return 'leaf-outline';
  if (/auto|fahren|car/.test(t))                           return 'car-outline';
  return 'bulb-outline';
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

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  visible: boolean;
  editing: GeistesKachel | null;
  onSave: (text: string, icon: string, color: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  colors: ThemeColors;
}

function KachelModal({ visible, editing, onSave, onDelete, onClose, colors }: ModalProps) {
  const [text, setText] = useState('');
  const [icon, setIcon] = useState<IoniconName>('bulb-outline');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText(editing?.text ?? '');
      setIcon((editing?.emoji as IoniconName) ?? 'bulb-outline');
      setColor(editing?.color ?? randomColor());
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [visible, editing]);

  // Auto-Icon wenn User tippt und noch kein Icon manuell gewählt
  const [iconLocked, setIconLocked] = useState(false);
  useEffect(() => {
    if (!iconLocked && text) setIcon(detectIcon(text));
  }, [text, iconLocked]);
  useEffect(() => {
    if (visible) setIconLocked(!!editing?.emoji);
  }, [visible, editing]);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try { await onSave(text, icon, color); onClose(); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(); onClose(); }
    finally { setDeleting(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: colors.surface, borderTopColor: color }]}>

          {/* Vorschau-Icon */}
          <View style={[s.previewIcon, { backgroundColor: color }]}>
            <Ionicons name={icon} size={32} color="#fff" />
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
          />

          {/* Icon-Auswahl */}
          <Text style={[s.pickerLabel, { color: colors.textMuted }]}>Symbol</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.iconRow}>
            {ICON_OPTIONS.map((ic) => (
              <Pressable
                key={ic}
                style={[s.iconBtn, icon === ic && { backgroundColor: color, borderColor: color }]}
                onPress={() => { setIcon(ic); setIconLocked(true); }}
              >
                <Ionicons name={ic} size={20} color={icon === ic ? '#fff' : colors.textSecondary} />
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
              />
            ))}
          </View>

          {/* Aktionen */}
          <View style={s.actions}>
            {editing && (
              <Pressable style={[s.btn, s.deleteBtn]} onPress={handleDelete} disabled={deleting}>
                {deleting
                  ? <ActivityIndicator size="small" color="#FF3B30" />
                  : <Ionicons name="trash-outline" size={18} color="#FF3B30" />}
              </Pressable>
            )}
            <Pressable
              style={[s.btn, s.saveBtn, { backgroundColor: color, opacity: text.trim() ? 1 : 0.4 }]}
              onPress={handleSave}
              disabled={saving || !text.trim()}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.saveBtnText}>{editing ? 'Speichern' : 'Hinzufügen'}</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Kachel ───────────────────────────────────────────────────────────────────

function KachelCard({ kachel, onPress, size }: {
  kachel: GeistesKachel;
  onPress: () => void;
  size: number;
}) {
  const iconName = (kachel.emoji as IoniconName) ?? detectIcon(kachel.text);
  return (
    <Pressable
      style={({ pressed }) => [
        s.card,
        { width: size, height: size, backgroundColor: kachel.color, opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={onPress}
    >
      <Ionicons name={iconName} size={Math.round(size * 0.42)} color="#fff" />
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

  const fid = familyId ?? '';
  const uid = user?.uid ?? '';

  useEffect(() => {
    if (!fid || !uid) return;
    return subscribeToGeistesKacheln(fid, uid, setTiles);
  }, [fid, uid]);

  const openNew    = useCallback(() => { setEditing(null); setModalVisible(true); }, []);
  const openEdit   = useCallback((k: GeistesKachel) => { setEditing(k); setModalVisible(true); }, []);

  const handleSave = useCallback(async (text: string, icon: string, color: string) => {
    if (!fid || !uid) return;
    if (editing) await updateGeistesKachel(fid, uid, editing.id, { text, emoji: icon, color });
    else         await addGeistesKachel(fid, uid, text, icon, color);
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
        {/* TE-14: Fokus-Kachel-Icons rechtsbündig in derselben Zeile (nicht sticky).
            TE-153: In der schmalen Dashboard-Spalte (compact) wird die Fokus-Kachel
            NICHT hier gerendert, sondern als fixierter Button rechts-mittig am
            Viewport (siehe DashboardScreen). */}
        {!compact && <FussballKachel iconSize={18} />}
      </View>

      {tiles.length === 0 ? (
        <Pressable
          style={({ pressed }) => [s.empty, compact && s.emptyCompact, { borderColor: colors.accentNeon + '20', opacity: pressed ? 0.7 : 1 }]}
          onPress={openNew}
        >
          <Ionicons name="bulb-outline" size={compact ? 16 : 20} color={colors.textMuted} />
          <Text style={[s.emptyText, compact && s.emptyTextCompact, { color: colors.textMuted }]}>Ersten Geistesblitz festhalten</Text>
        </Pressable>
      ) : (
        <View style={s.grid}>
          {tiles.map((k) => (
            <KachelCard key={k.id} kachel={k} onPress={() => openEdit(k)} size={tileSize} />
          ))}
          <Pressable
            style={({ pressed }) => [
              s.addCard,
              { width: tileSize, height: tileSize, borderColor: colors.accentNeon + '25', opacity: pressed ? 0.6 : 1 },
            ]}
            onPress={openNew}
          >
            <Ionicons name="add" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      <KachelModal
        visible={modalVisible}
        editing={editing}
        onSave={handleSave}
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
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  addBtnText: { fontSize: 11, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  card: { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addCard: { borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },

  empty: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, padding: 16 },
  emptyText: { fontSize: 13 },
  // TE-153: kompakte Varianten für die schmale Dashboard-Spalte.
  emptyCompact: { padding: 10, gap: 8 },
  emptyTextCompact: { fontSize: 11, flex: 1 },

  // Modal
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' },
  sheet: {
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 3,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    gap: 12,
    paddingTop: 20,
  },

  previewIcon: {
    alignSelf: 'center',
    width: 64, height: 64,
    borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },

  textInput: {
    borderWidth: 1.5, borderRadius: 10, padding: 12,
    fontSize: 14, minHeight: 100, maxHeight: 200, lineHeight: 20,
  },

  pickerLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },

  iconRow: { gap: 8, paddingVertical: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 10,
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
