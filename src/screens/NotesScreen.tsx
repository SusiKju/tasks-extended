import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  StyleSheet,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { Note, NoteChecklistItem, QuickNote } from '../types';
import { DatePickerModal } from '../components/DatePickerModal';
import { formatDate, isOverdue, isDueToday } from '../utils/dateFormat';
import { useTheme, ThemeColors, neonGlow, readableTextOn } from '../utils/theme';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useFamily } from '../hooks/useFamily';
import {
  subscribeToPersonalNotes,
  addPersonalNote,
  updatePersonalNote,
  deletePersonalNote,
} from '../services/personalNotesService';
import {
  subscribeToQuickNotes,
  addQuickNote,
  deleteQuickNote,
} from '../services/quickNotesService';

const NOTE_COLORS = [
  { value: '#F0C040', label: 'Amber' },
  { value: '#52B87A', label: 'Smaragd' },
  { value: '#E8607A', label: 'Koralle' },
  { value: '#4A94C8', label: 'Stahl' },
  { value: '#A878E0', label: 'Violett' },
  { value: '#E87C3E', label: 'Kupfer' },
];

// TE-139: Rot des Wichtig-Labels (Toggle-Icon + Punkt in der Pille).
const IMPORTANT_RED = '#EF4444';

const COLUMNS = 3;
const GRID_PADDING = 12;
const GRID_GAP = 6;
const SCREEN_WIDTH = Dimensions.get('window').width;
const NOTE_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

type SortOrder = 'newest' | 'oldest';

// TE-140: Fälligkeits-Gruppe für die Sortierung – überfällig (0) → heute (1) →
// später (2) → ohne Datum (3).
function dueRank(note: Note): number {
  if (!note.dueDate) return 3;
  if (isOverdue(note.dueDate)) return 0;
  if (isDueToday(note.dueDate)) return 1;
  return 2;
}

// ─── Note Modal ───────────────────────────────────────────────────────────────

interface NoteModalProps {
  visible: boolean;
  note: Note | null;
  onSave: (
    title: string,
    content: string,
    color: string,
    groupId: string | null,
    pinned: boolean,
    important: boolean,
    dueDate: string | null,
    checklist?: NoteChecklistItem[],
  ) => void;
  onClose: () => void;
  onDelete: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}

