/**
 * LinksScreen.tsx
 *
 * Persönliche Linkliste (TE-32). Der Nutzer pflegt Links mit Titel + URL,
 * weist jedem Link ein Fallback-Symbol/Farbe zu (genutzt, wenn kein Favicon
 * geladen werden kann) und aktiviert einzelne Links. Aktive Links erscheinen
 * als Karten-Schnellleiste oberhalb der Geistesblitze auf dem Dashboard.
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeColors, neonGlow } from '../utils/theme';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useFamily } from '../hooks/useFamily';
import {
  LinkItem,
  subscribeToLinks,
  addLink,
  updateLink,
  deleteLink,
  openLink,
} from '../services/links';
import { LinkAvatar } from '../components/LinkAvatar';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── Symbol-/Farb-Palette (Fallback ohne Favicon) ──────────────────────────────

const ICON_OPTIONS: IoniconName[] = [
  'link-outline',
  'globe-outline',
  'newspaper-outline',
  'cart-outline',
  'mail-outline',
  'calendar-outline',
  'videocam-outline',
  'musical-notes-outline',
  'document-text-outline',
  'cloud-outline',
  'school-outline',
  'football-outline',
  'cash-outline',
  'people-outline',
  'briefcase-outline',
  'medkit-outline',
  'restaurant-outline',
  'map-outline',
  'cog-outline',
  'star-outline',
];

const COLORS = [
  '#6C63FF', '#FF6B9D', '#4ECDC4', '#45B7D1',
  '#FF7675', '#A29BFE', '#00B894', '#FD79A8',
  '#55EFC4', '#FDCB6E', '#E17055', '#0984E3',
];

function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// ─── Modal ──────────────────────────────────────────────────────────────────

interface ModalProps {
  visible: boolean;
  editing: LinkItem | null;
  onSave: (data: { title: string; url: string; icon: string; color: string; active: boolean }) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  colors: ThemeColors;
}

function LinkModal({ visible, editing, onSave, onDelete, onClose, colors }: ModalProps) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState<IoniconName>('link-outline');
  const [color, setColor] = useState(COLORS[0]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const titleRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setTitle(editing?.title ?? '');
      setUrl(editing?.url ?? '');
      setIcon((editing?.icon as IoniconName) ?? 'link-outline');
      setColor(editing?.color ?? randomColor());
      setActive(editing ? editing.active : true);
      setTimeout(() => titleRef.current?.focus(), 120);
    }
  }, [visible, editing]);

  const canSave = !!title.trim() && !!url.trim();

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try { await onSave({ title, url, icon, color, active }); onClose(); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(); onClose(); }
    finally { setDeleting(false); }
  };

  // Live-Vorschau (Favicon mit Fallback) des aktuellen Stands.
  const preview: LinkItem = {
    id: 'preview', title, url, icon, color, active, createdAt: '',
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: colors.surface, borderTopColor: color }]}>

          {/* Vorschau */}
          <View style={s.previewWrap}>
            <LinkAvatar link={preview} size={64} />
          </View>

          {/* Titel */}
          <TextInput
            ref={titleRef}
            style={[s.input, { color: colors.text, borderColor: color + '50' }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Titel (z. B. Tagesschau)"
            placeholderTextColor={colors.textMuted}
          />

          {/* URL */}
          <TextInput
            style={[s.input, { color: colors.text, borderColor: color + '50' }]}
            value={url}
            onChangeText={setUrl}
            placeholder="URL (z. B. tagesschau.de)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          {/* Aktiv-Toggle */}
          <Pressable style={s.toggleRow} onPress={() => setActive((v) => !v)}>
            <View>
              <Text style={[s.toggleTitle, { color: colors.text }]}>Auf dem Dashboard zeigen</Text>
              <Text style={[s.toggleSub, { color: colors.textMuted }]}>Erscheint als Karte über den Geistesblitzen</Text>
            </View>
            <View style={[s.switch, { backgroundColor: active ? color : colors.border }]}>
              <View style={[s.knob, { transform: [{ translateX: active ? 18 : 0 }] }]} />
            </View>
          </Pressable>

          {/* Fallback-Symbol */}
          <Text style={[s.pickerLabel, { color: colors.textMuted }]}>Ersatz-Symbol (falls kein Favicon)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.iconRow}>
            {ICON_OPTIONS.map((ic) => (
              <Pressable
                key={ic}
                style={[s.iconBtn, icon === ic && { backgroundColor: color, borderColor: color }]}
                onPress={() => setIcon(ic)}
              >
                <Ionicons name={ic} size={20} color={icon === ic ? '#fff' : colors.textSecondary} />
              </Pressable>
            ))}
          </ScrollView>

          {/* Farbe */}
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
              style={[s.btn, s.saveBtn, { backgroundColor: color, opacity: canSave ? 1 : 0.4 }]}
              onPress={handleSave}
              disabled={saving || !canSave}
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

// ─── Listenzeile ──────────────────────────────────────────────────────────────

function LinkRow({ link, onEdit, onToggle, onOpen, colors, isDark }: {
  link: LinkItem;
  onEdit: () => void;
  onToggle: () => void;
  onOpen: () => void;
  colors: ThemeColors;
  isDark: boolean;
}) {
  return (
    <View style={[
      s.row,
      { backgroundColor: colors.surface, borderColor: isDark ? colors.accentNeon + '30' : colors.border },
      isDark ? neonGlow(colors.accentNeon, 'soft') : null,
    ]}>
      <Pressable onPress={onOpen} hitSlop={6}>
        <LinkAvatar link={link} size={40} />
      </Pressable>
      <Pressable style={s.rowText} onPress={onOpen}>
        <Text style={[s.rowTitle, { color: colors.text }]} numberOfLines={1}>{link.title}</Text>
        <Text style={[s.rowUrl, { color: colors.textMuted }]} numberOfLines={1}>{link.url}</Text>
      </Pressable>
      <Pressable onPress={onToggle} hitSlop={8} style={s.rowAction}>
        <View style={[s.switchSm, { backgroundColor: link.active ? colors.accentNeon : colors.border }]}>
          <View style={[s.knobSm, { transform: [{ translateX: link.active ? 14 : 0 }] }]} />
        </View>
      </Pressable>
      <Pressable onPress={onEdit} hitSlop={8} style={s.rowAction}>
        <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function LinksScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useFirebaseAuth();
  const { familyId } = useFamily();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<LinkItem | null>(null);

  const fid = familyId ?? '';
  const uid = user?.uid ?? '';

  useEffect(() => {
    if (!fid || !uid) return;
    return subscribeToLinks(fid, uid, setLinks);
  }, [fid, uid]);

  const openNew = useCallback(() => { setEditing(null); setModalVisible(true); }, []);
  const openEdit = useCallback((l: LinkItem) => { setEditing(l); setModalVisible(true); }, []);

  const handleSave = useCallback(async (data: { title: string; url: string; icon: string; color: string; active: boolean }) => {
    if (!fid || !uid) return;
    if (editing) await updateLink(fid, uid, editing.id, data);
    else await addLink(fid, uid, data);
  }, [fid, uid, editing]);

  const handleDelete = useCallback(async () => {
    if (!fid || !uid || !editing) return;
    await deleteLink(fid, uid, editing.id);
  }, [fid, uid, editing]);

  const handleToggle = useCallback(async (l: LinkItem) => {
    if (!fid || !uid) return;
    await updateLink(fid, uid, l.id, { active: !l.active });
  }, [fid, uid]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {links.length === 0 ? (
          <Pressable
            style={({ pressed }) => [s.empty, { borderColor: colors.accentNeon + '20', opacity: pressed ? 0.7 : 1 }]}
            onPress={openNew}
          >
            <Ionicons name="link-outline" size={22} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textMuted }]}>Ersten Link hinzufügen</Text>
          </Pressable>
        ) : (
          <View style={{ gap: 8 }}>
            {links.map((l) => (
              <LinkRow
                key={l.id}
                link={l}
                colors={colors}
                isDark={isDark}
                onEdit={() => openEdit(l)}
                onToggle={() => handleToggle(l)}
                onOpen={() => openLink(l.url)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Floating Add-Button */}
      <Pressable
        style={({ pressed }) => [
          s.fab,
          { backgroundColor: colors.accentNeon, opacity: pressed ? 0.8 : 1 },
          isDark ? neonGlow(colors.accentNeon, 'medium') : null,
        ]}
        onPress={openNew}
      >
        <Ionicons name="add" size={28} color={isDark ? '#000' : '#fff'} />
      </Pressable>

      <LinkModal
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
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 96, gap: 8 },

  empty: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, padding: 24, marginTop: 8,
  },
  emptyText: { fontSize: 14 },

  // Listenzeile
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 10,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowUrl: { fontSize: 12, marginTop: 1 },
  rowAction: { padding: 4 },

  // Floating Action Button
  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },

  // Modal
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' },
  sheet: {
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 3, paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20, gap: 12, paddingTop: 20,
  },
  previewWrap: { alignSelf: 'center', marginBottom: 4 },
  input: { borderWidth: 1.5, borderRadius: 10, padding: 12, fontSize: 14 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleTitle: { fontSize: 14, fontWeight: '600' },
  toggleSub: { fontSize: 11, marginTop: 1 },
  switch: { width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  switchSm: { width: 36, height: 22, borderRadius: 11, padding: 3, justifyContent: 'center' },
  knobSm: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },

  pickerLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  iconRow: { gap: 8, paddingVertical: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#FFFFFF15', backgroundColor: '#FFFFFF08',
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
