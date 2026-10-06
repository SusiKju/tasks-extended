import React, { useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { TaskCard } from '../components/TaskCard';
import { useTheme, ThemeColors, neonGlow } from '../utils/theme';
import { Scratchpad, ScratchEntry, prependScratch } from '../components/Scratchpad';
import { useScratchpad } from '../hooks/useScratchpad';
import { IdeasSection } from '../components/IdeasSection';
import { addQuickNote } from '../services/quickNotesService';
import { useFamily } from '../hooks/useFamily';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';

export function TaskListScreen() {
  const tasks = useStore((st) => st.tasks);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { familyId } = useFamily();
  const { user } = useFirebaseAuth();

  // TE-104: persönliche Aufgaben (Scratchpad) – hier voll bearbeitbar.
  const {
    scratchpad,
    onChange: onScratchpadChange,
    history: scratchpadHistory,
    archiveNote,
    removeHistory,
    clearHistory,
  } = useScratchpad();
  const scratchAddRef = useRef<(() => void) | null>(null);

  // TE-3: Idee → Aufgabe. Frischer Store-Wert statt Closure, damit eine
  // gerade getippte Aufgabe nicht überschrieben wird.
  // ponytail: Aufgaben-Save ist 1,5 s debounced, die Idee wird sofort gelöscht –
  // wird die App in diesem Fenster beendet, ist der Text weg. Flush-Save, falls das auffällt.
  const ideaToTask = useCallback((text: string) => {
    onScratchpadChange(prependScratch(useStore.getState().scratchpad, text));
  }, [onScratchpadChange]);

  // TE-3: Aufgabe → Idee (Datum entfällt, Ideen haben keins).
  const taskToIdea = useCallback((entry: ScratchEntry) => {
    if (!familyId || !user?.uid) return;
    addQuickNote(familyId, user.uid, entry.text).catch(() => {});
  }, [familyId, user?.uid]);

  // TE-23: kein Filter mehr – immer nur offene Google Tasks.
  const filtered = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* ── Google Tasks (TE-3: nur Anzeige, gepflegt wird in Google) ── */}
        <View style={styles.groupCard}>
          <View style={styles.groupHeader}>
            <Ionicons name="logo-google" size={16} color={colors.text} />
            <Text style={styles.groupTitle}>Google Tasks</Text>
            {/* TE-22: sichtbarer Hinweis, dass hier nichts bearbeitet wird. */}
            <View style={styles.readOnlyBadge}>
              <Ionicons name="lock-closed" size={11} color={colors.textSecondary} />
              <Text style={styles.readOnlyText}>Nur lesen</Text>
            </View>
          </View>

          <View style={styles.groupBody}>
            {filtered.length === 0 ? (
              <View style={styles.emptyInline}>
                <Ionicons name="checkmark-done-circle-outline" size={44} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Keine offenen Google Tasks</Text>
                <Text style={styles.emptySubtitle}>Angelegt wird in Google Tasks – hier erscheinen sie nach dem Sync.</Text>
              </View>
            ) : (
              <View style={[styles.mergedList, styles.readOnlyList]}>
                {filtered.map((item, i) => (
                  <TaskCard key={item.id} task={item} isLast={i === filtered.length - 1} />
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Aufgaben (TE-3: ehemals Personal Tasks) ── */}
        <View style={styles.groupCard}>
          <View style={styles.groupHeader}>
            <Ionicons name="checkbox-outline" size={18} color={colors.text} />
            <Text style={styles.groupTitle}>Aufgaben</Text>
            <TouchableOpacity
              onPress={() => scratchAddRef.current?.()}
              style={styles.bigAddBtn}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={26} color={isDark ? colors.accentNeon : '#fff'} />
            </TouchableOpacity>
          </View>
          <View style={styles.groupBody}>
            <Scratchpad
              value={scratchpad}
              onChange={onScratchpadChange}
              isDark={isDark}
              colors={colors}
              registerAdd={(fn) => { scratchAddRef.current = fn; }}
              history={scratchpadHistory}
              onArchive={archiveNote}
              onRemoveHistory={removeHistory}
              onClearHistory={clearHistory}
              onToIdea={taskToIdea}
            />
          </View>
        </View>

        {/* ── Ideen (TE-3: ehemals Notizen) ── */}
        <IdeasSection onToTask={ideaToTask} />
      </ScrollView>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    // TE-117: flexGrow, damit die Tasks-Karte unten den Rest der Bildschirmhöhe
    // füllen kann, statt nackten Leerraum unter den Karten zu lassen.
    scrollContent: { paddingTop: 4, paddingBottom: 32, flexGrow: 1 },
    // TE-105/TE-106: gemeinsamer Box-Look für die zwei klar getrennten Bereiche.
    groupCard: {
      marginHorizontal: 12,
      marginTop: 10,
      marginBottom: 2,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    // Header sitzt oben in der Box, durch eine Trennlinie klar vom Inhalt abgesetzt.
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surfaceHigh,
    },
    groupBody: { padding: 12, gap: 8 },
    groupTitle: { fontSize: 16, fontWeight: '700', color: c.text, flex: 1 },
    // TE-109: verschmolzene, gerahmte Liste (gleicher Look wie der Notizblock).
    mergedList: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: c.surface,
    },
    // TE-22: Read-only-Kennzeichnung der Google-Tasks-Box.
    readOnlyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    readOnlyText: { fontSize: 11, fontWeight: '600', color: c.textSecondary },
    readOnlyList: { borderStyle: 'dashed' },
    // Großer, einheitlicher +-Button (ersetzt FAB + kleinen Notizblock-+).
    // Look identisch zum vorherigen FAB: Neon-Rahmen+Glow im Dark, gefüllt im Light.
    bigAddBtn: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? 'transparent' : c.accent,
      borderWidth: isDark ? 1.5 : 0,
      borderColor: c.accentNeon,
      ...(isDark ? neonGlow(c.accentNeon, 'hard') : {}),
    },
    // Leere Task-Liste innerhalb der Tasks-Box (TE-104/TE-106).
    emptyInline: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingTop: 24,
      paddingBottom: 24,
    },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: c.textSecondary },
    emptySubtitle: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 40,
    },
  });
}
