import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import uuid from 'react-native-uuid';
import { useStore } from '../store';
import { Attachment } from '../types';
import { GroupBadge } from '../components/GroupBadge';
import { AttachmentPreview } from '../components/AttachmentPreview';
import { formatDate, isOverdue, isDueToday } from '../utils/dateFormat';
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from '../services/googleCalendar';

export function TaskDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { tasks, groups, settings, updateTask, deleteTask, toggleTask } = useStore();
  const task = tasks.find((t) => t.id === id);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate?.split('T')[0] ?? '');
  const [groupId, setGroupId] = useState(task?.groupId ?? null);

  if (!task) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>Task nicht gefunden</Text>
      </View>
    );
  }

  const group = groups.find((g) => g.id === task.groupId) ?? null;
  const overdue = isOverdue(task.dueDate) && !task.completed;
  const dueToday = isDueToday(task.dueDate) && !task.completed;

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Titel fehlt', 'Bitte gib einen Titel ein.');
      return;
    }

    const updates = {
      title: title.trim(),
      description: description.trim(),
      groupId,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    };

    updateTask(id, updates);

    // Sync calendar if enabled
    if (settings.googleCalendarEnabled && settings.googleAccessToken && settings.googleCalendarId) {
      const updatedTask = { ...task, ...updates };
      if (task.googleEventId) {
        await updateCalendarEvent(updatedTask, settings.googleAccessToken, settings.googleCalendarId, task.googleEventId).catch(() => {});
      } else if (updatedTask.dueDate) {
        const eventId = await createCalendarEvent(updatedTask, settings.googleAccessToken, settings.googleCalendarId).catch(() => null);
        if (eventId) updateTask(id, { googleEventId: eventId });
      }
    }

    setEditing(false);
  }, [title, description, groupId, dueDate, id, task, settings, updateTask]);

  const handleDelete = useCallback(() => {
    Alert.alert('Task löschen', 'Diesen Task wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          if (task.googleEventId && settings.googleAccessToken && settings.googleCalendarId) {
            await deleteCalendarEvent(settings.googleAccessToken, settings.googleCalendarId, task.googleEventId).catch(() => {});
          }
          deleteTask(id);
          router.back();
        },
      },
    ]);
  }, [id, task, settings, deleteTask, navigation]);

  const handleAddAttachment = useCallback(() => {
    Alert.alert('Anhang hinzufügen', undefined, [
      {
        text: 'Foto aufnehmen',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const att: Attachment = {
              id: uuid.v4() as string,
              taskId: id,
              type: 'image',
              uri: asset.uri,
              name: `photo_${Date.now()}.jpg`,
              mimeType: 'image/jpeg',
              size: asset.fileSize,
              createdAt: new Date().toISOString(),
            };
            updateTask(id, { attachments: [...task.attachments, att] });
          }
        },
      },
      {
        text: 'Aus Galerie',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') return;
          const result = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, quality: 0.8 });
          if (!result.canceled) {
            const newAtts: Attachment[] = result.assets.map((asset) => ({
              id: uuid.v4() as string,
              taskId: id,
              type: 'image',
              uri: asset.uri,
              name: asset.fileName ?? `image_${Date.now()}.jpg`,
              mimeType: asset.mimeType ?? 'image/jpeg',
              size: asset.fileSize,
              createdAt: new Date().toISOString(),
            }));
            updateTask(id, { attachments: [...task.attachments, ...newAtts] });
          }
        },
      },
      {
        text: 'Dokument',
        onPress: async () => {
          const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
          if (!result.canceled) {
            const newAtts: Attachment[] = result.assets.map((asset) => ({
              id: uuid.v4() as string,
              taskId: id,
              type: 'document',
              uri: asset.uri,
              name: asset.name,
              mimeType: asset.mimeType ?? 'application/octet-stream',
              size: asset.size,
              createdAt: new Date().toISOString(),
            }));
            updateTask(id, { attachments: [...task.attachments, ...newAtts] });
          }
        },
      },
      { text: 'Abbrechen', style: 'cancel' },
    ]);
  }, [id, task, updateTask]);

  const handleRemoveAttachment = useCallback(
    (attId: string) => {
      updateTask(id, { attachments: task.attachments.filter((a) => a.id !== attId) });
    },
    [id, task, updateTask]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header controls */}
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.toggleBtn} onPress={() => toggleTask(id)}>
          <Ionicons
            name={task.completed ? 'checkmark-circle' : 'ellipse-outline'}
            size={28}
            color={task.completed ? '#34C759' : '#C7C7CC'}
          />
          <Text style={styles.toggleLabel}>{task.completed ? 'Erledigt' : 'Offen'}</Text>
        </TouchableOpacity>

        <View style={styles.topActions}>
          {!editing ? (
            <TouchableOpacity onPress={() => setEditing(true)} style={styles.iconBtn}>
              <Ionicons name="pencil-outline" size={20} color="#4F86F7" />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity onPress={() => setEditing(false)} style={styles.iconBtn}>
                <Ionicons name="close-outline" size={22} color="#8E8E93" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={[styles.iconBtn, styles.saveIconBtn]}>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={handleDelete} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Title */}
      <View style={styles.card}>
        {editing ? (
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            autoFocus
            multiline={false}
          />
        ) : (
          <Text style={[styles.title, task.completed && styles.completedTitle]}>{task.title}</Text>
        )}
      </View>

      {/* Description */}
      <View style={styles.card}>
        {editing ? (
          <TextInput
            style={styles.descInput}
            value={description}
            onChangeText={setDescription}
            placeholder="Beschreibung"
            placeholderTextColor="#C7C7CC"
            multiline
          />
        ) : task.description ? (
          <Text style={styles.description}>{task.description}</Text>
        ) : (
          <Text style={styles.empty}>Keine Beschreibung</Text>
        )}
      </View>

      {/* Meta */}
      <View style={styles.card}>
        <View style={styles.metaRow}>
          <Ionicons name="folder-outline" size={16} color="#8E8E93" />
          {editing ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.metaChip, !groupId && styles.metaChipActive]}
                onPress={() => setGroupId(null)}
              >
                <Text style={[styles.metaChipText, !groupId && styles.metaChipTextActive]}>Keine</Text>
              </TouchableOpacity>
              {groups.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.metaChip, groupId === g.id && { backgroundColor: g.color + '22', borderColor: g.color }]}
                  onPress={() => setGroupId(g.id)}
                >
                  <View style={[styles.dot, { backgroundColor: g.color }]} />
                  <Text style={[styles.metaChipText, groupId === g.id && { color: g.color }]}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : group ? (
            <GroupBadge group={group} small />
          ) : (
            <Text style={styles.metaEmpty}>Keine Gruppe</Text>
          )}
        </View>

        <View style={styles.metaRow}>
          <Ionicons
            name="calendar-outline"
            size={16}
            color={overdue ? '#FF3B30' : dueToday ? '#FF9500' : '#8E8E93'}
          />
          {editing ? (
            <TextInput
              style={styles.dateInput}
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#C7C7CC"
              keyboardType="numbers-and-punctuation"
            />
          ) : task.dueDate ? (
            <Text style={[styles.metaText, overdue && styles.overdue, dueToday && styles.dueToday]}>
              {formatDate(task.dueDate, settings.dateFormat)}
              {overdue ? ' · Überfällig' : dueToday ? ' · Heute fällig' : ''}
            </Text>
          ) : (
            <Text style={styles.metaEmpty}>Kein Datum</Text>
          )}
        </View>

        {task.googleEventId ? (
          <View style={styles.metaRow}>
            <Ionicons name="calendar" size={16} color="#4F86F7" />
            <Text style={[styles.metaText, { color: '#4F86F7' }]}>Mit Google Kalender synchronisiert</Text>
          </View>
        ) : null}
      </View>

      {/* Attachments */}
      <View style={styles.card}>
        <AttachmentPreview
          attachments={task.attachments}
          onRemove={handleRemoveAttachment}
          onAdd={handleAddAttachment}
          editable
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  content: { padding: 16, gap: 12, paddingBottom: 60 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: 17, color: '#8E8E93' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: { fontSize: 15, fontWeight: '500', color: '#3C3C43' },
  topActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  saveIconBtn: { backgroundColor: '#34C759' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
  completedTitle: { textDecorationLine: 'line-through', color: '#8E8E93' },
  titleInput: { fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
  description: { fontSize: 15, color: '#3C3C43', lineHeight: 22 },
  descInput: { fontSize: 15, color: '#1C1C1E', minHeight: 60, textAlignVertical: 'top' },
  empty: { fontSize: 14, color: '#C7C7CC', fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 14, color: '#3C3C43' },
  metaEmpty: { fontSize: 14, color: '#C7C7CC' },
  overdue: { color: '#FF3B30', fontWeight: '600' },
  dueToday: { color: '#FF9500', fontWeight: '600' },
  metaChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaChipActive: { backgroundColor: '#1C1C1E', borderColor: '#1C1C1E' },
  metaChipText: { fontSize: 13, color: '#3C3C43' },
  metaChipTextActive: { color: '#fff', fontWeight: '600' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dateInput: {
    flex: 1,
    fontSize: 14,
    color: '#1C1C1E',
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
