import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Attachment } from '../types';
import { useTheme } from '../utils/theme';

interface Props {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
  onAdd?: () => void;
  editable?: boolean;
}

export function AttachmentPreview({ attachments, onRemove, onAdd, editable = false }: Props) {
  const { colors } = useTheme();
  const images = attachments.filter((a) => a.type === 'image');
  const docs = attachments.filter((a) => a.type === 'document');

  if (attachments.length === 0 && !editable) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Anhänge</Text>
        {editable && onAdd ? (
          <TouchableOpacity onPress={onAdd} style={styles.addBtn}>
            <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
            <Text style={[styles.addLabel, { color: colors.accent }]}>Hinzufügen</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {images.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
          {images.map((att) => (
            <View key={att.id} style={styles.imageWrapper}>
              <Image source={{ uri: att.uri }} style={styles.thumbnail} />
              {editable && onRemove ? (
                <TouchableOpacity
                  style={[styles.removeBtn, { backgroundColor: colors.surface }]}
                  onPress={() => onRemove(att.id)}
                  hitSlop={4}
                >
                  <Ionicons name="close-circle" size={18} color={colors.danger} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}

      {docs.map((att) => (
        <View key={att.id} style={[styles.docRow, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
          <Ionicons name="document-outline" size={18} color={colors.accent} />
          <View style={styles.docInfo}>
            <Text style={[styles.docName, { color: colors.text }]} numberOfLines={1}>{att.name}</Text>
            {att.size ? (
              <Text style={[styles.docSize, { color: colors.textSecondary }]}>{formatFileSize(att.size)}</Text>
            ) : null}
          </View>
          {editable && onRemove ? (
            <TouchableOpacity onPress={() => onRemove(att.id)} hitSlop={8}>
              <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      {attachments.length === 0 && editable ? (
        <Text style={[styles.emptyHint, { color: colors.textMuted }]}>Noch keine Anhänge</Text>
      ) : null}
    </View>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addLabel: { fontSize: 14, fontWeight: '500' },
  imageRow: { flexDirection: 'row' },
  imageWrapper: { position: 'relative', marginRight: 8 },
  thumbnail: { width: 80, height: 80, borderRadius: 8 },
  removeBtn: { position: 'absolute', top: -6, right: -6, borderRadius: 9 },
  docRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, padding: 10, gap: 8 },
  docInfo: { flex: 1 },
  docName: { fontSize: 14, fontWeight: '500' },
  docSize: { fontSize: 12 },
  emptyHint: { fontSize: 13, fontStyle: 'italic' },
});
