/**
 * ArtifactSection.tsx
 *
 * Bereich „Artefakte“ im Tab „Ablage“: Eingabefeld für eine Claude-Artefakt-URL,
 * nach „Hinzufügen“ erscheint eine Karte, die das Artefakt öffnet.
 *
 * Vorschaubild: claude.ai liefert für alle Artefakte dasselbe generische
 * og:image und blockt automatische Browser per Bot-Schutz („Just a moment…“).
 * Ein automatischer Screenshot ist deshalb nicht möglich – auch nicht für
 * öffentliche Artefakte. Der Nutzer wählt stattdessen einmal ein Bild (z. B.
 * einen Screenshot des Artefakts); das funktioniert auch für private Artefakte.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors, neonGlow } from '../utils/theme';
import {
  LinkItem,
  addArtifact,
  deleteLink,
  updateLink,
  openLink,
  pickArtifactPreview,
  setArtifactPreview,
} from '../services/links';
import { parseArtifactUrl } from '../utils/artifactUrl';
import { confirmAction } from './KinderPlanKind';

const ARTIFACT_COLOR = '#D97757';

function showError(msg: string) {
  if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Vorschaubild', msg);
}

// ─── Vorschaubild ───────────────────────────────────────────────────────────

function ArtifactPreview({ image, busy, colors, onPick }: {
  image?: string;
  busy: boolean;
  colors: ThemeColors;
  onPick: () => void;
}) {
  if (image) {
    return (
      <View style={[s.preview, { backgroundColor: colors.background }]}>
        <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {busy && <View style={[StyleSheet.absoluteFill, s.center, s.dim]}><ActivityIndicator color="#fff" /></View>}
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [s.preview, s.placeholder, { backgroundColor: ARTIFACT_COLOR + (pressed ? '28' : '18') }]}
      onPress={onPick}
      disabled={busy}
      accessibilityLabel="Vorschaubild wählen"
    >
      {busy ? <ActivityIndicator color={ARTIFACT_COLOR} /> : (
        <>
          <Ionicons name="image-outline" size={30} color={ARTIFACT_COLOR} />
          <Text style={[s.placeholderTitle, { color: ARTIFACT_COLOR }]}>Vorschaubild wählen</Text>
          <Text style={[s.placeholderText, { color: colors.textMuted }]}>
            Screenshot des Artefakts aus der Galerie – geht auch bei privaten Artefakten
          </Text>
        </>
      )}
    </Pressable>
  );
}

// ─── Karte ──────────────────────────────────────────────────────────────────

function ArtifactCard({ item, familyId, uid, width, colors, isDark, onRename, onDelete }: {
  item: LinkItem;
  familyId: string;
  uid: string;
  width: number | `${number}%`;
  colors: ThemeColors;
  isDark: boolean;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [busy, setBusy] = useState(false);
  const startEdit = () => { setTitle(item.title); setEditing(true); };

  const commit = () => {
    setEditing(false);
    const t = title.trim();
    if (t && t !== item.title) onRename(t);
  };

  const pickImage = async () => {
    setBusy(true);
    try {
      const data = await pickArtifactPreview();
      if (data) await setArtifactPreview(familyId, uid, item.id, data);
    } catch (e) {
      showError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const removeImage = () => confirmAction('Vorschaubild entfernen?', () => {
    setArtifactPreview(familyId, uid, item.id, null).catch((e) => showError(String(e?.message ?? e)));
  }, 'Entfernen');

  return (
    <View style={[
      s.card,
      { width, backgroundColor: colors.surface, borderColor: isDark ? colors.accentNeon + '30' : colors.border },
      isDark ? neonGlow(colors.accentNeon, 'soft') : null,
    ]}>
      {item.previewImage ? (
        <View>
          <Pressable onPress={() => openLink(item.url)} accessibilityLabel={`${item.title} öffnen`}>
            <ArtifactPreview image={item.previewImage} busy={busy} colors={colors} onPick={pickImage} />
          </Pressable>
          <Pressable onPress={removeImage} hitSlop={8} style={s.removeImg} accessibilityLabel="Vorschaubild entfernen">
            <Ionicons name="close" size={16} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <ArtifactPreview busy={busy} colors={colors} onPick={pickImage} />
      )}
      <View style={s.cardFooter}>
        <Ionicons name="sparkles" size={14} color={ARTIFACT_COLOR} />
        {editing ? (
          <TextInput
            style={[s.titleInput, { color: colors.text, borderColor: ARTIFACT_COLOR + '60' }]}
            value={title}
            onChangeText={setTitle}
            onBlur={commit}
            onSubmitEditing={commit}
            autoFocus
            returnKeyType="done"
          />
        ) : (
          <Pressable style={s.cardTitleWrap} onPress={() => openLink(item.url)} onLongPress={startEdit}>
            <Text style={[s.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => openLink(item.url)} hitSlop={8} style={s.iconBtn} accessibilityLabel="Öffnen">
          <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
        </Pressable>
        <Pressable onPress={pickImage} hitSlop={8} style={s.iconBtn} accessibilityLabel={item.previewImage ? 'Vorschaubild ersetzen' : 'Vorschaubild wählen'}>
          <Ionicons name="image-outline" size={18} color={colors.textSecondary} />
        </Pressable>
        <Pressable onPress={startEdit} hitSlop={8} style={s.iconBtn} accessibilityLabel="Umbenennen">
          <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8} style={s.iconBtn} accessibilityLabel="Entfernen">
          <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Bereich ────────────────────────────────────────────────────────────────

export function ArtifactSection({ items, familyId, uid, colors, isDark }: {
  items: LinkItem[];
  familyId: string;
  uid: string;
  colors: ThemeColors;
  isDark: boolean;
}) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { width } = useWindowDimensions();
  const cardWidth = width >= 700 ? '48.5%' : '100%';

  const handleAdd = async () => {
    const parsed = parseArtifactUrl(input);
    if (!parsed) {
      setError('Das ist keine Claude-Artefakt-URL (z. B. claude.ai/public/artifacts/…).');
      return;
    }
    if (items.some((i) => i.url === parsed.url)) {
      setError('Dieses Artefakt ist schon abgelegt.');
      return;
    }
    if (!familyId || !uid) return;
    setSaving(true);
    try {
      await addArtifact(familyId, uid, parsed);
      setInput('');
      setError(null);
    } catch (e) {
      setError(`Speichern fehlgeschlagen: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={[s.inputRow, { backgroundColor: colors.surface, borderColor: (error ? '#FF3B30' : ARTIFACT_COLOR) + '60' }]}>
        <Ionicons name="sparkles-outline" size={18} color={ARTIFACT_COLOR} />
        <TextInput
          style={[s.input, { color: colors.text }]}
          value={input}
          onChangeText={(t) => { setInput(t); if (error) setError(null); }}
          onSubmitEditing={handleAdd}
          placeholder="Artefakt-URL einfügen (claude.ai/…)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
        />
        <Pressable
          style={[s.addBtn, { backgroundColor: ARTIFACT_COLOR, opacity: input.trim() && !saving ? 1 : 0.4 }]}
          onPress={handleAdd}
          disabled={!input.trim() || saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.addBtnText}>Hinzufügen</Text>}
        </Pressable>
      </View>
      {error && <Text style={s.error}>{error}</Text>}

      {items.length === 0 ? (
        <View style={[s.empty, { borderColor: ARTIFACT_COLOR + '40' }]}>
          <Ionicons name="sparkles-outline" size={22} color={colors.textMuted} />
          <Text style={[s.emptyText, { color: colors.textMuted }]}>
            Noch keine Artefakte. Füge oben den Link eines Claude-Artefakts ein.
          </Text>
        </View>
      ) : (
        <View style={s.grid}>
          {items.map((it) => (
            <ArtifactCard
              key={it.id}
              item={it}
              familyId={familyId}
              uid={uid}
              width={cardWidth}
              colors={colors}
              isDark={isDark}
              onRename={(t) => { updateLink(familyId, uid, it.id, { title: t }).catch((e) => console.warn('rename artifact failed', e)); }}
              onDelete={() => confirmAction(`„${it.title}“ entfernen?`, () => {
                deleteLink(familyId, uid, it.id).catch((e) => console.warn('delete artifact failed', e));
              }, 'Löschen')}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderRadius: 14, paddingLeft: 12, padding: 6,
  },
  input: { flex: 1, minWidth: 0, fontSize: 14, paddingVertical: 8 },
  addBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, minWidth: 104, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  error: { color: '#FF3B30', fontSize: 12, marginTop: -4, marginLeft: 4 },

  empty: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, padding: 24,
  },
  emptyText: { fontSize: 14, flexShrink: 1, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  preview: { width: '100%', aspectRatio: 16 / 10, overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
  placeholderTitle: { fontSize: 14, fontWeight: '700' },
  dim: { backgroundColor: 'rgba(0,0,0,0.35)' },
  removeImg: {
    position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)',
  },
  placeholderText: { fontSize: 12, textAlign: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  titleInput: { flex: 1, minWidth: 0, fontSize: 14, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  iconBtn: { padding: 2 },
});
