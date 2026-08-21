/**
 * SchuleScreen.tsx
 * Eltern-Ansicht: Stundenplan pro Kind ansehen und pflegen. Mobile-first als
 * Tagesansicht (heutiger Wochentag vorausgewählt) statt Wochenraster, damit
 * auf dem Handy immer der relevante Tag im Fokus steht.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { de } from 'date-fns/locale';
import { useTheme, readableTextOn } from '../utils/theme';
import { useFamily } from '../hooks/useFamily';
import { useStore } from '../store';
import {
  PERIODS, DAY_NAMES, DAY_SHORT, subjectColor,
  TimetableEntry, TimetableMap, PeriodTimesMap,
  key, todayDayIndex, subscribeToTimetable, setTimetableEntry, replaceTimetable,
  applyPeriodTimes, subscribeToPeriodTimes, setPeriodTime,
} from '../services/timetable';
import { GradesMap, subscribeToGrades, replaceGrades } from '../services/grades';
import { JournalData, subscribeToJournal, replaceJournal } from '../services/journal';
import { fetchBesteSchuleTimetable, fetchBesteSchuleGrades, fetchBesteSchuleJournal } from '../services/besteSchule';

type SyncState = { status: 'idle' | 'syncing' | 'done' | 'error'; message?: string };
type ScreenView = 'plan' | 'noten' | 'klassenbuch';

const EMPTY_JOURNAL: JournalData = { homework: [], substitutions: [] };

function journalDayLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return 'Heute';
  if (isTomorrow(d)) return 'Morgen';
  return format(d, 'EEEE, dd.MM.', { locale: de });
}

export default function SchuleScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { familyId, children: familyChildren } = useFamily();
  const fid = familyId ?? '';
  const settings = useStore((st) => st.settings);

  const [selectedChild, setSelectedChild] = useState('');
  const [view, setView] = useState<ScreenView>('plan');
  const [timetableByChild, setTimetableByChild] = useState<Record<string, TimetableMap>>({});
  const [periodTimesByChild, setPeriodTimesByChild] = useState<Record<string, PeriodTimesMap>>({});
  const [gradesByChild, setGradesByChild] = useState<Record<string, GradesMap>>({});
  const [journalByChild, setJournalByChild] = useState<Record<string, JournalData>>({});
  const [selectedDay, setSelectedDay] = useState(() => {
    const t = todayDayIndex();
    return t >= 0 ? t : 0;
  });

  // Bei jedem Öffnen des Tabs auf den heutigen Wochentag springen (auch wenn
  // die Tab-Komponente seit dem letzten Besuch durchgehend gemountet blieb
  // und der Tag inzwischen gewechselt hat, oder zuvor manuell umgeschaltet wurde).
  useFocusEffect(
    useCallback(() => {
      const t = todayDayIndex();
      setSelectedDay(t >= 0 ? t : 0);
    }, [])
  );
  const [editing, setEditing] = useState<{ nr: number | string; slotKey: string } | null>(null);
  const [fFach, setFFach] = useState('');
  const [fRaum, setFRaum] = useState('');
  const [fLehrer, setFLehrer] = useState('');
  const [editingTime, setEditingTime] = useState<{ nr: number | string; start: string; end: string } | null>(null);

  useEffect(() => {
    if (familyChildren.length > 0 && !selectedChild) setSelectedChild(familyChildren[0].id);
  }, [familyChildren, selectedChild]);

  useEffect(() => {
    if (!fid || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToTimetable(fid, child.id, (map) => {
        setTimetableByChild((prev) => ({ ...prev, [child.id]: map }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [fid, familyChildren]);

  useEffect(() => {
    if (!fid || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToPeriodTimes(fid, child.id, (map) => {
        setPeriodTimesByChild((prev) => ({ ...prev, [child.id]: map }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [fid, familyChildren]);

  useEffect(() => {
    if (!fid || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToGrades(fid, child.id, (map) => {
        setGradesByChild((prev) => ({ ...prev, [child.id]: map }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [fid, familyChildren]);

  useEffect(() => {
    if (!fid || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToJournal(fid, child.id, (data) => {
        setJournalByChild((prev) => ({ ...prev, [child.id]: data }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [fid, familyChildren]);

  const timetable = timetableByChild[selectedChild] ?? {};
  const grades = gradesByChild[selectedChild] ?? {};
  const journal = journalByChild[selectedChild] ?? EMPTY_JOURNAL;
  const todayIdx = todayDayIndex();
  const linkedStudentId = settings.besteSchuleStudentIds?.[selectedChild];
  const isLinked = !!linkedStudentId;

  // Zeiten/Pausen sind bei beste.schule-Kindern durch den Sync vorgegeben;
  // manuell gepflegte Kinder (andere Schule, andere Taktung) können sie
  // pro Stunde überschreiben (periodTimesByChild), sonst gilt der Default.
  const periods = isLinked ? PERIODS : applyPeriodTimes(PERIODS, periodTimesByChild[selectedChild] ?? {});

  // Bei synchronisierten Kindern (read-only) leere Zeilen am Tagesende weglassen
  // – nichts zum Antippen/Eintragen, also keine Zeile wert. Bei manuell
  // gepflegten Kindern bleiben alle Stunden sichtbar (Tippen legt eine an).
  const lastFilledIdx = periods.reduce((last, p, idx) => {
    if (p.pause) return last;
    return timetable[key(selectedDay, p.nr)] ? idx : last;
  }, -1);
  const visiblePeriods = isLinked ? periods.slice(0, lastFilledIdx + 1) : periods;

  // Live-Sync mit beste.schule: bei jedem Öffnen des Tabs (Focus) neu holen,
  // kein manuelles Aktualisieren nötig. Nur für Kinder mit hinterlegter
  // Schüler-ID (Einstellungen) – alle anderen bleiben rein manuell gepflegt.
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle' });
  useFocusEffect(
    useCallback(() => {
      if (!isLinked || !fid || !selectedChild) return;
      if (!settings.besteSchuleToken) {
        setSyncState({ status: 'error', message: 'Kein beste.schule-Token hinterlegt (Einstellungen).' });
        return;
      }
      let cancelled = false;
      setSyncState({ status: 'syncing' });
      Promise.all([
        fetchBesteSchuleTimetable(settings.besteSchuleToken, linkedStudentId!)
          .then((map) => replaceTimetable(fid, selectedChild, map)),
        fetchBesteSchuleGrades(settings.besteSchuleToken, linkedStudentId!)
          .then((map) => replaceGrades(fid, selectedChild, map)),
        fetchBesteSchuleJournal(settings.besteSchuleToken, linkedStudentId!)
          .then((data) => replaceJournal(fid, selectedChild, data)),
      ])
        .then(() => { if (!cancelled) setSyncState({ status: 'done' }); })
        .catch((e) => { if (!cancelled) setSyncState({ status: 'error', message: e?.message ?? String(e) }); });
      return () => { cancelled = true; };
    }, [isLinked, fid, selectedChild, settings.besteSchuleToken, linkedStudentId])
  );

  const openEditor = useCallback((nr: number | string, slotKey: string) => {
    if (isLinked) return; // synchronisierte Kinder werden nicht manuell bearbeitet
    const entry = timetable[slotKey];
    setFFach(entry?.fach ?? '');
    setFRaum(entry?.raum ?? '');
    setFLehrer(entry?.lehrer ?? '');
    setEditing({ nr, slotKey });
  }, [timetable, isLinked]);

  const closeEditor = useCallback(() => setEditing(null), []);

  const handleSave = useCallback(async () => {
    if (!editing || !fid || !selectedChild) return;
    const fach = fFach.trim();
    const entry: TimetableEntry | null = fach
      ? { fach, raum: fRaum.trim(), lehrer: fLehrer.trim() }
      : null;
    await setTimetableEntry(fid, selectedChild, editing.slotKey, entry);
    setEditing(null);
  }, [editing, fid, selectedChild, fFach, fRaum, fLehrer]);

  const handleClear = useCallback(async () => {
    if (!editing || !fid || !selectedChild) return;
    await setTimetableEntry(fid, selectedChild, editing.slotKey, null);
    setEditing(null);
  }, [editing, fid, selectedChild]);

  const openTimeEditor = useCallback((nr: number | string, start: string, end: string) => {
    if (isLinked) return; // Zeiten von beste.schule-Kindern kommen aus dem Sync
    setEditingTime({ nr, start, end });
  }, [isLinked]);

  const closeTimeEditor = useCallback(() => setEditingTime(null), []);

  const timeValid = !!editingTime
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(editingTime.start)
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(editingTime.end);

  const handleSaveTime = useCallback(async () => {
    if (!editingTime || !fid || !selectedChild || !timeValid) return;
    await setPeriodTime(fid, selectedChild, editingTime.nr, editingTime.start, editingTime.end);
    setEditingTime(null);
  }, [editingTime, fid, selectedChild, timeValid]);

  const handleResetTime = useCallback(async () => {
    if (!editingTime || !fid || !selectedChild) return;
    await setPeriodTime(fid, selectedChild, editingTime.nr, '', '');
    setEditingTime(null);
  }, [editingTime, fid, selectedChild]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={s.container}>
      {/* Kind-Auswahl */}
      <View style={s.childRow}>
        {familyChildren.map((child) => {
          const isSelected = child.id === selectedChild;
          return (
            <TouchableOpacity
              key={child.id}
              style={[s.childChip, isSelected && { backgroundColor: child.color }]}
              onPress={() => setSelectedChild(child.id)}
            >
              <Text style={[s.childName, isSelected && { color: readableTextOn(child.color) }]}>
                {child.emoji ? `${child.emoji} ` : ''}{child.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Ansicht umschalten – nur relevant für synchronisierte Kinder (Noten kommen nur von dort) */}
      {isLinked && (
        <View style={s.viewToggle}>
          <TouchableOpacity
            style={[s.viewToggleBtn, view === 'plan' && s.viewToggleBtnActive]}
            onPress={() => setView('plan')}
          >
            <Text style={[s.viewToggleText, view === 'plan' && s.viewToggleTextActive]}>Stundenplan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.viewToggleBtn, view === 'noten' && s.viewToggleBtnActive]}
            onPress={() => setView('noten')}
          >
            <Text style={[s.viewToggleText, view === 'noten' && s.viewToggleTextActive]}>Noten</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.viewToggleBtn, view === 'klassenbuch' && s.viewToggleBtnActive]}
            onPress={() => setView('klassenbuch')}
          >
            <Text style={[s.viewToggleText, view === 'klassenbuch' && s.viewToggleTextActive]}>Klassenbuch</Text>
          </TouchableOpacity>
        </View>
      )}

      {view === 'klassenbuch' ? (
        <View style={s.section}>
          <Text style={s.klassenbuchTitle}>Vertretungen</Text>
          {journal.substitutions.length === 0 ? (
            <Text style={s.lessonEmpty}>Keine Vertretungen bekannt.</Text>
          ) : (
            journal.substitutions.map((n, i) => (
              <View key={i} style={s.journalRow}>
                <Text style={s.journalDate}>{journalDayLabel(n.date)}</Text>
                <View style={s.journalBody}>
                  {n.fach && (
                    <View style={s.lessonHead}>
                      <View style={[s.lessonDot, { backgroundColor: subjectColor(n.fach) }]} />
                      <Text style={s.lessonFach}>{n.fach}</Text>
                    </View>
                  )}
                  <Text style={s.journalText}>{n.text}</Text>
                </View>
              </View>
            ))
          )}
          <Text style={[s.klassenbuchTitle, { marginTop: 14 }]}>Hausaufgaben</Text>
          {journal.homework.length === 0 ? (
            <Text style={s.lessonEmpty}>Keine offenen Hausaufgaben.</Text>
          ) : (
            journal.homework.map((n, i) => (
              <View key={i} style={s.journalRow}>
                <Text style={s.journalDate}>{journalDayLabel(n.date)}</Text>
                <View style={s.journalBody}>
                  {n.fach && (
                    <View style={s.lessonHead}>
                      <View style={[s.lessonDot, { backgroundColor: subjectColor(n.fach) }]} />
                      <Text style={s.lessonFach}>{n.fach}</Text>
                    </View>
                  )}
                  <Text style={s.journalText}>{n.text}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      ) : view === 'noten' ? (
        <View style={s.section}>
          {Object.keys(grades).length === 0 ? (
            <Text style={s.lessonEmpty}>Noch keine Fächer synchronisiert.</Text>
          ) : (
            Object.entries(grades)
              .sort(([a], [b]) => a.localeCompare(b, 'de'))
              .map(([fach, entries]) => (
                <View key={fach} style={s.gradeCard}>
                  <View style={s.gradeHead}>
                    <View style={[s.lessonDot, { backgroundColor: subjectColor(fach) }]} />
                    <Text style={s.lessonFach}>{fach}</Text>
                  </View>
                  {entries.length === 0 ? (
                    <Text style={s.lessonEmpty}>Keine Noten erteilt.</Text>
                  ) : (
                    <View style={s.gradeChipsRow}>
                      {entries.map((g, i) => (
                        <View key={i} style={s.gradeChip}>
                          <Text style={s.gradeChipText}>{g.value}</Text>
                          {!!g.type && <Text style={s.gradeChipMeta}>{g.type}</Text>}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))
          )}
        </View>
      ) : (
      <>
      {/* Tag-Auswahl – heutiger Wochentag vorausgewählt */}
      <View style={s.dayRow}>
        {DAY_SHORT.map((label, i) => {
          const isToday = i === todayIdx;
          const isSelected = i === selectedDay;
          return (
            <TouchableOpacity
              key={label}
              style={[s.dayChip, isSelected && s.dayChipActive, isToday && !isSelected && s.dayChipToday]}
              onPress={() => setSelectedDay(i)}
            >
              <Text style={[s.dayChipText, isSelected && s.dayChipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={s.dayLabel}>
        {DAY_NAMES[selectedDay]}{selectedDay === todayIdx ? ' · heute' : ''}
      </Text>

      {/* Stunden des gewählten Tages */}
      <View style={s.section}>
        {isLinked && visiblePeriods.length === 0 && (
          <Text style={s.lessonEmpty}>Heute keine Schule.</Text>
        )}
        {visiblePeriods.map((p) => {
          if (p.pause) {
            return (
              <TouchableOpacity
                key={String(p.nr)}
                style={s.pauseRow}
                onPress={() => openTimeEditor(p.nr, p.start, p.end)}
                activeOpacity={isLinked ? 1 : 0.6}
                disabled={isLinked}
              >
                <Text style={s.pauseText}>{p.label} · {p.start}–{p.end}</Text>
                {!isLinked && <Ionicons name="pencil-outline" size={11} color={colors.textMuted} />}
              </TouchableOpacity>
            );
          }
          const slotKey = key(selectedDay, p.nr);
          const entry = timetable[slotKey];
          return (
            <TouchableOpacity
              key={String(p.nr)}
              style={[s.lessonCard, entry?.pause && s.lessonCardPause]}
              onPress={() => openEditor(p.nr, slotKey)}
              activeOpacity={isLinked ? 1 : 0.7}
              disabled={isLinked}
            >
              <View style={s.lessonTime}>
                <Text style={s.lessonNr}>{p.nr}.</Text>
                {isLinked ? (
                  <Text style={s.lessonClock}>{p.start}</Text>
                ) : (
                  <TouchableOpacity onPress={() => openTimeEditor(p.nr, p.start, p.end)} hitSlop={8}>
                    <Text style={[s.lessonClock, s.lessonClockEditable]}>{p.start}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {entry ? (
                <View style={s.lessonBody}>
                  <View style={s.lessonHead}>
                    <View style={[s.lessonDot, { backgroundColor: entry.pause ? colors.warning : subjectColor(entry.fach) }]} />
                    <Text style={[s.lessonFach, entry.pause && s.lessonFachPause]}>{entry.fach}</Text>
                  </View>
                  {!!(entry.raum || entry.lehrer) && (
                    <Text style={s.lessonMeta}>
                      {[entry.raum, entry.lehrer].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </View>
              ) : (
                <View style={s.lessonBody}>
                  <Text style={s.lessonEmpty}>{isLinked ? '–' : '+ Stunde eintragen'}</Text>
                </View>
              )}
              {!isLinked && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
            </TouchableOpacity>
          );
        })}
      </View>
      </>
      )}

      {/* Sync-Status – nur für an beste.schule gekoppelte Kinder, ganz unten */}
      {isLinked && (
        <View style={[s.syncBanner, syncState.status === 'error' && s.syncBannerError]}>
          <Ionicons
            name={syncState.status === 'error' ? 'warning-outline' : syncState.status === 'syncing' ? 'sync-outline' : 'checkmark-circle-outline'}
            size={14}
            color={syncState.status === 'error' ? colors.danger : colors.textSecondary}
          />
          <Text style={[s.syncBannerText, syncState.status === 'error' && { color: colors.danger }]}>
            {syncState.status === 'syncing' && 'Wird mit beste.schule synchronisiert…'}
            {syncState.status === 'done' && 'Synchronisiert mit beste.schule'}
            {syncState.status === 'error' && (syncState.message ?? 'Sync fehlgeschlagen')}
            {syncState.status === 'idle' && 'Synchronisiert mit beste.schule'}
          </Text>
        </View>
      )}

      {/* Editor-Modal */}
      <Modal visible={!!editing} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={closeEditor}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>
              {DAY_NAMES[selectedDay]} · {editing?.nr}. Stunde
            </Text>
            <TextInput
              style={s.input}
              value={fFach}
              onChangeText={setFFach}
              placeholder="Fach, z. B. Mathe"
              placeholderTextColor={colors.placeholder}
              autoFocus
            />
            <TextInput
              style={s.input}
              value={fRaum}
              onChangeText={setFRaum}
              placeholder="Raum (optional)"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={s.input}
              value={fLehrer}
              onChangeText={setFLehrer}
              placeholder="Lehrkraft (optional)"
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <View style={s.modalActions}>
              <TouchableOpacity onPress={handleClear}>
                <Text style={s.clearText}>Leeren</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeEditor}>
                  <Text style={s.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                  <Text style={s.saveBtnText}>Speichern</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Zeit-Editor-Modal – nur für manuell gepflegte Kinder */}
      <Modal visible={!!editingTime} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={closeTimeEditor}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>Uhrzeit ändern</Text>
            <TextInput
              style={s.input}
              value={editingTime?.start ?? ''}
              onChangeText={(v) => setEditingTime((cur) => cur && { ...cur, start: v })}
              placeholder="Start (HH:MM)"
              placeholderTextColor={colors.placeholder}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              autoFocus
            />
            <TextInput
              style={s.input}
              value={editingTime?.end ?? ''}
              onChangeText={(v) => setEditingTime((cur) => cur && { ...cur, end: v })}
              placeholder="Ende (HH:MM)"
              placeholderTextColor={colors.placeholder}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              returnKeyType="done"
              onSubmitEditing={handleSaveTime}
            />
            <View style={s.modalActions}>
              <TouchableOpacity onPress={handleResetTime}>
                <Text style={s.clearText}>Zurücksetzen</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeTimeEditor}>
                  <Text style={s.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, !timeValid && { opacity: 0.4 }]}
                  onPress={handleSaveTime}
                  disabled={!timeValid}
                >
                  <Text style={s.saveBtnText}>Speichern</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    container: { padding: 14, gap: 4, paddingBottom: 24 },
    // Kind-Auswahl
    childRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
    childChip: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
      backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border,
    },
    childName: { fontSize: 13, fontWeight: '700', color: colors.text },
    // Tag-Auswahl
    dayRow: { flexDirection: 'row', gap: 5, marginBottom: 4 },
    dayChip: {
      flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center',
      backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border,
    },
    dayChipToday: { borderColor: colors.accentNeon },
    dayChipActive: { backgroundColor: colors.accentNeon, borderColor: colors.accentNeon },
    dayChipText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
    dayChipTextActive: { color: colors.accentFg },
    dayLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 6 },
    // Sync-Status
    syncBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginTop: 10, paddingHorizontal: 4,
    },
    syncBannerError: {},
    syncBannerText: { fontSize: 12.5, color: colors.textSecondary },
    // Stundenplan/Noten-Umschalter
    viewToggle: {
      flexDirection: 'row', gap: 6, marginBottom: 8,
      backgroundColor: colors.surfaceHigh, borderRadius: 10, padding: 3,
    },
    viewToggleBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
    viewToggleBtnActive: { backgroundColor: colors.accentNeon },
    viewToggleText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    viewToggleTextActive: { color: colors.accentFg },
    // Noten
    gradeCard: {
      backgroundColor: colors.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: colors.border, marginBottom: 8,
    },
    gradeHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    gradeChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    gradeChip: {
      flexDirection: 'row', alignItems: 'baseline', gap: 4,
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
      backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border,
    },
    gradeChipText: { fontSize: 14, fontWeight: '800', color: colors.text },
    gradeChipMeta: { fontSize: 11, color: colors.textMuted },
    // Stundenliste
    section: { gap: 5 },
    lessonCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12,
      borderWidth: 1, borderColor: colors.border,
    },
    lessonTime: { width: 40, alignItems: 'flex-start' },
    lessonNr: { fontSize: 14, fontWeight: '800', color: colors.text },
    lessonClock: { fontSize: 10, color: colors.textMuted },
    lessonClockEditable: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
    lessonBody: { flex: 1, minWidth: 0 },
    lessonHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    lessonDot: { width: 8, height: 8, borderRadius: 4 },
    lessonFach: { fontSize: 14.5, fontWeight: '700', color: colors.text },
    lessonMeta: { fontSize: 11.5, color: colors.textMuted },
    lessonEmpty: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
    lessonCardPause: { borderColor: colors.warning },
    lessonFachPause: { color: colors.warning, fontStyle: 'italic' },
    pauseRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, paddingVertical: 0 },
    pauseText: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },
    // Klassenbuch
    klassenbuchTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 2 },
    journalRow: {
      flexDirection: 'row', gap: 10,
      backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12,
      borderWidth: 1, borderColor: colors.border,
    },
    journalDate: { width: 80, fontSize: 11.5, color: colors.textMuted, paddingTop: 1 },
    journalBody: { flex: 1, minWidth: 0, gap: 3 },
    journalText: { fontSize: 13, color: colors.text },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalBox: { backgroundColor: colors.surface, borderRadius: 20, padding: 22, width: 320, gap: 10 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
      color: colors.text, backgroundColor: colors.inputBackground,
    },
    modalActions: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
    },
    clearText: { fontSize: 13, fontWeight: '700', color: colors.danger, textDecorationLine: 'underline' },
    cancelBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
    cancelBtnText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
    saveBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.accentNeon },
    saveBtnText: { fontSize: 14, fontWeight: '700', color: colors.accentFg },
  });