function NoteModal({ visible, note, onSave, onClose, onDelete, colors, styles }: NoteModalProps) {
  const { mono } = useTheme();
  const groups = useStore((s) => s.groups);
  const settings = useStore((s) => s.settings);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0].value);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [important, setImportant] = useState(false);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isChecklist, setIsChecklist] = useState(false);
  const [checklistItems, setChecklistItems] = useState<NoteChecklistItem[]>([]);

  React.useEffect(() => {
    if (visible) {
      setTitle(note?.title ?? '');
      setContent(note?.content ?? '');
      setSelectedColor(note?.color ?? NOTE_COLORS[0].value);
      setSelectedGroupId(note?.groupId ?? null);
      setPinned(note?.pinned ?? false);
      setImportant(note?.important ?? false);
      setDueDate(note?.dueDate ?? null);
      const hasList = (note?.checklist?.length ?? 0) > 0;
      setIsChecklist(hasList);
      setChecklistItems(note?.checklist ? [...note.checklist] : [{ text: '', checked: false }]);
    }
  }, [visible, note]);

  const handleSave = useCallback(() => {
    if (isChecklist) {
      const validItems = checklistItems.filter((i) => i.text.trim());
      if (validItems.length === 0) {
        Alert.alert('Inhalt fehlt', 'Bitte mindestens einen Eintrag hinzufügen.');
        return;
      }
      const c = validItems.map((i) => `${i.checked ? '☑' : '☐'} ${i.text}`).join('\n');
      onSave(title.trim(), c, selectedColor, selectedGroupId, pinned, important, dueDate, validItems);
    } else {
      const trimmed = content.trim();
      if (!trimmed) {
        Alert.alert('Inhalt fehlt', 'Bitte einen Text eingeben.');
        return;
      }
      onSave(title.trim(), trimmed, selectedColor, selectedGroupId, pinned, important, dueDate, undefined);
    }
  }, [title, content, selectedColor, selectedGroupId, pinned, important, dueDate, isChecklist, checklistItems, onSave]);

  const addChecklistItem = useCallback(() => {
    setChecklistItems((prev) => [...prev, { text: '', checked: false }]);
  }, []);

  const updateChecklistItem = useCallback((index: number, text: string) => {
    setChecklistItems((prev) => prev.map((item, i) => i === index ? { ...item, text } : item));
  }, []);

  const toggleChecklistItem = useCallback((index: number) => {
    setChecklistItems((prev) => prev.map((item, i) => i === index ? { ...item, checked: !item.checked } : item));
  }, []);

  const removeChecklistItem = useCallback((index: number) => {
    setChecklistItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.modalContainer, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalClose}>
            <Text style={[styles.modalCloseText, { color: colors.textSecondary }]}>Abbrechen</Text>
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {note ? 'Notiz bearbeiten' : 'Neue Notiz'}
          </Text>
          <View style={styles.modalActions}>
            {note ? (
              <Pressable onPress={onDelete} style={styles.pinBtn} hitSlop={8}>
                <Ionicons name="trash-outline" size={22} color={colors.textSecondary} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => setIsChecklist((v) => !v)} style={styles.pinBtn} hitSlop={8}>
              <Ionicons
                name={isChecklist ? 'checkbox' : 'checkbox-outline'}
                size={22}
                color={isChecklist ? colors.accent : colors.textSecondary}
              />
            </Pressable>
            <Pressable onPress={() => setImportant((v) => !v)} style={styles.pinBtn} hitSlop={8}>
              <Ionicons
                name={important ? 'alert-circle' : 'alert-circle-outline'}
                size={22}
                color={important ? IMPORTANT_RED : colors.textSecondary}
              />
            </Pressable>
            <Pressable onPress={() => setPinned((p) => !p)} style={styles.pinBtn} hitSlop={8}>
              <Ionicons
                name={pinned ? 'pin' : 'pin-outline'}
                size={22}
                color={pinned ? colors.accent : colors.textSecondary}
              />
            </Pressable>
            <Pressable onPress={handleSave} style={styles.modalSave}>
              <Text style={[styles.modalSaveText, { color: colors.accent }]}>Speichern</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.notePreview, { backgroundColor: selectedColor }]}>
          <TextInput
            style={styles.noteTitleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Überschrift (optional)"
            placeholderTextColor="rgba(0,0,0,0.3)"
            multiline={false}
            returnKeyType="next"
          />
          {isChecklist ? (
            <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
              {checklistItems.map((item, index) => (
                <View key={index} style={styles.checklistEditRow}>
                  <Pressable onPress={() => toggleChecklistItem(index)} hitSlop={8}>
                    <Ionicons
                      name={item.checked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={item.checked ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.7)'}
                    />
                  </Pressable>
                  <TextInput
                    style={[styles.checklistEditInput, item.checked && styles.checklistEditInputDone]}
                    value={item.text}
                    onChangeText={(t) => updateChecklistItem(index, t)}
                    placeholder="Eintrag…"
                    placeholderTextColor="rgba(0,0,0,0.3)"
                    onSubmitEditing={addChecklistItem}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />
                  <Pressable onPress={() => removeChecklistItem(index)} hitSlop={8}>
                    <Ionicons name="close" size={18} color="rgba(0,0,0,0.3)" />
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.checklistAddBtn} onPress={addChecklistItem}>
                <Ionicons name="add" size={18} color="rgba(0,0,0,0.5)" />
                <Text style={styles.checklistAddText}>Eintrag hinzufügen</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <TextInput
              style={styles.noteInput}
              value={content}
              onChangeText={setContent}
              placeholder="Notiz schreiben…"
              placeholderTextColor="rgba(0,0,0,0.3)"
              multiline
              autoFocus={!note}
              textAlignVertical="top"
            />
          )}
        </View>

        <View style={styles.modalSection}>
          <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Farbe</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
            {NOTE_COLORS.map((c) => (
              <Pressable
                key={c.value}
                style={[styles.colorDot, { backgroundColor: c.value }, selectedColor === c.value && styles.colorDotSelected]}
                onPress={() => setSelectedColor(c.value)}
              >
                {selectedColor === c.value && <Ionicons name="checkmark" size={16} color="rgba(0,0,0,0.5)" />}
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.modalSection}>
          <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Gruppe</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupRow}>
            <Pressable
              style={[styles.groupChip, { borderColor: colors.border, backgroundColor: selectedGroupId === null ? colors.accent : colors.surface }]}
              onPress={() => setSelectedGroupId(null)}
            >
              <Text style={[styles.groupChipText, { color: selectedGroupId === null ? colors.accentFg : colors.textSecondary }]}>Keine</Text>
            </Pressable>
            {groups.map((g) => (
              <Pressable
                key={g.id}
                style={[styles.groupChip, { borderColor: mono(g.color), backgroundColor: selectedGroupId === g.id ? mono(g.color) : colors.surface }]}
                onPress={() => setSelectedGroupId(g.id)}
              >
                <Text style={[styles.groupChipText, { color: selectedGroupId === g.id ? readableTextOn(mono(g.color)) : colors.text }]}>{g.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* TE-140: Fälligkeitsdatum */}
        <View style={styles.modalSection}>
          <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Fällig am</Text>
          <Pressable
            style={[styles.dueBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={16} color={dueDate ? colors.text : colors.textSecondary} />
            <Text style={[styles.dueBtnText, { color: dueDate ? colors.text : colors.textSecondary }]}>
              {dueDate ? formatDate(dueDate, settings.dateFormat) : 'Datum wählen…'}
            </Text>
            {dueDate ? (
              <Pressable onPress={(e) => { e.stopPropagation?.(); setDueDate(null); }} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={showDatePicker}
        value={dueDate ? new Date(dueDate) : null}
        onConfirm={(d) => {
          // Lokaler Mittag verhindert Tagesverschiebung durch Zeitzonen.
          setDueDate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString());
          setShowDatePicker(false);
        }}
        onCancel={() => setShowDatePicker(false)}
        colors={colors}
      />
    </Modal>
  );
}

// ─── Note Card ────────────────────────────────────────────────────────────────

interface NoteCardProps {
  note: Note;
  onPress: () => void;
  onToggleItem: (index: number) => void;
  groupName?: string;
  groupColor?: string;
  styles: ReturnType<typeof makeStyles>;
}

function NoteCard({ note, onPress, onToggleItem, groupName, groupColor, styles }: NoteCardProps) {
  const { mono, colors } = useTheme();
  const settings = useStore((s) => s.settings);
  const maxItems = note.title ? 3 : 4;
  const dueOverdue = isOverdue(note.dueDate ?? null);

  const sortedChecklist = note.checklist
    ? [...note.checklist.map((item, originalIndex) => ({ ...item, originalIndex }))]
        .sort((a, b) => Number(a.checked) - Number(b.checked))
    : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.noteCard, { backgroundColor: note.color }, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
    >
      {/* Badges */}
      <View style={styles.cardBadgeRow}>
        {note.important ? <View style={styles.importantDot} /> : null}
        {note.pinned ? <Ionicons name="pin" size={11} color="rgba(0,0,0,0.5)" /> : null}
      </View>

      {note.title ? (
        <Text style={styles.noteCardTitle} numberOfLines={2}>{note.title}</Text>
      ) : null}

      {sortedChecklist && sortedChecklist.length > 0 ? (
        <View style={styles.checklistPreview}>
          {sortedChecklist.slice(0, maxItems).map((item, i) => (
            <Pressable
              key={i}
              style={styles.checklistRow}
              onPress={(e) => { e.stopPropagation?.(); onToggleItem(item.originalIndex); }}
              hitSlop={6}
            >
              <Ionicons
                name={item.checked ? 'checkbox' : 'square-outline'}
                size={12}
                color={item.checked ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.65)'}
              />
              <Text
                style={[styles.checklistText, item.checked && styles.checklistTextDone]}
                numberOfLines={1}
              >
                {item.text}
              </Text>
            </Pressable>
          ))}
          {sortedChecklist.length > maxItems ? (
            <Text style={styles.checklistMore}>+{sortedChecklist.length - maxItems} weitere</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.noteCardText} numberOfLines={note.title ? 5 : 8}>
          {note.content}
        </Text>
      )}

      {note.dueDate ? (
        <View style={styles.cardDueBadge}>
          <Ionicons
            name="calendar-outline"
            size={11}
            color={dueOverdue ? IMPORTANT_RED : 'rgba(0,0,0,0.6)'}
          />
          <Text style={[styles.cardDueText, dueOverdue && { color: IMPORTANT_RED }]} numberOfLines={1}>
            {formatDate(note.dueDate, settings.dateFormat)}
          </Text>
        </View>
      ) : null}

      {groupName ? (
        <View style={[styles.noteGroupBadge, { backgroundColor: mono(groupColor ?? '#888') }]}>
          <Text style={[styles.noteGroupText, { color: readableTextOn(mono(groupColor ?? '#888')) }]} numberOfLines={1}>
            {groupName}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ label, colors }: { label: string; colors: ThemeColors }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Quick Notes Section (TE-148) ─────────────────────────────────────────────
// Bewusst simpler Abschnitt oberhalb der komplexen Notizen: nur Text, kein Datum.
// Neue Notiz über das Eingabefeld oben, Löschen über das ✕ je Zeile.

interface QuickNotesSectionProps {
  notes: QuickNote[];
  onAdd: (text: string) => void;
  onDelete: (note: QuickNote) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}

function QuickNotesSection({ notes, onAdd, onDelete, colors, styles }: QuickNotesSectionProps) {
  const [draft, setDraft] = useState('');

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft('');
  }, [draft, onAdd]);

  return (
    <View style={styles.quickSection}>
      <SectionHeader label="⚡ Schnelle Notizen" colors={colors} />
      <View style={[styles.quickCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Eingabe */}
        <View style={styles.quickAddRow}>
          <Ionicons name="add" size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.quickInput, { color: colors.text }]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Schnelle Notiz…"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={submit}
            returnKeyType="done"
            blurOnSubmit={false}
          />
          {draft.trim() ? (
            <Pressable onPress={submit} hitSlop={8}>
              <Text style={[styles.quickAddText, { color: colors.accent }]}>Sichern</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Liste */}
        {notes.length === 0 ? (
          <Text style={[styles.quickEmpty, { color: colors.textMuted }]}>
            Noch keine schnellen Notizen
          </Text>
        ) : (
          notes.map((n, i) => (
            <View
              key={n.id}
              style={[styles.quickRow, i < notes.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={[styles.quickBullet, { backgroundColor: colors.textMuted }]} />
              <Text style={[styles.quickText, { color: colors.text }]}>{n.text}</Text>
              <Pressable onPress={() => onDelete(n)} hitSlop={8} style={styles.quickDelete}>
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

// ─── Notes Screen ─────────────────────────────────────────────────────────────

export function NotesScreen() {
  const { colors, isDark, mono } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const groups = useStore((s) => s.groups);
  const { user } = useFirebaseAuth();
  const { familyId } = useFamily();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  // TE-148: schnelle Notizen (eigener Firestore-Store, unabhängig von den komplexen Notizen)
  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);

  // Firestore-Echtzeit-Abo
  useEffect(() => {
    if (!familyId || !user?.uid) return;
    setLoading(true);
    const unsub = subscribeToPersonalNotes(familyId, user.uid, (n) => {
      setNotes(n);
      setLoading(false);
    });
    // loading zurücksetzen falls subscription sofort fehlschlägt
    const loadingGuard = setTimeout(() => setLoading(false), 5000);
    return () => { unsub(); clearTimeout(loadingGuard); };
  }, [familyId, user?.uid]);

  // TE-148: Echtzeit-Abo der schnellen Notizen
  useEffect(() => {
    if (!familyId || !user?.uid) return;
    const unsub = subscribeToQuickNotes(familyId, user.uid, setQuickNotes);
    return unsub;
  }, [familyId, user?.uid]);

  const handleAddQuick = useCallback(
    (text: string) => {
      if (!familyId || !user?.uid) return;
      addQuickNote(familyId, user.uid, text).catch((err) =>
        Alert.alert('Fehler beim Speichern', err?.message ?? String(err)),
      );
    },
    [familyId, user?.uid],
  );

  const handleDeleteQuick = useCallback(
    (note: QuickNote) => {
      if (!familyId || !user?.uid) return;
      deleteQuickNote(familyId, user.uid, note.id).catch((err) =>
        Alert.alert('Fehler beim Löschen', err?.message ?? String(err)),
      );
    },
    [familyId, user?.uid],
  );

  const [modalVisible, setModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [filterColor, setFilterColor] = useState<string | null>(null);
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const groupMap = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);

  const sortedNotes = useMemo(() => {
    let list = [...notes];
    if (filterColor) list = list.filter((n) => n.color === filterColor);
    if (filterGroupId) list = list.filter((n) => n.groupId === filterGroupId);
    list.sort((a, b) => {
      // TE-139: wichtige Notizen zuerst.
      if (!!a.important !== !!b.important) return a.important ? -1 : 1;
      // TE-140: dann nach Fälligkeits-Gruppe (überfällig → heute → später → ohne Datum).
      const ra = dueRank(a), rb = dueRank(b);
      if (ra !== rb) return ra - rb;
      // Innerhalb einer Gruppe mit Datum: früheres Datum zuerst.
      if (a.dueDate && b.dueDate) {
        const da = new Date(a.dueDate).getTime();
        const db = new Date(b.dueDate).getTime();
        if (da !== db) return da - db;
      }
      // Sonst nach Erstelldatum (gewählte Sortierrichtung).
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? tb - ta : ta - tb;
    });
    return list;
  }, [notes, filterColor, filterGroupId, sortOrder]);

  const pinnedNotes = useMemo(() => sortedNotes.filter((n) => n.pinned), [sortedNotes]);
  const unpinnedNotes = useMemo(() => sortedNotes.filter((n) => !n.pinned), [sortedNotes]);

  const usedColors = useMemo(() => {
    const set = new Set(notes.map((n) => n.color));
    return NOTE_COLORS.filter((c) => set.has(c.value));
  }, [notes]);

  const usedGroups = useMemo(() => {
    const set = new Set(notes.map((n) => n.groupId).filter(Boolean));
    return groups.filter((g) => set.has(g.id));
  }, [notes, groups]);

  const handleAdd = useCallback(() => {
    setEditingNote(null);
    setModalVisible(true);
  }, []);

  const handleEdit = useCallback((note: Note) => {
    setEditingNote(note);
    setModalVisible(true);
  }, []);

  const handleDelete = useCallback(
    (note: Note) => {
      if (!familyId || !user?.uid) return;
      const doDelete = () =>
        deletePersonalNote(familyId, user.uid!, note.id).catch((err) =>
          Alert.alert('Fehler beim Löschen', err?.message ?? String(err)),
        );
      // Alert funktioniert auf Web nicht — window.confirm als Fallback.
      if (Platform.OS === 'web') {
        if (window.confirm('Diese Notiz wirklich löschen?')) doDelete();
      } else {
        Alert.alert('Notiz löschen', 'Diese Notiz wirklich löschen?', [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Löschen', style: 'destructive', onPress: doDelete },
        ]);
      }
    },
    [familyId, user?.uid],
  );

  const handleToggleItem = useCallback(
    (note: Note, itemIndex: number) => {
      if (!note.checklist || !familyId || !user?.uid) return;
      const updated = note.checklist.map((item, i) =>
        i === itemIndex ? { ...item, checked: !item.checked } : item,
      );
      updatePersonalNote(familyId, user.uid, note.id, { checklist: updated }).catch(() => {});
    },
    [familyId, user?.uid],
  );

  const handleSave = useCallback(
    (
      title: string,
      content: string,
      color: string,
      groupId: string | null,
      pinned: boolean,
      important: boolean,
      dueDate: string | null,
      checklist?: NoteChecklistItem[],
    ) => {
      if (!familyId || !user?.uid) return;
      const now = new Date().toISOString();
      if (editingNote) {
        updatePersonalNote(familyId, user.uid, editingNote.id, {
          title: title || undefined,
          content,
          color,
          groupId,
          pinned,
          important,
          dueDate,
          checklist: checklist && checklist.length > 0 ? checklist : undefined,
        }).catch((err) => Alert.alert('Fehler beim Speichern', err?.message ?? String(err)));
      } else {
        addPersonalNote(familyId, user.uid, {
          title: title || undefined,
          content,
          color,
          groupId: groupId ?? null,
          pinned,
          important,
          dueDate,
          checklist: checklist && checklist.length > 0 ? checklist : undefined,
          createdAt: now,
          updatedAt: now,
        }).catch((err) => Alert.alert('Fehler beim Speichern', err?.message ?? String(err)));
      }
      setModalVisible(false);
    },
    [editingNote, familyId, user?.uid],
  );

  const renderGrid = useCallback(
    (list: Note[]) => {
      const rows: Note[][] = [];
      for (let i = 0; i < list.length; i += COLUMNS) rows.push(list.slice(i, i + COLUMNS));
      return rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.gridRow}>
          {row.map((note) => {
            const group = note.groupId ? groupMap[note.groupId] : undefined;
            return (
              <NoteCard
                key={note.id}
                note={note}
                onPress={() => handleEdit(note)}
                onToggleItem={(idx) => handleToggleItem(note, idx)}
                groupName={group?.name}
                groupColor={group?.color}
                styles={styles}
              />
            );
          })}
        </View>
      ));
    },
    [groupMap, handleEdit, handleToggleItem, styles],
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {/* TE-148: Schnelle Notizen – eigener, simpler Abschnitt oberhalb der komplexen Notizen */}
      <QuickNotesSection
        notes={quickNotes}
        onAdd={handleAddQuick}
        onDelete={handleDeleteQuick}
        colors={colors}
        styles={styles}
      />

      {/* Filter + sort bar */}
      <View style={styles.filterBar}>
        <View style={styles.filterTopRow}>
          {usedColors.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRowInline} style={{ flex: 1 }}>
              <Pressable
                style={[styles.filterDot, filterColor === null && styles.filterDotActive, { borderColor: colors.border }]}
                onPress={() => setFilterColor(null)}
              >
                <Ionicons name="apps" size={14} color={filterColor === null ? colors.accent : colors.textSecondary} />
              </Pressable>
              {usedColors.map((c) => (
                <Pressable
                  key={c.value}
                  style={[styles.filterDot, { backgroundColor: c.value }, filterColor === c.value && styles.filterDotActive]}
                  onPress={() => setFilterColor(filterColor === c.value ? null : c.value)}
                />
              ))}
            </ScrollView>
          )}
          <Pressable
            onPress={() => setSortOrder((s) => (s === 'newest' ? 'oldest' : 'newest'))}
            style={[styles.sortChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Ionicons
              name={sortOrder === 'newest' ? 'arrow-down' : 'arrow-up'}
              size={13}
              color={colors.textSecondary}
            />
            <Text style={[styles.sortChipText, { color: colors.textSecondary }]}>
              {sortOrder === 'newest' ? 'Neueste' : 'Älteste'}
            </Text>
          </Pressable>
        </View>

        {usedGroups.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <Pressable
              style={[styles.groupFilterChip, filterGroupId === null && { backgroundColor: colors.accent }]}
              onPress={() => setFilterGroupId(null)}
            >
              <Text style={[styles.groupFilterText, { color: filterGroupId === null ? colors.accentFg : colors.textSecondary }]}>Alle</Text>
            </Pressable>
            {usedGroups.map((g) => (
              <Pressable
                key={g.id}
                style={[styles.groupFilterChip, filterGroupId === g.id && { backgroundColor: mono(g.color) }]}
                onPress={() => setFilterGroupId(filterGroupId === g.id ? null : g.id)}
              >
                <Text style={[styles.groupFilterText, { color: filterGroupId === g.id ? readableTextOn(mono(g.color)) : colors.textSecondary }]}>{g.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Content (komplexe Notizen) */}
      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : sortedNotes.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Noch keine Notizen</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            Tippe auf + um eine neue Notiz zu erstellen
          </Text>
        </View>
      ) : (
        <>
          {pinnedNotes.length > 0 && (
            <>
              <SectionHeader label="📌 Angeheftet" colors={colors} />
              <View style={styles.grid}>{renderGrid(pinnedNotes)}</View>
            </>
          )}
          {unpinnedNotes.length > 0 && (
            <>
              {pinnedNotes.length > 0 && <SectionHeader label="Notizen" colors={colors} />}
              <View style={styles.grid}>{renderGrid(unpinnedNotes)}</View>
            </>
          )}
        </>
      )}
      </ScrollView>

      <Pressable style={[styles.fab, { backgroundColor: 'transparent' }]} onPress={handleAdd}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <NoteModal
        visible={modalVisible}
        note={editingNote}
        onSave={handleSave}
        onClose={() => setModalVisible(false)}
        onDelete={() => {
          if (editingNote) handleDelete(editingNote);
          setModalVisible(false);
        }}
        colors={colors}
        styles={styles}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    // TE-148: Schnelle Notizen
    quickSection: { paddingBottom: 4 },
    quickCard: {
      marginHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    quickAddRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    quickInput: { flex: 1, fontSize: 15, paddingVertical: 2 },
    quickAddText: { fontSize: 14, fontWeight: '600' },
    quickEmpty: { fontSize: 13, paddingVertical: 12, textAlign: 'center' },
    quickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 9,
    },
    quickBullet: { width: 6, height: 6, borderRadius: 3 },
    quickText: { flex: 1, fontSize: 15, lineHeight: 20 },
    quickDelete: { padding: 2 },
    filterBar: { paddingTop: 8, gap: 4 },
    filterTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 8,
    },
    filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
    // Innerhalb der filterTopRow (die bereits 16px Gutter hat) – kein doppeltes H-Padding
    filterRowInline: { gap: 8, paddingBottom: 4 },
    filterDot: {
      width: 32, height: 32, borderRadius: 16,
      borderWidth: 2, borderColor: 'transparent',
      alignItems: 'center', justifyContent: 'center',
    },
    filterDotActive: { borderColor: c.text },
    sortChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 14, borderWidth: 1,
    },
    sortChipText: { fontSize: 12, fontWeight: '500' },
    groupFilterChip: {
      paddingHorizontal: 12, paddingVertical: 5,
      borderRadius: 14, backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border,
    },
    groupFilterText: { fontSize: 13, fontWeight: '500' },
    scrollContent: { paddingBottom: 100 },
    grid: { paddingHorizontal: GRID_PADDING, gap: GRID_GAP },
    gridRow: { flexDirection: 'row', gap: GRID_GAP, marginBottom: 0 },
    noteCard: {
      width: NOTE_WIDTH,
      minHeight: 90,
      borderRadius: 10,
      padding: 8,
      justifyContent: 'space-between',
      marginBottom: GRID_GAP,
    },
    cardBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginBottom: 4,
      minHeight: 14,
    },
    importantDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: IMPORTANT_RED,
    },
    noteCardTitle: {
      fontSize: 11, fontWeight: '700',
      color: 'rgba(0,0,0,0.85)', marginBottom: 3,
    },
    checklistEditRow: {
      flexDirection: 'row', alignItems: 'center',
      gap: 8, marginBottom: 6,
    },
    checklistEditInput: {
      flex: 1, fontSize: 15,
      color: 'rgba(0,0,0,0.85)',
      paddingVertical: 2,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.15)',
    },
    checklistEditInputDone: {
      textDecorationLine: 'line-through',
      color: 'rgba(0,0,0,0.35)',
    },
    checklistAddBtn: {
      flexDirection: 'row', alignItems: 'center',
      gap: 6, paddingVertical: 6, marginTop: 2,
    },
    checklistAddText: {
      fontSize: 14, color: 'rgba(0,0,0,0.45)',
    },
    noteCardText: {
      fontSize: 12, color: 'rgba(0,0,0,0.8)',
      lineHeight: 17, flex: 1,
    },
    checklistPreview: { gap: 3, flex: 1 },
    checklistRow: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
    },
    checklistText: {
      fontSize: 11, color: 'rgba(0,0,0,0.75)', flex: 1,
    },
    checklistTextDone: {
      textDecorationLine: 'line-through', color: 'rgba(0,0,0,0.35)',
    },
    checklistMore: {
      fontSize: 11, color: 'rgba(0,0,0,0.4)', marginTop: 2,
    },
    noteGroupBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 8, marginTop: 8,
    },
    noteGroupText: { fontSize: 11, color: '#fff', fontWeight: '600' },
    empty: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      gap: 8, paddingHorizontal: 40, marginTop: 80,
    },
    emptyTitle: { fontSize: 17, fontWeight: '600', marginTop: 12 },
    emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    fab: {
      position: 'absolute', bottom: 28, right: 20,
      width: 56, height: 56, borderRadius: 28,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: c.accentNeon,
      ...neonGlow(c.accentNeon, 'hard'),
    },
    modalContainer: { flex: 1 },
    modalHeader: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    modalClose: { minWidth: 80 },
    modalCloseText: { fontSize: 16 },
    modalTitle: { fontSize: 17, fontWeight: '600' },
    modalActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pinBtn: { padding: 4 },
    modalSave: { alignItems: 'flex-end' },
    modalSaveText: { fontSize: 16, fontWeight: '600' },
    notePreview: {
      margin: 16, borderRadius: 12,
      padding: 16, minHeight: 160,
    },
    noteTitleInput: {
      fontSize: 17, fontWeight: '700',
      color: 'rgba(0,0,0,0.85)',
      marginBottom: 8,
      borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)',
      paddingBottom: 8,
    },
    noteInput: {
      fontSize: 16, color: 'rgba(0,0,0,0.85)',
      minHeight: 120, lineHeight: 22,
    },
    modalSection: { paddingHorizontal: 16, paddingBottom: 12 },
    modalSectionLabel: {
      fontSize: 13, fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
    },
    colorRow: { gap: 10 },
    colorDot: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: 'transparent',
    },
    colorDotSelected: { borderColor: 'rgba(0,0,0,0.3)' },
    groupRow: { gap: 8 },
    groupChip: {
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 16, borderWidth: 1,
    },
    groupChipText: { fontSize: 14, fontWeight: '500' },
    dueBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 1,
    },
    dueBtnText: { fontSize: 14, fontWeight: '500' },
    cardDueBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 4,
      alignSelf: 'flex-start',
    },
    cardDueText: { fontSize: 10, fontWeight: '600', color: 'rgba(0,0,0,0.6)' },
  });
}
