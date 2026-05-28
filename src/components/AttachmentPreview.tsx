import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { Attachment } from '../types';

interface Props {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
  onAdd?: () => void;
  editable?: boolean;
}

export function AttachmentPreview({ attachments, onRemove, onAdd, editable = false }: Props) {
  const images = attachments.filter((a) => a.type === 'image');
  const docs = attachments.filter((a) => a.type === 'document');

  if (attachments.length === 0 && !editable) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Anhänge</Text>
        {editable && onAdd ? (
          <TouchableOpacity onPress={onAdd} style={styles.addBtn}>
            <Ionicons name="add-circle-outline" size={20} color="#4F86F7" />
            <Text style={styles.addLabel}>Hinzufügen</Text>
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
                  style={styles.removeBtn}
                  onPress={() => onRemove(att.id)}
                  hitSlop={4}
                >
                  <Ionicons name="close-circle" size={18} color="#FF3B30" />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}

      {docs.map((att) => (
        <View key={att.id} style={styles.docRow}>
          <Ionicons name="document-outline" size={18} color="#4F86F7" />
          <View style={styles.docInfo}>
            <Text style={styles.docName} numberOfLines={1}>{att.name}</Text>
            {att.size ? (
              <Text style={styles.docSize}>{formatFileSize(att.size)}</Text>
            ) : null}
          </View>
          {editable && onRemove ? (
            <TouchableOpacity onPress={() => onRemove(att.id)} hitSlop={8}>
              <Ionicons name="close-circle-outline" size={18} color="#FF3B30" />
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      {attachments.length === 0 && editable ? (
        <Text style={styles.emptyHint}>Noch keine Anhänge</Text>
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
  container: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addLabel: {
    fontSize: 14,
    color: '#4F86F7',
    fontWeight: '500',
  },
  imageRow: {
    flexDirection: 'row',
  },
  imageWrapper: {
    position: 'relative',
    marginRight: 8,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
  },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#fff',
    borderRadius: 9,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    padding: 10,
    gap: 8,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: 14,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  docSize: {
    fontSize: 12,
    color: '#8E8E93',
  },
  emptyHint: {
    fontSize: 13,
    color: '#C7C7CC',
    fontStyle: 'italic',
  },
});
