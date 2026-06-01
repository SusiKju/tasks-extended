import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Pressable,
  Platform,
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
import { formatDate, isOverdue, isDueToday, toGoogleDateISO } from '../utils/dateFormat';
import { DatePickerModal } from '../components/DatePickerModal';
import { useTheme, ThemeColors } from '../utils/theme';
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  updateGoogleTask,
  listTaskLists,
} from '../services/googleCalendar';
import { useGoogleTasksSync } from '../hooks/useGoogleTasksSync';

export function TaskDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { tasks, groups, settings, updateTask, deleteTask, toggleTask } = useStore();
  const { syncTasks } = useGoogleTasksSync();
  const { colors } = useTheme();
  const task = tasks.find((t) => t.id === id);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [dueDate, setDueDate] = useState<Date | null>(task?.dueDate ? new Date(task.dueDate) : null);
  const [dueTime, setDueTime] = useState(task?.dueTime ?? '');
  const [important, setImportant] = useState(task?.important ?? false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [groupId, setGroupId] = useState(task?.groupId ?? null);

  const handleSave = useCallback(async () => {
    if (!task) return;
    if (!title.trim()) {
      Alert.alert('Titel fehlt', 'Bitte gib einen Titel ein.');
      return;
    }

    const validTime = /^\d{2}:\d{2}$/.test(dueTime.trim()) ? dueTime.trim() : null;
    const updates = {
      title: title.trim(),
      description: description.trim(),
      groupId,
      dueDate: dueDate ? dueDate.toISOString() : null,
      dueTime: validTime,
      important,
    };

    updateTask(id, updates);

    if (settings.googleCalendarEnabled && settings.googleAccessToken) {
      const token = settings.googleAccessToken;
      const updatedTask = { ...task, ...updates };

      // Push to Google Tasks API (primary sync target)
      if (task.googleEventId) {
        const lists = await listTaskLists(token).catch(() => []);
        const taskListId = lists[0]?.id;
        if (taskListId) {
          const gtUpdates: Parameters<typeof updateGoogleTask>[3] = {
            title: updates.title,
            notes: updates.description,
          };
          if (updates.dueDate) {
            gtUpdates.due = toGoogleDateISO(updates.dueDate);
          }
          await updateGoogleTask(token, taskListId, task.googleEventId, gtUpdates).catch(() => {});
        }
      }

      // Calendar event: update or create as secondary display (no ID stored back)
      if (settings.googleCalendarId && updatedTask.dueDate) {
        if (task.googleEventId) {
          updateCalendarEvent(updatedTask, token, settings.googleCalendarId, task.googleEventId).catch(() => {});
        } else {
          createCalendarEvent(updatedTask, token, settings.googleCalendarId).catch(() => {});
        }
      }
    }

    setEditing(false);
  }, [title, description, groupId, dueDate, id, task, settings, updateTask]);

  const handleToggle = useCallback(async () => {
    if (!task) return;
    const newCompleted = !task.completed;
    toggleTask(id);

    if (!settings.googleCalendarEnabled || !settings.googleAccessToken || !task.googleEventId) return;

    const token = settings.googleAccessToken;

    // Push status to Google Tasks API
    const lists = await listTaskLists(token).catch(() => []);
    const taskListId = lists[0]?.id;
    if (taskListId) {
      await updateGoogleTask(token, taskListId, task.googleEventId, {
        status: newCompleted ? 'completed' : 'needsAction',
      }).catch(() => {});
    }

    // Also sync Calendar event (best-effort)
    if (settings.googleCalendarId && task.dueDate) {
      updateCalendarEvent(
        { ...task, completed: newCompleted },
        token,
        settings.googleCalendarId,
        task.googleEventId
      ).catch(() => {});
    }
  }, [id, task, toggleTask, settings]);

  const handleDelete = useCallback(() => {
    if (!task) return;
    const doDelete = async () => {
      if (task.googleEventId && settings.googleAccessToken && settings.googleCalendarId) {
        await deleteCalendarEvent(settings.googleAccessToken, settings.googleCalendarId, task.googleEventId).catch(() => {});
      }
      deleteTask(id);
      setTimeout(() => syncTasks().catch(() => {}), 300);
      router.back();
    };
    if (Platform.OS === 'web') {
      if ((window as any).confirm(`"${task.title}" löschen?`)) doDelete();
    } else {
      Alert.alert('Task löschen', 'Diesen Task wirklich löschen?', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [id, task, settings, deleteTask, syncTasks, router]);

  const handleAddAttachment = useCallback(() => {
    if (!task) return;
    const currentAttachments = task.attachments ?? [];
    Alert.alert('Anhang hinzufügen', undefined, [
      {
        text: 'Foto aufnehmen',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Berechtigung fehlt', 'Bitte erlaube den Kamerazugriff in den Einstellungen.');
              return;
            }
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
              updateTask(id, { attachments: [...currentAttachments, att] });
            }
          } catch {
            Alert.alert('Fehler', 'Foto konnte nicht aufgenommen werden.');
          }
        },
      },
      {
        text: 'Aus Galerie',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Berechtigung fehlt', 'Bitte erlaube den Zugriff auf deine Fotos in den Einstellungen.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.8 });
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
              updateTask(id, { attachments: [...currentAttachments, ...newAtts] });
            }
          } catch {
            Alert.alert('Fehler', 'Bilder konnten nicht geladen werden.');
          }
        },
      },
      {
        text: 'Dokument',
        onPress: async () => {
          try {
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
              updateTask(id, { attachments: [...currentAttachments, ...newAtts] });
            }
          } catch {
            Alert.alert('Fehler', 'Dokument konnte nicht geladen werden.');
          }
        },
      },
      { text: 'Abbrechen', style: 'cancel' },
    ]);
  }, [id, task, updateTask]);

  const handleRemoveAttachment = useCallback(
    (attId: string) => {
      if (!task) return;
      updateTask(id, { attachments: (task.attachments ?? []).filter((a) => a.id !== attId) });
    },
    [id, task, updateTask]
  );

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Important Banner */}
      {task.important && !editing && (
        <View style={styles.importantBanner}>
          <Ionicons name="flag" size={14} color="#fff" />
          <Text style={styles.importantBannerText}>Wichtig</Text>
        </View>
      )}

      {/* Header controls */}
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.toggleBtn} onPress={handleToggle}>
          <Ionicons
            name={task.completed ? 'checkmark-circle' : 'ellipse-outline'}
            size={28}
            color={task.completed ? colors.success : colors.textMuted}
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
                <Ionicons name="close-outline" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={[styles.iconBtn, styles.saveIconBtn]}>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={handleDelete} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
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
            placeholderTextColor={colors.placeholder}
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
          <Ionicons name="folder-outline" size={16} color={colors.textSecondary} />
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
            color={overdue ? colors.danger : dueToday ? colors.warning : colors.textSecondary}
          />
          {editing ? (
            <Pressable style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={14} color={dueDate ? colors.text : colors.placeholder} />
              <Text style={[styles.dateBtnText, { color: dueDate ? colors.text : colors.placeholder }]}>
                {dueDate ? formatDate(dueDate.toISOString(), settings.dateFormat) : 'Datum wählen…'}
              </Text>
              {dueDate ? (
                <Pressable onPress={() => setDueDate(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={14} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </Pressable>
          ) : task.dueDate ? (
            <Text style={[styles.metaText, overdue && styles.overdue, dueToday && styles.dueToday]}>
              {formatDate(task.dueDate, settings.dateFormat)}
              {overdue ? ' · Überfällig' : dueToday ? ' · Heute fällig' : ''}
            </Text>
          ) : (
            <Text style={styles.metaEmpty}>Kein Datum</Text>
          )}
        </View>

        {/* Uhrzeit */}
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
          {editing ? (
            <TextInput
              style={[styles.timeInput, { color: dueTime ? colors.text : colors.placeholder }]}
              placeholder="Uhrzeit (HH:MM)"
              placeholderTextColor={colors.placeholder}
              value={dueTime}
              onChangeText={(t) => {
                let v = t.replace(/[^0-9:]/g, '');
                if (v.length === 2 && !v.includes(':') && dueTime.length === 1) v = v + ':';
                if (v.length <= 5) setDueTime(v);
              }}
              keyboardType="numeric"
              maxLength={5}
            />
          ) : task.dueTime ? (
            <Text style={styles.metaText}>{task.dueTime} Uhr</Text>
          ) : (
            <Text style={styles.metaEmpty}>Keine Uhrzeit</Text>
          )}
        </View>

        {/* Important Toggle (Edit-Mode) */}
        {editing && (
          <TouchableOpacity
            style={[styles.importantToggle, important && styles.importantToggleActive]}
            onPress={() => setImportant((v) => !v)}
          >
            <Ionicons name={important ? 'flag' : 'flag-outline'} size={15} color={important ? '#fff' : '#FF3B30'} />
            <Text style={[styles.importantToggleText, important && styles.importantToggleTextActive]}>
              {important ? 'Als wichtig markiert' : 'Als wichtig markieren'}
            </Text>
          </TouchableOpacity>
        )}

        {task.googleEventId ? (
          <View style={styles.metaRow}>
            <Ionicons name="calendar" size={16} color={colors.accent} />
            <Text style={[styles.metaText, { color: colors.accent }]}>Mit Google Kalender synchronisiert</Text>
          </View>
        ) : null}
      </View>

      {/* Attachments */}
      <View style={styles.card}>
        <AttachmentPreview
          attachments={task.attachments ?? []}
          onRemove={handleRemoveAttachment}
          onAdd={handleAddAttachment}
          editable
        />
      </View>

      <DatePickerModal
        visible={showDatePicker}
        value={dueDate}
        onConfirm={(d) => { setDueDate(d); setShowDatePicker(false); }}
        onCancel={() => setShowDatePicker(false)}
        colors={colors}
      />
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, gap: 12, paddingBottom: 60 },
    notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    notFoundText: { fontSize: 17, color: c.textSecondary },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    toggleLabel: { fontSize: 15, fontWeight: '500', color: c.text },
    topActions: { flexDirection: 'row', gap: 8 },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 1,
    },
    saveIconBtn: { backgroundColor: c.success, borderColor: c.success },
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      gap: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    title: { fontSize: 20, fontWeight: '700', color: c.text },
    completedTitle: { textDecorationLine: 'line-through', color: c.textSecondary },
    titleInput: { fontSize: 20, fontWeight: '700', color: c.text },
    description: { fontSize: 15, color: c.text, lineHeight: 22 },
    descInput: { fontSize: 15, color: c.text, minHeight: 60, textAlignVertical: 'top' },
    empty: { fontSize: 14, color: c.textMuted, fontStyle: 'italic' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    metaText: { fontSize: 14, color: c.text },
    metaEmpty: { fontSize: 14, color: c.textMuted },
    metaChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      marginRight: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaChipActive: { backgroundColor: c.accent, borderColor: c.accent },
    metaChipText: { fontSize: 13, color: c.textSecondary },
    metaChipTextActive: { color: '#fff', fontWeight: '600' },
    dot: { width: 6, height: 6, borderRadius: 3 },
    dateBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.surfaceHigh,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    dateBtnText: {
      flex: 1,
      fontSize: 14,
    },
    importantBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#FF3B30',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    importantBannerText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#fff',
      letterSpacing: 0.3,
    },
    timeInput: {
      flex: 1,
      fontSize: 14,
      backgroundColor: c.surfaceHigh,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    importantToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderColor: '#FF3B30',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    importantToggleActive: {
      backgroundColor: '#FF3B30',
      borderColor: '#FF3B30',
    },
    importantToggleText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#FF3B30',
    },
    importantToggleTextActive: {
      color: '#fff',
    },
  });
}
