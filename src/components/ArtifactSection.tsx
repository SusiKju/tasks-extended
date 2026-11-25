/**
 * ArtifactSection.tsx
 *
 * Bereich „Artefakte“ im Tab „Ablage“: Eingabefeld für eine Claude-Artefakt-URL,
 * nach „Hinzufügen“ erscheint automatisch eine Karte mit Vorschaubild.
 *
 * Vorschau: Claude liefert für alle Artefakte dasselbe generische og:image,
 * deshalb rendert ein Screenshot-Dienst die Seite (siehe artifactPreviewUrl).
 * Der Dienst schickt anfangs einen Platzhalter, solange der Screenshot
 * entsteht – die Karte lädt das Bild darum ein paar Mal automatisch nach.
 * Private Artefakte (Login nötig) bekommen eine gestaltete Platzhalterkarte.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors, neonGlow } from '../utils/theme';
import { LinkItem, addArtifact, deleteLink, updateLink, openLink } from '../services/links';
import {
  parseArtifactUrl,
  artifactPreviewUrl,
  hasPublicPreview,
  ArtifactKind,
} from '../utils/artifactUrl';
import { confirmAction } from './KinderPlanKind';

const ARTIFACT_COLOR = '#D97757';
/** Nachlade-Zeitpunkte (ms) – bis dahin ist der Screenshot meist fertig. */
const RELOAD_AFTER = [6000, 15000, 35000];

// ─── Vorschaubild ───────────────────────────────────────────────────────────

function ArtifactPreview({ url, kind, colors }: { url: string; kind: ArtifactKind; colors: ThemeColors }) {
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const canPreview = hasPublicPreview(kind);

  useEffect(() => {
    if (!canPreview) return;
    const timers = RELOAD_AFTER.map((ms, i) => setTimeout(() => setAttempt(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [url, canPreview]);

  if (!canPreview || failed) {
    return (
      <View style={[s.preview, s.placeholder, { backgroundColor: ARTIFACT_COLOR + '18' }]}>
        <Ionicons name="image-outline" size={28} color={ARTIFACT_COLOR} />
        <Text style={[s.placeholderText, { color: colors.textMuted }]}>
          Vorschau nicht verfügbar – ist das Artefakt veröffentlicht?
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.preview, { backgroundColor: colors.background }]}>
      <Image
        source={{ uri: artifactPreviewUrl(url, attempt) }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setFailed(true); }}
      />
      {loading && (
        <View style={[StyleSheet.absoluteFill, s.center]}>
          <ActivityIndicator color={ARTIFACT_COLOR} />
        </View>
      )}
    </View>
  );
}

// ─── Karte ──────────────────────────────────────────────────────────────────

function ArtifactCard({ item, width, colors, isDark, onRename, onDelete }: {
  item: LinkItem;
  width: number | `${number}%`;
  colors: ThemeColors;
  isDark: boolean;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const startEdit = () => { setTitle(item.title); setEditing(true); };

  const commit = () => {
    setEditing(false);
    const t = title.trim();
    if (t && t !== item.title) onRename(t);
  };

  return (
    <View style={[
      s.card,
      { width, backgroundColor: colors.surface, borderColor: isDark ? colors.accentNeon + '30' : colors.border },
      isDark ? neonGlow(colors.accentNeon, 'soft') : null,
    ]}>
      <Pressable onPress={() => openLink(item.url)} accessibilityLabel={`${item.title} öffnen`}>
        <ArtifactPreview url={item.url} kind={item.artifactKind ?? 'public'} colors={colors} />
      </Pressable>
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
            Noch keine Artefakte. Füge oben den Link eines veröffentlichten Claude-Artefakts ein.
          </Text>
        </View>
      ) : (
        <View style={s.grid}>
          {items.map((it) => (
            <ArtifactCard
              key={it.id}
              item={it}
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
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  placeholderText: { fontSize: 12, textAlign: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  titleInput: { flex: 1, minWidth: 0, fontSize: 14, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  iconBtn: { padding: 2 },
});
