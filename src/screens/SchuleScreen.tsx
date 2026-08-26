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
  SchoolItem, SchoolItemType, makeId,
  subscribeToSchoolItems, saveSchoolItems, nextOrder, moveItem,
} from '../services/schoolManual';

type SyncState = { status: 'idle' | 'syncing' | 'done' | 'error'; message?: string };
type ScreenView = 'plan' | 'noten' | 'klassenbuch';

const ITEM_ICON: Record<SchoolItemType, keyof typeof Ionicons.glyphMap> = {
  homework: 'book-outline',
  info: 'information-circle-outline',
  event: 'calendar-outline',
};
const ITEM_LABEL: Record<SchoolItemType, string> = {
  homework: 'Hausaufgabe', info: 'Info', event: 'Termin',
};
// "Neue Hausaufgabe"/"Neue Info", aber "Neuer Termin" (der Termin) – eigener
// Artikel statt pauschal "Neue X".
const ITEM_LABEL_NEW: Record<SchoolItemType, string> = {
  homework: 'Neue Hausaufgabe', info: 'Neue Info', event: 'Neuer Termin',
};

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
  const [schoolItemsByChild, setSchoolItemsByChild] = useState<Record<string, SchoolItem[]>>({});
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
      subscribeToSchoolItems(fid, child.id, (list) => {
        setSchoolItemsByChild((prev) => ({ ...prev, [child.id]: list }));
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
  const schoolItems = schoolItemsByChild[selectedChild] ?? [];
  const openItems = React.useMemo(
    () => schoolItems.filter((i) => !i.done).sort((a, b) => a.order - b.order),
    [schoolItems]
  );
  const historyItems = React.useMemo(
    () => schoolItems
      .filter((i) => i.done)
      .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)),
    [schoolItems]
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

  // ── Klassenbuch, manuell gepflegte Kinder: ein Eintrags-Strom aus
  // Hausaufgaben/Infos/Terminen, per "+"-Menü angelegt, per Pfeil-Buttons
  // selbst sortiert, beim Abhaken in die History verschoben. ─────────────
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SchoolItem | 'new' | null>(null);
  const [newItemType, setNewItemType] = useState<SchoolItemType>('homework');
  const [hwSubject, setHwSubject] = useState('');
  const [hwText, setHwText] = useState('');
  const [infoText, setInfoText] = useState('');
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState('');
  const [evTime, setEvTime] = useState('');
  const [evLocation, setEvLocation] = useState('');
  const [evNotes, setEvNotes] = useState('');

  const itemType: SchoolItemType = editingItem === 'new' ? newItemType : editingItem?.type ?? 'homework';

  const pickType = useCallback((type: SchoolItemType) => {
    setTypePickerOpen(false);
    setNewItemType(type);
    setHwSubject(''); setHwText('');
    setInfoText('');
    setEvTitle(''); setEvDate(''); setEvTime(''); setEvLocation(''); setEvNotes('');
    setEditingItem('new');
  }, []);

  const openEditItem = useCallback((item: SchoolItem) => {
    if (item.type === 'homework') { setHwSubject(item.subject); setHwText(item.text); }
    else if (item.type === 'info') { setInfoText(item.text); }
    else { setEvTitle(item.title); setEvDate(item.date); setEvTime(item.time); setEvLocation(item.location); setEvNotes(item.notes); }
    setEditingItem(item);
  }, []);

  const closeItemEditor = useCallback(() => setEditingItem(null), []);

  const itemValid = itemType === 'homework' ? hwText.trim().length > 0
    : itemType === 'info' ? infoText.trim().length > 0
    : evTitle.trim().length > 0 && (evDate === '' || /^\d{4}-\d{2}-\d{2}$/.test(evDate))
      && (evTime === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(evTime));

  const handleSaveItem = useCallback(async () => {
    if (!fid || !selectedChild || !editingItem || !itemValid) return;
    const list = schoolItemsByChild[selectedChild] ?? [];
    const base = editingItem === 'new'
      ? { id: makeId(), done: false, order: nextOrder(list), createdAt: new Date().toISOString(), completedAt: null }
      : editingItem;
    const item: SchoolItem =
      itemType === 'homework' ? { ...base, type: 'homework', subject: hwSubject.trim(), text: hwText.trim() }
      : itemType === 'info' ? { ...base, type: 'info', text: infoText.trim() }
      : { ...base, type: 'event', title: evTitle.trim(), date: evDate.trim(), time: evTime.trim(), location: evLocation.trim(), notes: evNotes.trim() };
    const next = editingItem === 'new' ? [...list, item] : list.map((i) => i.id === item.id ? item : i);
    await saveSchoolItems(fid, selectedChild, next);
    setEditingItem(null);
  }, [fid, selectedChild, schoolItemsByChild, editingItem, itemValid, itemType, hwSubject, hwText, infoText, evTitle, evDate, evTime, evLocation, evNotes]);

  const handleDeleteItem = useCallback(async () => {
    if (!fid || !selectedChild || !editingItem || editingItem === 'new') return;
    const list = schoolItemsByChild[selectedChild] ?? [];
    await saveSchoolItems(fid, selectedChild, list.filter((i) => i.id !== (editingItem as SchoolItem).id));
    setEditingItem(null);
  }, [fid, selectedChild, schoolItemsByChild, editingItem]);

  const toggleItemDone = useCallback(async (item: SchoolItem) => {
    if (!fid || !selectedChild) return;
    const list = schoolItemsByChild[selectedChild] ?? [];
    const next = list.map((i) => i.id === item.id
      ? { ...i, done: !i.done, completedAt: i.done ? null : new Date().toISOString() }
      : i);
    await saveSchoolItems(fid, selectedChild, next);
  }, [fid, selectedChild, schoolItemsByChild]);

  const handleMoveItem = useCallback(async (id: string, dir: 'up' | 'down') => {
    if (!fid || !selectedChild) return;
    const list = schoolItemsByChild[selectedChild] ?? [];
    await saveSchoolItems(fid, selectedChild, moveItem(list, id, dir));
  }, [fid, selectedChild, schoolItemsByChild]);

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

      {/* Ansicht umschalten: synchronisierte Kinder bekommen zusätzlich Noten
          (read-only aus beste.schule). Das Klassenbuch selbst zeigt für
          manuell gepflegte Kinder einen eigenen, editierbaren Inhalt (s. u.). */}
      <View style={s.viewToggle}>
        <TouchableOpacity
          style={[s.viewToggleBtn, view === 'plan' && s.viewToggleBtnActive]}
          onPress={() => setView('plan')}
        >
          <Text style={[s.viewToggleText, view === 'plan' && s.viewToggleTextActive]}>Stundenplan</Text>
        </TouchableOpacity>
        {isLinked && (
          <TouchableOpacity
            style={[s.viewToggleBtn, view === 'noten' && s.viewToggleBtnActive]}
            onPress={() => setView('noten')}
          >
            <Text style={[s.viewToggleText, view === 'noten' && s.viewToggleTextActive]}>Noten</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.viewToggleBtn, view === 'klassenbuch' && s.viewToggleBtnActive]}
          onPress={() => setView('klassenbuch')}
        >
          <Text style={[s.viewToggleText, view === 'klassenbuch' && s.viewToggleTextActive]}>Klassenbuch</Text>
        </TouchableOpacity>
      </View>

      {view === 'klassenbuch' ? (
        isLinked ? (
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
        ) : (
        <View style={s.section}>
          <View style={s.sectionHeadRow}>
            <Text style={s.klassenbuchTitle}>Klassenbuch</Text>
            <TouchableOpacity onPress={() => setTypePickerOpen(true)} hitSlop={8}>
              <Ionicons name="add-circle-outline" size={22} color={colors.accentNeon} />
            </TouchableOpacity>
          </View>
          {openItems.length === 0 ? (
            <Text style={s.lessonEmpty}>Noch nichts eingetragen.</Text>
          ) : (
            openItems.map((item, idx) => (
              <TouchableOpacity key={item.id} style={s.journalRow} onPress={() => openEditItem(item)}>
                <TouchableOpacity onPress={() => toggleItemDone(item)} hitSlop={8}>
                  <Ionicons name="square-outline" size={20} color={colors.textMuted} />
                </TouchableOpacity>
                <Ionicons name={ITEM_ICON[item.type]} size={16} color={colors.textMuted} style={s.itemTypeIcon} />
                <View style={s.journalBody}>
                  {item.type === 'homework' && (
                    <>
                      {!!item.subject && (
                        <View style={s.lessonHead}>
                          <View style={[s.lessonDot, { backgroundColor: subjectColor(item.subject) }]} />
                          <Text style={s.lessonFach}>{item.subject}</Text>
                        </View>
                      )}
                      <Text style={s.journalText}>{item.text}</Text>
                    </>
                  )}
                  {item.type === 'info' && <Text style={s.journalText}>{item.text}</Text>}
                  {item.type === 'event' && (
                    <>
                      <Text style={s.journalText}>{item.title}</Text>
                      {!!(item.date || item.location) && (
                        <Text style={s.lessonMeta}>
                          {[item.date && journalDayLabel(item.date), item.time, item.location].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </>
                  )}
                </View>
                <View style={s.moveCol}>
                  <TouchableOpacity
                    onPress={() => handleMoveItem(item.id, 'up')}
                    disabled={idx === 0}
                    hitSlop={6}
                  >
                    <Ionicons name="chevron-up" size={16} color={idx === 0 ? colors.border : colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleMoveItem(item.id, 'down')}
                    disabled={idx === openItems.length - 1}
                    hitSlop={6}
                  >
                    <Ionicons name="chevron-down" size={16} color={idx === openItems.length - 1 ? colors.border : colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
          {historyItems.length > 0 && (
            <>
              <Text style={[s.klassenbuchTitle, { marginTop: 14 }]}>Erledigt</Text>
              {historyItems.map((item) => (
                <TouchableOpacity key={item.id} style={s.journalRow} onPress={() => openEditItem(item)}>
                  <TouchableOpacity onPress={() => toggleItemDone(item)} hitSlop={8}>
                    <Ionicons name="checkbox" size={20} color={colors.accentNeon} />
                  </TouchableOpacity>
                  <Ionicons name={ITEM_ICON[item.type]} size={16} color={colors.textMuted} style={s.itemTypeIcon} />
                  <View style={s.journalBody}>
                    <Text style={[s.journalText, s.journalTextDone]}>
                      {item.type === 'event' ? item.title : item.text}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
        )
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

      {/* Typ-Auswahl-Modal – welche Art Eintrag soll neu angelegt werden? */}
      <Modal visible={typePickerOpen} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={() => setTypePickerOpen(false)}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>Was möchtest du eintragen?</Text>
            {(['homework', 'info', 'event'] as SchoolItemType[]).map((type) => (
              <TouchableOpacity key={type} style={s.typeOption} onPress={() => pickType(type)}>
                <Ionicons name={ITEM_ICON[type]} size={20} color={colors.accentNeon} />
                <Text style={s.typeOptionText}>{ITEM_LABEL[type]}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Eintrags-Editor-Modal – Felder je nach Typ (Hausaufgabe/Info/Termin) */}
      <Modal visible={!!editingItem} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={closeItemEditor}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>
              {editingItem === 'new' ? ITEM_LABEL_NEW[itemType] : `${ITEM_LABEL[itemType]} bearbeiten`}
            </Text>

            {itemType === 'homework' && (
              <>
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
              </>
            )}

            {itemType === 'info' && (
              <TextInput
                style={s.input}
                value={infoText}
                onChangeText={setInfoText}
                placeholder="z. B. Klassenlehrerin: Frau Kohl"
                placeholderTextColor={colors.placeholder}
                autoFocus
                multiline
              />
            )}

            {itemType === 'event' && (
              <>
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
              </>
            )}

            <View style={s.modalActions}>
              {editingItem !== 'new' && (
                <TouchableOpacity onPress={handleDeleteItem}>
                  <Text style={s.clearText}>Löschen</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: 'row', gap: 10, marginLeft: 'auto' }}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeItemEditor}>
                  <Text style={s.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, !itemValid && { opacity: 0.4 }]}
                  onPress={handleSaveItem}
                  disabled={!itemValid}
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
    // Klassenbuch / manuelles Klassenbuch (Hausaufgaben, Infos, Termine gemischt)
    sectionHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    klassenbuchTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 2 },
    journalTextDone: { textDecorationLine: 'line-through', color: colors.textMuted },
    itemTypeIcon: { marginTop: 1 },
    moveCol: { justifyContent: 'center', gap: 2 },
    typeOption: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, paddingHorizontal: 4,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    typeOptionText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
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
