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
import {
  HomeworkEntry, SchoolInfoEntry, SchoolEventEntry, makeId,
  subscribeToHomework, saveHomework,
  subscribeToSchoolInfos, saveSchoolInfos,
  subscribeToSchoolEvents, saveSchoolEvents,
} from '../services/schoolManual';

type SyncState = { status: 'idle' | 'syncing' | 'done' | 'error'; message?: string };
type ScreenView = 'plan' | 'noten' | 'klassenbuch' | 'hausaufgaben' | 'infos' | 'termine';

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
  const [homeworkByChild, setHomeworkByChild] = useState<Record<string, HomeworkEntry[]>>({});
  const [schoolInfosByChild, setSchoolInfosByChild] = useState<Record<string, SchoolInfoEntry[]>>({});
  const [schoolEventsByChild, setSchoolEventsByChild] = useState<Record<string, SchoolEventEntry[]>>({});
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

  // Ansicht-Umschalter unterscheidet sich je nach Kind (Noten/Klassenbuch vs.
  // Hausaufgaben/Infos/Termine) – beim Kindwechsel immer auf Stundenplan zurück.
  useEffect(() => { setView('plan'); }, [selectedChild]);

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

  useEffect(() => {
    if (!fid || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToHomework(fid, child.id, (list) => {
        setHomeworkByChild((prev) => ({ ...prev, [child.id]: list }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [fid, familyChildren]);

  useEffect(() => {
    if (!fid || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToSchoolInfos(fid, child.id, (list) => {
        setSchoolInfosByChild((prev) => ({ ...prev, [child.id]: list }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [fid, familyChildren]);

  useEffect(() => {
    if (!fid || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToSchoolEvents(fid, child.id, (list) => {
        setSchoolEventsByChild((prev) => ({ ...prev, [child.id]: list }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [fid, familyChildren]);

  const timetable = timetableByChild[selectedChild] ?? {};
  const grades = gradesByChild[selectedChild] ?? {};
  // Lehrer je Fach aus dem Stundenplan ableiten statt neu abzufragen – die
  // "lehrer"-Spalte pro Slot ist schon da (besteSchule.ts), nur noch nie
  // pro Fach gruppiert dargestellt.
  const teachersByFach = React.useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const entry of Object.values(timetable)) {
      if (!entry.lehrer) continue;
      for (const name of entry.lehrer.split(',').map((s) => s.trim()).filter(Boolean)) {
        (map[entry.fach] ??= new Set()).add(name);
      }
    }
    return map;
  }, [timetable]);
  const journal = journalByChild[selectedChild] ?? EMPTY_JOURNAL;
  const homework = homeworkByChild[selectedChild] ?? [];
  const schoolInfos = schoolInfosByChild[selectedChild] ?? [];
  const schoolEvents = schoolEventsByChild[selectedChild] ?? [];
  const todayISO = format(new Date(), 'yyyy-MM-dd');
  const upcomingEvents = React.useMemo(
    () => schoolEvents
      .filter((e) => e.date >= todayISO)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    [schoolEvents, todayISO]
  );
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

  // ── Hausaufgaben (manuell gepflegte Kinder) ─────────────────────────────
  const [editingHomework, setEditingHomework] = useState<HomeworkEntry | 'new' | null>(null);
  const [hwSubject, setHwSubject] = useState('');
  const [hwText, setHwText] = useState('');

  const openNewHomework = useCallback(() => {
    setHwSubject(''); setHwText(''); setEditingHomework('new');
  }, []);
  const openEditHomework = useCallback((h: HomeworkEntry) => {
    setHwSubject(h.subject); setHwText(h.text); setEditingHomework(h);
  }, []);
  const closeHomeworkEditor = useCallback(() => setEditingHomework(null), []);

  const handleSaveHomework = useCallback(async () => {
    if (!fid || !selectedChild || !editingHomework) return;
    const text = hwText.trim();
    if (!text) return;
    const list = homeworkByChild[selectedChild] ?? [];
    const next = editingHomework === 'new'
      ? [...list, { id: makeId(), subject: hwSubject.trim(), text, done: false, createdAt: new Date().toISOString() }]
      : list.map((h) => h.id === (editingHomework as HomeworkEntry).id ? { ...h, subject: hwSubject.trim(), text } : h);
    await saveHomework(fid, selectedChild, next);
    setEditingHomework(null);
  }, [fid, selectedChild, homeworkByChild, editingHomework, hwSubject, hwText]);

  const handleDeleteHomework = useCallback(async () => {
    if (!fid || !selectedChild || !editingHomework || editingHomework === 'new') return;
    const list = homeworkByChild[selectedChild] ?? [];
    await saveHomework(fid, selectedChild, list.filter((h) => h.id !== (editingHomework as HomeworkEntry).id));
    setEditingHomework(null);
  }, [fid, selectedChild, homeworkByChild, editingHomework]);

  const toggleHomeworkDone = useCallback(async (h: HomeworkEntry) => {
    if (!fid || !selectedChild) return;
    const list = homeworkByChild[selectedChild] ?? [];
    await saveHomework(fid, selectedChild, list.map((x) => x.id === h.id ? { ...x, done: !x.done } : x));
  }, [fid, selectedChild, homeworkByChild]);

  // ── Infos (manuell gepflegte Kinder) ────────────────────────────────────
  const [editingInfo, setEditingInfo] = useState<SchoolInfoEntry | 'new' | null>(null);
  const [infoText, setInfoText] = useState('');
  const [infoPinned, setInfoPinned] = useState(false);

  const openNewInfo = useCallback(() => {
    setInfoText(''); setInfoPinned(false); setEditingInfo('new');
  }, []);
  const openEditInfo = useCallback((i: SchoolInfoEntry) => {
    setInfoText(i.text); setInfoPinned(i.pinned); setEditingInfo(i);
  }, []);
  const closeInfoEditor = useCallback(() => setEditingInfo(null), []);

  const handleSaveInfo = useCallback(async () => {
    if (!fid || !selectedChild || !editingInfo) return;
    const text = infoText.trim();
    if (!text) return;
    const list = schoolInfosByChild[selectedChild] ?? [];
    const next = editingInfo === 'new'
      ? [...list, { id: makeId(), text, pinned: infoPinned, createdAt: new Date().toISOString() }]
      : list.map((i) => i.id === (editingInfo as SchoolInfoEntry).id ? { ...i, text, pinned: infoPinned } : i);
    await saveSchoolInfos(fid, selectedChild, next);
    setEditingInfo(null);
  }, [fid, selectedChild, schoolInfosByChild, editingInfo, infoText, infoPinned]);

  const handleDeleteInfo = useCallback(async () => {
    if (!fid || !selectedChild || !editingInfo || editingInfo === 'new') return;
    const list = schoolInfosByChild[selectedChild] ?? [];
    await saveSchoolInfos(fid, selectedChild, list.filter((i) => i.id !== (editingInfo as SchoolInfoEntry).id));
    setEditingInfo(null);
  }, [fid, selectedChild, schoolInfosByChild, editingInfo]);

  // ── Termine (manuell gepflegte Kinder) ──────────────────────────────────
  const [editingEvent, setEditingEvent] = useState<SchoolEventEntry | 'new' | null>(null);
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState('');
  const [evTime, setEvTime] = useState('');
  const [evLocation, setEvLocation] = useState('');
  const [evNotes, setEvNotes] = useState('');

  const openNewEvent = useCallback(() => {
    setEvTitle(''); setEvDate(''); setEvTime(''); setEvLocation(''); setEvNotes(''); setEditingEvent('new');
  }, []);
  const openEditEvent = useCallback((e: SchoolEventEntry) => {
    setEvTitle(e.title); setEvDate(e.date); setEvTime(e.time);
    setEvLocation(e.location); setEvNotes(e.notes); setEditingEvent(e);
  }, []);
  const closeEventEditor = useCallback(() => setEditingEvent(null), []);

  const eventValid = evTitle.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(evDate)
    && (evTime === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(evTime));

  const handleSaveEvent = useCallback(async () => {
    if (!fid || !selectedChild || !editingEvent || !eventValid) return;
    const list = schoolEventsByChild[selectedChild] ?? [];
    const entry = {
      title: evTitle.trim(), date: evDate, time: evTime.trim(),
      location: evLocation.trim(), notes: evNotes.trim(),
    };
    const next = editingEvent === 'new'
      ? [...list, { id: makeId(), ...entry, createdAt: new Date().toISOString() }]
      : list.map((e) => e.id === (editingEvent as SchoolEventEntry).id ? { ...e, ...entry } : e);
    await saveSchoolEvents(fid, selectedChild, next);
    setEditingEvent(null);
  }, [fid, selectedChild, schoolEventsByChild, editingEvent, eventValid, evTitle, evDate, evTime, evLocation, evNotes]);

  const handleDeleteEvent = useCallback(async () => {
    if (!fid || !selectedChild || !editingEvent || editingEvent === 'new') return;
    const list = schoolEventsByChild[selectedChild] ?? [];
    await saveSchoolEvents(fid, selectedChild, list.filter((e) => e.id !== (editingEvent as SchoolEventEntry).id));
    setEditingEvent(null);
  }, [fid, selectedChild, schoolEventsByChild, editingEvent]);

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

      {/* Ansicht umschalten: synchronisierte Kinder sehen Noten/Klassenbuch
          (read-only aus beste.schule), manuell gepflegte Kinder stattdessen
          Hausaufgaben/Infos/Termine zum eigenen Pflegen (reine Elternsache). */}
      {isLinked ? (
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
      ) : (
        <View style={s.viewToggle}>
          <TouchableOpacity
            style={[s.viewToggleBtn, view === 'plan' && s.viewToggleBtnActive]}
            onPress={() => setView('plan')}
          >
            <Text style={[s.viewToggleText, view === 'plan' && s.viewToggleTextActive]}>Stundenplan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.viewToggleBtn, view === 'hausaufgaben' && s.viewToggleBtnActive]}
            onPress={() => setView('hausaufgaben')}
          >
            <Text style={[s.viewToggleText, view === 'hausaufgaben' && s.viewToggleTextActive]}>Hausaufgaben</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.viewToggleBtn, view === 'infos' && s.viewToggleBtnActive]}
            onPress={() => setView('infos')}
          >
            <Text style={[s.viewToggleText, view === 'infos' && s.viewToggleTextActive]}>Infos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.viewToggleBtn, view === 'termine' && s.viewToggleBtnActive]}
            onPress={() => setView('termine')}
          >
            <Text style={[s.viewToggleText, view === 'termine' && s.viewToggleTextActive]}>Termine</Text>
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
                  {!!teachersByFach[fach]?.size && (
                    <Text style={s.gradeTeachers}>{[...teachersByFach[fach]].join(', ')}</Text>
                  )}
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
      ) : view === 'hausaufgaben' ? (
        <View style={s.section}>
          <View style={s.sectionHeadRow}>
            <Text style={s.klassenbuchTitle}>Hausaufgaben</Text>
            <TouchableOpacity onPress={openNewHomework} hitSlop={8}>
              <Ionicons name="add-circle-outline" size={22} color={colors.accentNeon} />
            </TouchableOpacity>
          </View>
          {homework.length === 0 ? (
            <Text style={s.lessonEmpty}>Keine Hausaufgaben eingetragen.</Text>
          ) : (
            [...homework]
              .sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt.localeCompare(a.createdAt))
              .map((h) => (
                <TouchableOpacity key={h.id} style={s.journalRow} onPress={() => openEditHomework(h)}>
                  <TouchableOpacity onPress={() => toggleHomeworkDone(h)} hitSlop={8}>
                    <Ionicons
                      name={h.done ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={h.done ? colors.accentNeon : colors.textMuted}
                    />
                  </TouchableOpacity>
                  <View style={s.journalBody}>
                    {!!h.subject && (
                      <View style={s.lessonHead}>
                        <View style={[s.lessonDot, { backgroundColor: subjectColor(h.subject) }]} />
                        <Text style={s.lessonFach}>{h.subject}</Text>
                      </View>
                    )}
                    <Text style={[s.journalText, h.done && s.journalTextDone]}>{h.text}</Text>
                  </View>
                </TouchableOpacity>
              ))
          )}
        </View>
      ) : view === 'infos' ? (
        <View style={s.section}>
          <View style={s.sectionHeadRow}>
            <Text style={s.klassenbuchTitle}>Infos</Text>
            <TouchableOpacity onPress={openNewInfo} hitSlop={8}>
              <Ionicons name="add-circle-outline" size={22} color={colors.accentNeon} />
            </TouchableOpacity>
          </View>
          {schoolInfos.length === 0 ? (
            <Text style={s.lessonEmpty}>Keine Infos eingetragen.</Text>
          ) : (
            [...schoolInfos]
              .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
              .map((i) => (
                <TouchableOpacity key={i.id} style={s.journalRow} onPress={() => openEditInfo(i)}>
                  <View style={s.journalBody}>
                    <Text style={s.journalText}>{i.text}</Text>
                  </View>
                  {i.pinned && <Ionicons name="pin" size={14} color={colors.accentNeon} />}
                </TouchableOpacity>
              ))
          )}
        </View>
      ) : view === 'termine' ? (
        <View style={s.section}>
          <View style={s.sectionHeadRow}>
            <Text style={s.klassenbuchTitle}>Termine</Text>
            <TouchableOpacity onPress={openNewEvent} hitSlop={8}>
              <Ionicons name="add-circle-outline" size={22} color={colors.accentNeon} />
            </TouchableOpacity>
          </View>
          {upcomingEvents.length === 0 ? (
            <Text style={s.lessonEmpty}>Keine Termine eingetragen.</Text>
          ) : (
            upcomingEvents.map((ev) => (
              <TouchableOpacity key={ev.id} style={s.journalRow} onPress={() => openEditEvent(ev)}>
                <Text style={[s.journalDate, { width: 96 }]}>
                  {journalDayLabel(ev.date)}{ev.time ? ` · ${ev.time}` : ''}
                </Text>
                <View style={s.journalBody}>
                  <Text style={s.journalText}>{ev.title}</Text>
                  {!!ev.location && <Text style={s.lessonMeta}>{ev.location}</Text>}
                </View>
              </TouchableOpacity>
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

      {/* Hausaufgaben-Editor-Modal */}
      <Modal visible={!!editingHomework} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={closeHomeworkEditor}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>{editingHomework === 'new' ? 'Neue Hausaufgabe' : 'Hausaufgabe bearbeiten'}</Text>
            <TextInput
              style={s.input}
              value={hwSubject}
              onChangeText={setHwSubject}
              placeholder="Fach (optional)"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={s.input}
              value={hwText}
              onChangeText={setHwText}
              placeholder="Was ist zu tun?"
              placeholderTextColor={colors.placeholder}
              autoFocus
              multiline
              returnKeyType="done"
            />
            <View style={s.modalActions}>
              {editingHomework !== 'new' && (
                <TouchableOpacity onPress={handleDeleteHomework}>
                  <Text style={s.clearText}>Löschen</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: 'row', gap: 10, marginLeft: 'auto' }}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeHomeworkEditor}>
                  <Text style={s.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, !hwText.trim() && { opacity: 0.4 }]}
                  onPress={handleSaveHomework}
                  disabled={!hwText.trim()}
                >
                  <Text style={s.saveBtnText}>Speichern</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Info-Editor-Modal */}
      <Modal visible={!!editingInfo} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={closeInfoEditor}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>{editingInfo === 'new' ? 'Neue Info' : 'Info bearbeiten'}</Text>
            <TextInput
              style={s.input}
              value={infoText}
              onChangeText={setInfoText}
              placeholder="z. B. Klassenlehrerin: Frau Kohl"
              placeholderTextColor={colors.placeholder}
              autoFocus
              multiline
            />
            <TouchableOpacity style={s.pinRow} onPress={() => setInfoPinned((p) => !p)}>
              <Ionicons name={infoPinned ? 'checkbox' : 'square-outline'} size={18} color={infoPinned ? colors.accentNeon : colors.textMuted} />
              <Text style={s.pinRowText}>Oben anpinnen</Text>
            </TouchableOpacity>
            <View style={s.modalActions}>
              {editingInfo !== 'new' && (
                <TouchableOpacity onPress={handleDeleteInfo}>
                  <Text style={s.clearText}>Löschen</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: 'row', gap: 10, marginLeft: 'auto' }}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeInfoEditor}>
                  <Text style={s.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, !infoText.trim() && { opacity: 0.4 }]}
                  onPress={handleSaveInfo}
                  disabled={!infoText.trim()}
                >
                  <Text style={s.saveBtnText}>Speichern</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Termin-Editor-Modal */}
      <Modal visible={!!editingEvent} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={closeEventEditor}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>{editingEvent === 'new' ? 'Neuer Termin' : 'Termin bearbeiten'}</Text>
            <TextInput
              style={s.input}
              value={evTitle}
              onChangeText={setEvTitle}
              placeholder="Titel, z. B. Museumsbesuch"
              placeholderTextColor={colors.placeholder}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={evDate}
                onChangeText={setEvDate}
                placeholder="Datum (JJJJ-MM-TT)"
                placeholderTextColor={colors.placeholder}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
              <TextInput
                style={[s.input, { width: 90 }]}
                value={evTime}
                onChangeText={setEvTime}
                placeholder="HH:MM"
                placeholderTextColor={colors.placeholder}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
            <TextInput
              style={s.input}
              value={evLocation}
              onChangeText={setEvLocation}
              placeholder="Ort (optional)"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={s.input}
              value={evNotes}
              onChangeText={setEvNotes}
              placeholder="Notiz (optional)"
              placeholderTextColor={colors.placeholder}
              multiline
              returnKeyType="done"
            />
            <View style={s.modalActions}>
              {editingEvent !== 'new' && (
                <TouchableOpacity onPress={handleDeleteEvent}>
                  <Text style={s.clearText}>Löschen</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: 'row', gap: 10, marginLeft: 'auto' }}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeEventEditor}>
                  <Text style={s.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, !eventValid && { opacity: 0.4 }]}
                  onPress={handleSaveEvent}
                  disabled={!eventValid}
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
    gradeTeachers: { fontSize: 11.5, color: colors.textMuted, marginBottom: 6 },
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
    // Klassenbuch / manuelle Listen (Hausaufgaben, Infos, Termine)
    sectionHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    klassenbuchTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 2 },
    journalTextDone: { textDecorationLine: 'line-through', color: colors.textMuted },
    pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
    pinRowText: { fontSize: 13.5, color: colors.textSecondary },
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
