import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import uuid from 'react-native-uuid';
import { useStore } from '../store';
import { Task, Attachment, Group } from '../types';
import { GroupBadge } from '../components/GroupBadge';
import { AttachmentPreview } from '../components/AttachmentPreview';
import { DatePickerModal } from '../components/DatePickerModal';
import { detectGroup } from '../utils/autoGroup';
import { createCalendarEvent, refreshGoogleToken } from '../services/googleCalendar';
import { useTheme, ThemeColors } from '../utils/theme';
import { formatDate } from '../utils/dateFormat';

export function CreateTaskScreen() {
  const router = useRouter();
  const { groups, settings, addTask, updateTask, updateSettings } = useStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [suggestedGroup, setSuggestedGroup] = useState<Group | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings.autoGroupEnabled || selectedGroupId) {
      setSuggestedGroup(null);
      return;
    }
    if (title.length < 3) {
      setSuggestedGroup(null);
      return;
    }
    const detected = detectGroup(title, description, groups, settings.autoGroupConfidenceThreshold);
    setSuggestedGroup(detected);
  }, [title, description, settings.autoGroupEnabled, selectedGroupId, groups, settings.autoGroupConfidenceThreshold]);

  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Berechtigung fehlt', 'Bitte erlaube den Zugriff auf deine Fotos in den Einstellungen.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newAttachments: Attachment[] = result.assets.map((asset) => ({
        id: uuid.v4() as string,
        taskId: '',
        type: 'image',
        uri: asset.uri,
        name: asset.fileName ?? `image_${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize,
        createdAt: new Date().toISOString(),
      }));
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  const handlePickCamera = useCallback(async () => {
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
        taskId: '',
        type: 'image',
        uri: asset.uri,
        name: `photo_${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        size: asset.fileSize,
        createdAt: new Date().toISOString(),
      };
      setAttachments((prev) => [...prev, att]);
    }
  }, []);

  const handlePickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (!result.canceled) {
      const newAttachments: Attachment[] = result.assets.map((asset) => ({
        id: uuid.v4() as string,
        taskId: '',
        type: 'document',
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size,
        createdAt: new Date().toISOString(),
      }));
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  const handleShowAttachmentOptions = useCallback(() => {
    Alert.alert('Anhang hinzufügen', undefined, [
      { text: 'Foto aufnehmen', onPress: handlePickCamera },
      { text: 'Aus Galerie wählen', onPress: handlePickImage },
      { text: 'Dokument wählen', onPress: handlePickDocument },
      { text: 'Abbrechen', style: 'cancel' },
    ]);
  }, [handlePickCamera, handlePickImage, handlePickDocument]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Titel fehlt', 'Bitte gib einen Titel ein.');
      return;
    }

    setSaving(true);
    const taskId = uuid.v4() as string;
    const effectiveGroupId = selectedGroupId ?? (suggestedGroup?.id ?? null);
    const finalAttachments: Attachment[] = attachments.map((a) => ({ ...a, taskId }));


    const task: Task = {
      id: taskId,
      title: title.trim(),
      description: description.trim(),
      groupId: effectiveGroupId,
      dueDate: dueDate ? dueDate.toISOString() : null,
      completed: false,
      attachments: finalAttachments,
      googleEventId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    addTask(task);

    if (settings.googleCalendarEnabled && settings.googleCalendarId && task.dueDate) {
      if (!settings.googleAccessToken) {
        Alert.alert('Kalender-Sync', 'Kein Google-Token gespeichert. Bitte in den Einstellungen erneut verbinden.');
      } else {
        try {
          let token = settings.googleAccessToken;
          let eventId = await createCalendarEvent(task, token, settings.googleCalendarId);

          if (eventId === null && settings.googleRefreshToken) {
            const newToken = await refreshGoogleToken(settings.googleRefreshToken);
            if (newToken) {
              updateSettings({ googleAccessToken: newToken });
              token = newToken;
              eventId = await createCalendarEvent(task, token, settings.googleCalendarId);
            }
          }

          if (eventId) {
            updateTask(taskId, { googleEventId: eventId });
          } else if (!settings.googleRefreshToken) {
            Alert.alert(
              'Google-Session abgelaufen',
              'Bitte in den Einstellungen "Google Kalender trennen" und anschließend neu verbinden.',
            );
          } else {
            Alert.alert(
              'Kalender-Sync fehlgeschlagen',
              'Task konnte nicht im Google Kalender eingetragen werden. Bitte in den Einstellungen die Google-Verbindung trennen und neu verbinden.',
            );
          }
        } catch (e) {
          console.error('[CalendarSync]', e);
          Alert.alert('Kalender-Sync Fehler', e instanceof Error ? e.message : String(e));
        }
      }
    }

    setSaving(false);
    router.back();
  }, [title, description, selectedGroupId, suggestedGroup, dueDate, attachments, settings, addTask, updateTask, updateSettings, router]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <TextInput
          style={styles.titleInput}
          placeholder="Task-Titel"
          placeholderTextColor={colors.placeholder}
          value={title}
          onChangeText={setTitle}
          autoFocus
          multiline={false}
          returnKeyType="next"
        />
      </View>

      <View style={styles.section}>
        <TextInput
          style={styles.descInput}
          placeholder="Beschreibung (optional)"
          placeholderTextColor={colors.placeholder}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />
      </View>

      {suggestedGroup && !selectedGroupId ? (
        <TouchableOpacity
          style={[styles.suggestion, { borderColor: suggestedGroup.color }]}
          onPress={() => setSelectedGroupId(suggestedGroup.id)}
        >
          <Ionicons name="sparkles-outline" size={14} color={suggestedGroup.color} />
          <Text style={[styles.suggestionText, { color: suggestedGroup.color }]}>
            Vorgeschlagene Gruppe:
          </Text>
          <GroupBadge group={suggestedGroup} small />
          <Text style={styles.suggestionHint}>Tippen zum Übernehmen</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.label}>Gruppe</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupRow}>
          <TouchableOpacity
            style={[styles.groupChip, !selectedGroupId && styles.groupChipSelected]}
            onPress={() => setSelectedGroupId(null)}
          >
            <Text style={[styles.groupChipText, !selectedGroupId && styles.groupChipTextSelected]}>
              Keine
            </Text>
          </TouchableOpacity>
          {groups.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={[
                styles.groupChip,
                selectedGroupId === g.id && { backgroundColor: g.color + '22', borderColor: g.color },
              ]}
              onPress={() => setSelectedGroupId(g.id === selectedGroupId ? null : g.id)}
            >
              <View style={[styles.groupDot, { backgroundColor: g.color }]} />
              <Text
                style={[
                  styles.groupChipText,
                  selectedGroupId === g.id && { color: g.color, fontWeight: '600' },
                ]}
              >
                {g.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Fälligkeitsdatum</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={16} color={dueDate ? colors.text : colors.placeholder} />
          <Text style={[styles.dateBtnText, { color: dueDate ? colors.text : colors.placeholder }]}>
            {dueDate ? formatDate(dueDate.toISOString(), settings.dateFormat) : 'Datum wählen…'}
          </Text>
          {dueDate ? (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); setDueDate(null); }}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
        {settings.googleCalendarEnabled && dueDate ? (
          <View style={styles.calendarHint}>
            <Ionicons name="calendar-outline" size={12} color={colors.accent} />
            <Text style={[styles.calendarHintText, { color: colors.accent }]}>
              Wird mit Google Kalender synchronisiert
            </Text>
          </View>
        ) : null}
      </View>

      <DatePickerModal
        visible={showDatePicker}
        value={dueDate}
        onConfirm={(d) => { setDueDate(d); setShowDatePicker(false); }}
        onCancel={() => setShowDatePicker(false)}
        colors={colors}
      />

      <View style={styles.section}>
        <AttachmentPreview
          attachments={attachments}
          onRemove={handleRemoveAttachment}
          onAdd={handleShowAttachmentOptions}
          editable
        />
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Speichern…' : 'Task anlegen'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, gap: 12, paddingBottom: 60 },
    section: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      gap: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    titleInput: {
      fontSize: 17,
      fontWeight: '600',
      color: c.text,
    },
    descInput: {
      fontSize: 15,
      color: c.text,
      minHeight: 70,
      textAlignVertical: 'top',
    },
    dateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surfaceHigh,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    dateBtnText: {
      flex: 1,
      fontSize: 15,
    },
    calendarHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    calendarHintText: {
      fontSize: 12,
    },
    groupRow: { flexDirection: 'row' },
    groupChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      marginRight: 6,
      gap: 5,
    },
    groupChipSelected: { backgroundColor: c.accent, borderColor: c.accent },
    groupDot: { width: 6, height: 6, borderRadius: 3 },
    groupChipText: { fontSize: 13, color: c.textSecondary },
    groupChipTextSelected: { color: '#fff', fontWeight: '600' },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.surface,
      borderRadius: 10,
      borderWidth: 1,
      padding: 10,
      flexWrap: 'wrap',
    },
    suggestionText: { fontSize: 13, fontWeight: '600' },
    suggestionHint: { fontSize: 12, color: c.textSecondary },
    saveBtn: {
      backgroundColor: c.accent,
      borderRadius: 14,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
