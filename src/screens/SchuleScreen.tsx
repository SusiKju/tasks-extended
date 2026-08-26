/**
 * SchuleScreen.tsx
 * Eltern-Ansicht: Stundenplan pro Kind ansehen und pflegen. Mobile-first als
 * Tagesansicht (heutiger Wochentag vorausgewählt) statt Wochenraster, damit
 * auf dem Handy immer der relevante Tag im Fokus steht.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Pressable, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { format, parseISO, isToday, isTomorrow, isYesterday } from 'date-fns';
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
  SchoolItem, makeId,
  subscribeToSchoolItems, saveSchoolItems,
  ChildInfoFact, subscribeToInfoFacts, saveInfoFacts,
} from '../services/schoolManual';
import { DatePickerModal } from '../components/DatePickerModal';

type SyncState = { status: 'idle' | 'syncing' | 'done' | 'error'; message?: string };
type ScreenView = 'plan' | 'noten' | 'klassenbuch';

const EMPTY_JOURNAL: JournalData = { homework: [], substitutions: [] };

function journalDayLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return 'Heute';
  if (isTomorrow(d)) return 'Morgen';
  return format(d, 'EEEE, dd.MM.', { locale: de });
}

/** "Angelegt heute 14:32" / "Bearbeitet gestern" / "Bearbeitet 12.08." – treibt
 *  auch die Sortierung der offenen Klassenbuch-Einträge (neuestes zuerst). */
function editedLabel(item: SchoolItem): string {
  const edited = item.updatedAt !== item.createdAt;
  const d = parseISO(edited ? item.updatedAt : item.createdAt);
  const when = isToday(d) ? `heute ${format(d, 'HH:mm')}` : isYesterday(d) ? 'gestern' : format(d, 'dd.MM.');
  return `${edited ? 'Bearbeitet' : 'Angelegt'} ${when}`;
}

/** Erkennt Telefonnummern in einem Kurzinfo-Wert (z. B. "+49 351 48818411"),
 *  damit sie antippbar zum Anrufen werden – kein festes Feld-Set nötig. */
function isPhoneNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!/^[+\d][\d\s()/-]*$/.test(trimmed)) return false;
  return trimmed.replace(/\D/g, '').length >= 6;
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
  const [infoFactsByChild, setInfoFactsByChild] = useState<Record<string, ChildInfoFact[]>>({});
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

  // Direkt zum passenden Kind springen, wenn von außen mit ?child=<id>
  // verlinkt wurde (z. B. "Schulaufgaben" im Dashboard) – bei jedem
  // Fokussieren erneut, falls der Tab schon gemountet war und sich nur der
  // Parameter geändert hat.
  const { child: childParam } = useLocalSearchParams<{ child?: string }>();
  useFocusEffect(
    useCallback(() => {
      if (childParam) setSelectedChild(childParam);
    }, [childParam])
  );

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

  useEffect(() => {
    if (!fid || familyChildren.length === 0) return;
    const unsubs = familyChildren.map((child) =>
      subscribeToInfoFacts(fid, child.id, (list) => {
        setInfoFactsByChild((prev) => ({ ...prev, [child.id]: list }));
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
  const infoFacts = infoFactsByChild[selectedChild] ?? [];
  const schoolItems = schoolItemsByChild[selectedChild] ?? [];
  const openItems = React.useMemo(
    () => schoolItems.filter((i) => !i.done && !i.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [schoolItems]
  );
  // Abgehakte UND gelöschte Einträge landen hier statt im offenen Bereich –
  // sichtbar nur im Verlauf-Dialog, von dort wiederherstellbar.
  const historyItems = React.useMemo(
    () => schoolItems
      .filter((i) => i.done || i.deletedAt)
      .sort((a, b) =>
        (b.deletedAt ?? b.completedAt ?? b.updatedAt).localeCompare(a.deletedAt ?? a.completedAt ?? a.updatedAt)),
    [schoolItems]
  );
  const todayIdx = todayDayIndex();
  const linkedStudentId = settings.besteSchuleStudentIds?.[selectedChild];
  const isLinked = !!linkedStudentId;
  // Kindergarten-Kinder (TE-Settings "Kindergarten"): kein Stundenplan/
  // Klassenbuch-Umschalter, nur der manuelle Eintrags-Strom.
  const isKindergarten = !!settings.kindergartenChildIds?.[selectedChild];

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

  // ── Klassenbuch, manuell gepflegte Kinder: ein Eintrags-Strom, per "+"
  // angelegt (Titel/Datum/Notiz + "Nur Info"-Haken), neuestes Anlegen/
  // Bearbeiten zuerst. Abhaken und Löschen sind nicht destruktiv – beides
  // landet im Verlauf-Dialog und ist von dort wiederherstellbar. ─────────
  const [editingItem, setEditingItem] = useState<SchoolItem | 'new' | null>(null);
  const [itemTitle, setItemTitle] = useState('');
  const [itemDate, setItemDate] = useState('');
  const [itemNotes, setItemNotes] = useState('');
  const [itemIsInfo, setItemIsInfo] = useState(false);
  const [showItemDatePicker, setShowItemDatePicker] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const openNewItem = useCallback(() => {
    setItemTitle(''); setItemDate(''); setItemNotes(''); setItemIsInfo(false);
    setEditingItem('new');
  }, []);

  const openEditItem = useCallback((item: SchoolItem) => {
    setItemTitle(item.title); setItemDate(item.date); setItemNotes(item.notes); setItemIsInfo(item.isInfo);
    setEditingItem(item);
  }, []);

  const closeItemEditor = useCallback(() => setEditingItem(null), []);

  const itemValid = itemTitle.trim().length > 0 && (itemDate === '' || /^\d{4}-\d{2}-\d{2}$/.test(itemDate));

  const handleSaveItem = useCallback(async () => {
    if (!fid || !selectedChild || !editingItem || !itemValid) return;
    const list = schoolItemsByChild[selectedChild] ?? [];
    const now = new Date().toISOString();
    const fields = { title: itemTitle.trim(), date: itemDate.trim(), notes: itemNotes.trim(), isInfo: itemIsInfo };
    const item: SchoolItem = editingItem === 'new'
      ? { id: makeId(), done: false, createdAt: now, updatedAt: now, completedAt: null, deletedAt: null, ...fields }
      : { ...editingItem, ...fields, updatedAt: now };
    const next = editingItem === 'new' ? [...list, item] : list.map((i) => i.id === item.id ? item : i);
    await saveSchoolItems(fid, selectedChild, next);
    setEditingItem(null);
  }, [fid, selectedChild, schoolItemsByChild, editingItem, itemValid, itemTitle, itemDate, itemNotes, itemIsInfo]);

  /** Weiches Löschen: Eintrag bleibt erhalten, verschwindet nur aus der
   *  offenen Liste und taucht im Verlauf-Dialog auf (wiederherstellbar). */
  const handleDeleteItem = useCallback(async () => {
    if (!fid || !selectedChild || !editingItem || editingItem === 'new') return;
    const list = schoolItemsByChild[selectedChild] ?? [];
    const next = list.map((i) => i.id === (editingItem as SchoolItem).id ? { ...i, deletedAt: new Date().toISOString() } : i);
    await saveSchoolItems(fid, selectedChild, next);
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

  /** Holt einen abgehakten oder gelöschten Eintrag aus dem Verlauf zurück. */
  const handleRestoreItem = useCallback(async (item: SchoolItem) => {
    if (!fid || !selectedChild) return;
    const list = schoolItemsByChild[selectedChild] ?? [];
    const next = list.map((i) => i.id === item.id
      ? { ...i, done: false, completedAt: null, deletedAt: null }
      : i);
    await saveSchoolItems(fid, selectedChild, next);
  }, [fid, selectedChild, schoolItemsByChild]);

  // ── Kontakte & Kurzinfos (Klassenlehrer, Horterzieher, Telefonnummern, …):
  // schlanke Label/Wert-Zeilen oberhalb von allem anderen, für jedes Kind
  // gleich – unabhängig von Sync-Status oder Kindergarten. ──────────────────
  const [editingFact, setEditingFact] = useState<ChildInfoFact | 'new' | null>(null);
  const [factLabel, setFactLabel] = useState('');
  const [factValue, setFactValue] = useState('');

  const openNewFact = useCallback(() => {
    setFactLabel(''); setFactValue(''); setEditingFact('new');
  }, []);

  const openEditFact = useCallback((fact: ChildInfoFact) => {
    setFactLabel(fact.label); setFactValue(fact.value); setEditingFact(fact);
  }, []);

  const closeFactEditor = useCallback(() => setEditingFact(null), []);

  const factValid = factLabel.trim().length > 0;

  const handleSaveFact = useCallback(async () => {
    if (!fid || !selectedChild || !editingFact || !factValid) return;
    const list = infoFactsByChild[selectedChild] ?? [];
    const fact: ChildInfoFact = editingFact === 'new'
      ? { id: makeId(), label: factLabel.trim(), value: factValue.trim() }
      : { ...editingFact, label: factLabel.trim(), value: factValue.trim() };
    const next = editingFact === 'new' ? [...list, fact] : list.map((f) => f.id === fact.id ? fact : f);
    await saveInfoFacts(fid, selectedChild, next);
    setEditingFact(null);
  }, [fid, selectedChild, infoFactsByChild, editingFact, factValid, factLabel, factValue]);

  const handleDeleteFact = useCallback(async () => {
    if (!fid || !selectedChild || !editingFact || editingFact === 'new') return;
    const list = infoFactsByChild[selectedChild] ?? [];
    await saveInfoFacts(fid, selectedChild, list.filter((f) => f.id !== (editingFact as ChildInfoFact).id));
    setEditingFact(null);
  }, [fid, selectedChild, infoFactsByChild, editingFact]);

  // Kontakte & Kurzinfos: dezente, einzeilige Zusammenfassung oben rechts
  // (nur wenn welche gepflegt sind) – Bearbeiten passiert über den
  // zurückhaltenden Link ganz unten auf der Seite, nicht hier oben.
  const [factsListOpen, setFactsListOpen] = useState(false);
  const factLine = infoFacts.map((f) => (f.value ? `${f.label}: ${f.value}` : f.label)).join('  ·  ');
  const firstPhoneFact = infoFacts.find((f) => isPhoneNumber(f.value));

  // Eintrags-Strom für manuell gepflegte Kinder (Hannes/Emil im Klassenbuch,
  // Liddy als einziger Inhalt ohne Schulpflicht) – identische Darstellung.
  // Abgehakte/gelöschte Einträge tauchen hier NICHT mehr auf, nur noch im
  // Verlauf-Dialog (weniger präsent, aber wiederherstellbar).
  const manualKlassenbuchContent = (
    <View style={s.section}>
      <View style={s.listCard}>
        {/* Aufgaben linksbündig (Haken links, Text folgt), Info-Einträge
            rechtsbündig (Text rechtsbündig, Icon am rechten Rand) – Ausrichtung
            selbst macht den Unterschied zwischen "abhakbar" und "nur Info" sichtbar. */}
        {openItems.map((item) => (
          <TouchableOpacity key={item.id} style={s.listRow} onPress={() => openEditItem(item)}>
            {item.isInfo ? (
              <>
                <View style={s.journalBody}>
                  <Text style={[s.journalText, s.textRight]}>{item.title}</Text>
                  <Text style={[s.lessonMeta, s.textRight]}>
                    {[item.date && journalDayLabel(item.date), item.notes, editedLabel(item)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
              </>
            ) : (
              <>
                <TouchableOpacity onPress={() => toggleItemDone(item)} hitSlop={10}>
                  <Ionicons name="square-outline" size={18} color={colors.textMuted} />
                </TouchableOpacity>
                <View style={s.journalBody}>
                  <Text style={s.journalText}>{item.title}</Text>
                  <Text style={s.lessonMeta}>
                    {[item.date && journalDayLabel(item.date), item.notes, editedLabel(item)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        ))}
        {/* Direkt unter dem letzten Eintrag antippbar, statt eines separaten
            Buttons – gleiches Muster wie "+ Stunde eintragen" im Stundenplan.
            Verlauf-Icon sitzt am selben Zeilenende, innerhalb der Karte. */}
        <TouchableOpacity style={s.listRow} onPress={openNewItem}>
          <Ionicons name="add" size={18} color={colors.textMuted} />
          <Text style={[s.lessonEmpty, { flex: 1 }]}>Eintrag hinzufügen</Text>
          <TouchableOpacity onPress={() => setHistoryOpen(true)} hitSlop={10} accessibilityLabel="Verlauf">
            <Ionicons name="time-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Tag-Auswahl + Stundenplan des gewählten Tages – für Lenny hinter dem
  // Stundenplan-Reiter, für Hannes/Emil direkt unter dem Klassenbuch auf
  // derselben Seite (kein Tab mehr).
  const stundenplanContent = (
    <>
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
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.container}>
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

      {/* Kontakte & Kurzinfos: eine dezente Zeile oben rechts, kein Rahmen,
          kein Umbruch – Einträge durch " · " getrennt. Nur sichtbar, wenn
          welche gepflegt sind; bearbeitet wird ganz unten auf der Seite. */}
      {!!factLine && (
        <View style={s.factLineRow}>
          <Text style={s.factLine} numberOfLines={1} ellipsizeMode="tail">
            {factLine}
          </Text>
          {!!firstPhoneFact && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${firstPhoneFact.value.replace(/[\s()/-]/g, '')}`)}
              hitSlop={10}
              accessibilityLabel="Anrufen"
            >
              <Ionicons name="call-outline" size={13} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Kindergarten-Kinder: kein Umschalter, nur der manuelle Eintrags-
          Strom. Hannes/Emil (manuell, aber schulpflichtig): Klassenbuch und
          Stundenplan auf einer Seite, kein Tab mehr. Lenny (synchronisiert):
          weiterhin der Stundenplan/Noten/Klassenbuch-Umschalter. */}
      {isKindergarten ? (
        manualKlassenbuchContent
      ) : !isLinked ? (
        <>
          {manualKlassenbuchContent}
          <View style={s.stundenplanDivider}>
            <Text style={s.stundenplanDividerText}>Stundenplan</Text>
          </View>
          {stundenplanContent}
        </>
      ) : (
      <>
      {/* Eigene, manuell gepflegte Einträge stehen für Lenny wie bei den
          anderen Kindern oben in der Hauptübersicht, unabhängig vom
          gewählten Reiter – darunter folgt der Rest aus beste.schule. */}
      {manualKlassenbuchContent}
      <View style={s.stundenplanDivider} />
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

      {view === 'klassenbuch' ? (
        <View style={s.section}>
          <Text style={s.klassenbuchTitle}>Vertretungen</Text>
          {journal.substitutions.length === 0 ? (
            <Text style={s.lessonEmpty}>Keine Vertretungen bekannt.</Text>
          ) : (
            <View style={s.listCard}>
              {journal.substitutions.map((n, i) => (
                <View key={i} style={s.listRow}>
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
              ))}
            </View>
          )}
          <Text style={[s.klassenbuchTitle, { marginTop: 14 }]}>Hausaufgaben</Text>
          {journal.homework.length === 0 ? (
            <Text style={s.lessonEmpty}>Keine offenen Hausaufgaben.</Text>
          ) : (
            <View style={s.listCard}>
              {journal.homework.map((n, i) => (
                <View key={i} style={s.listRow}>
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
              ))}
            </View>
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
      ) : (
        stundenplanContent
      )}
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

      {/* Kontakte & Kurzinfos bearbeiten – bewusst ganz unten und zurück-
          haltend: wird sehr selten angepasst, soll oben nicht auffallen. */}
      <TouchableOpacity style={s.factsFooter} onPress={() => setFactsListOpen(true)}>
        <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
        <Text style={s.factsFooterText}>Kontakte & Kurzinfos bearbeiten</Text>
      </TouchableOpacity>
    </ScrollView>

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

      {/* Eintrags-Editor-Modal – ein Feld-Set für alles (Titel/Datum/Notiz),
          "Nur Info" nimmt dem Eintrag den Haken. */}
      <Modal visible={!!editingItem} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={closeItemEditor}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>{editingItem === 'new' ? 'Neuer Eintrag' : 'Eintrag bearbeiten'}</Text>

            <TextInput
              style={s.input}
              value={itemTitle}
              onChangeText={setItemTitle}
              placeholder="Titel"
              placeholderTextColor={colors.placeholder}
              autoFocus
              multiline
            />
            <TouchableOpacity style={[s.input, s.dateInput]} onPress={() => setShowItemDatePicker(true)}>
              <Ionicons name="calendar-outline" size={16} color={itemDate ? colors.text : colors.placeholder} />
              <Text style={[s.dateInputText, { color: itemDate ? colors.text : colors.placeholder }]}>
                {itemDate ? format(parseISO(itemDate), 'dd.MM.yyyy') : 'Datum (optional)'}
              </Text>
              {!!itemDate && (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setItemDate(''); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
            <TextInput
              style={s.input}
              value={itemNotes}
              onChangeText={setItemNotes}
              placeholder="Notiz (optional)"
              placeholderTextColor={colors.placeholder}
              multiline
              returnKeyType="done"
            />
            <TouchableOpacity style={s.checkboxRow} onPress={() => setItemIsInfo((v) => !v)}>
              <Ionicons name={itemIsInfo ? 'checkbox' : 'square-outline'} size={18} color={itemIsInfo ? colors.accentNeon : colors.textMuted} />
              <Text style={s.checkboxRowText}>Nur Info (kein Haken zum Abhaken)</Text>
            </TouchableOpacity>

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

      <DatePickerModal
        visible={showItemDatePicker}
        value={itemDate ? parseISO(itemDate) : null}
        onConfirm={(d) => { setItemDate(format(d, 'yyyy-MM-dd')); setShowItemDatePicker(false); }}
        onCancel={() => setShowItemDatePicker(false)}
        colors={colors}
      />

      {/* Verlauf-Dialog – abgehakte/gelöschte Einträge, wiederherstellbar.
          Gleiches Design/Logik wie das History-Modal im Kinder-Tab. */}
      <Modal visible={historyOpen} transparent animationType="slide">
        <Pressable style={s.modalOverlay} onPress={() => setHistoryOpen(false)}>
          <Pressable style={s.historyBox} onPress={() => {}}>
            <View style={s.historyHeaderRow}>
              <Text style={s.modalTitle}>Verlauf</Text>
              <TouchableOpacity onPress={() => setHistoryOpen(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {historyItems.length === 0 ? (
              <Text style={s.lessonEmpty}>Noch nichts Abgehaktes oder Gelöschtes.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {(() => {
                  let lastDate = '';
                  return historyItems.map((item) => {
                    const at = item.deletedAt ?? item.completedAt ?? item.updatedAt;
                    const day = at.slice(0, 10);
                    const showDate = day !== lastDate;
                    lastDate = day;
                    const [y, m, d] = day.split('-');
                    const time = format(parseISO(at), 'HH:mm');
                    const isDeleted = !!item.deletedAt;
                    return (
                      <View key={item.id}>
                        {showDate && <Text style={s.historyDate}>{`${d}.${m}.${y}`}</Text>}
                        <View style={s.historyRow}>
                          <Ionicons
                            name={isDeleted ? 'trash' : 'checkmark-circle'}
                            size={18}
                            color={isDeleted ? colors.danger : colors.success}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={s.historyTitle} numberOfLines={2}>{item.title}</Text>
                            <Text style={s.historyMeta}>{isDeleted ? 'Gelöscht' : 'Abgehakt'}</Text>
                          </View>
                          <Text style={s.historyTime}>{time}</Text>
                          <TouchableOpacity onPress={() => handleRestoreItem(item)} hitSlop={8} accessibilityLabel="Wiederherstellen">
                            <Ionicons name="arrow-undo-circle-outline" size={20} color={colors.accentNeon} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  });
                })()}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Kontakte & Kurzinfos – Übersicht/Verwaltung, geöffnet über den
          zurückhaltenden Link ganz unten auf der Seite. */}
      <Modal visible={factsListOpen} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={() => setFactsListOpen(false)}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>Kontakte & Kurzinfos</Text>
            {infoFacts.length === 0 ? (
              <Text style={s.lessonEmpty}>Noch nichts eingetragen.</Text>
            ) : (
              <View style={s.listCard}>
                {infoFacts.map((fact) => (
                  <TouchableOpacity
                    key={fact.id}
                    style={s.listRow}
                    onPress={() => { setFactsListOpen(false); openEditFact(fact); }}
                  >
                    <Text style={s.factText} numberOfLines={1}>
                      <Text style={s.factLabel}>{fact.label}</Text>{fact.value ? `  ${fact.value}` : ''}
                    </Text>
                    {isPhoneNumber(fact.value) && (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`tel:${fact.value.replace(/[\s()/-]/g, '')}`)}
                        hitSlop={10}
                        accessibilityLabel="Anrufen"
                      >
                        <Ionicons name="call-outline" size={16} color={colors.accentNeon} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={s.modalActions}>
              <TouchableOpacity onPress={() => { setFactsListOpen(false); openNewFact(); }}>
                <Text style={s.factsAddText}>+ Info hinzufügen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.cancelBtn, { marginLeft: 'auto' }]} onPress={() => setFactsListOpen(false)}>
                <Text style={s.cancelBtnText}>Schließen</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Kontakt-/Info-Editor-Modal – Label frei wählbar (z. B. "Klassenlehrer",
          "Hort-Tel."), kein festes Feld-Set. */}
      <Modal visible={!!editingFact} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={closeFactEditor}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <Text style={s.modalTitle}>{editingFact === 'new' ? 'Neue Info' : 'Info bearbeiten'}</Text>
            <View style={{ gap: 4 }}>
              <Text style={s.fieldLabel}>Bezeichnung</Text>
              <TextInput
                style={s.input}
                value={factLabel}
                onChangeText={setFactLabel}
                placeholder="z. B. Klassenlehrer"
                placeholderTextColor={colors.placeholder}
                autoFocus
              />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={[s.fieldLabel, s.fieldLabelOptional]}>Wert (optional)</Text>
              <TextInput
                style={s.input}
                value={factValue}
                onChangeText={setFactValue}
                placeholder="z. B. Frau Kohl"
                placeholderTextColor={colors.placeholder}
                returnKeyType="done"
              />
            </View>
            <View style={s.modalActions}>
              {editingFact !== 'new' && (
                <TouchableOpacity onPress={handleDeleteFact}>
                  <Text style={s.clearText}>Löschen</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: 'row', gap: 10, marginLeft: 'auto' }}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeFactEditor}>
                  <Text style={s.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, !factValid && { opacity: 0.4 }]}
                  onPress={handleSaveFact}
                  disabled={!factValid}
                >
                  <Text style={s.saveBtnText}>Speichern</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    // paddingBottom groß genug, damit die drei FABs unten rechts (Klassenbuch-
    // Ansichten) nicht die letzten Einträge verdecken.
    container: { padding: 14, gap: 4, paddingBottom: 96 },
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
    // Klassenbuch / manuelles Klassenbuch (Aufgaben + Infos gemischt)
    klassenbuchTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 2 },
    // Klare Abhebung zum Stundenplan darunter, wenn beides ohne Tab auf
    // einer Seite steht (Hannes/Emil).
    stundenplanDivider: {
      marginTop: 22, paddingTop: 14, marginBottom: 2,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    stundenplanDividerText: {
      fontSize: 12, fontWeight: '700', color: colors.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.6,
    },
    // Eine Karte pro Liste, keine Trennlinien zwischen den Zeilen – nur
    // knappes Padding hält die Zeilen auseinander, das wirkt am kompaktesten.
    // "+" sitzt als Fußzeile IN der Karte statt als schwebender FAB – bleibt
    // dadurch auch bei leerer Liste sichtbar (Karte wird immer gerendert).
    listCard: {
      backgroundColor: colors.surface, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border,
    },
    listRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingVertical: 6, paddingHorizontal: 12,
    },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
    checkboxRowText: { fontSize: 13.5, color: colors.textSecondary },
    fieldLabel: {
      fontSize: 11.5, fontWeight: '700', color: colors.textSecondary,
      letterSpacing: 0.2, marginLeft: 2,
    },
    fieldLabelOptional: { fontWeight: '400', color: colors.textMuted },
    journalDate: { width: 80, fontSize: 11.5, color: colors.textMuted, paddingTop: 1 },
    journalBody: { flex: 1, minWidth: 0 },
    journalText: { fontSize: 13, color: colors.text },
    textRight: { textAlign: 'right' },
    // Kontakte & Kurzinfos: eine Zeile, Bezeichnung fett+gedimmt, Wert normal.
    factText: { fontSize: 13, color: colors.text, flex: 1 },
    factLabel: { fontWeight: '700', color: colors.textSecondary },
    // Dezente Einzeiler-Zusammenfassung oben rechts, kein Rahmen/Umbruch.
    factLineRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
      gap: 5, marginBottom: 8,
    },
    factLine: {
      flexShrink: 1, fontSize: 11, color: colors.textMuted, textAlign: 'right',
    },
    // Zurückhaltender Link ganz unten zum Bearbeiten der Kontakte/Kurzinfos.
    factsFooter: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
      marginTop: 20, paddingVertical: 10,
    },
    factsFooterText: { fontSize: 11.5, color: colors.textMuted },
    factsAddText: { fontSize: 13, fontWeight: '700', color: colors.accentNeon },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalBox: { backgroundColor: colors.surface, borderRadius: 20, padding: 22, width: 320, gap: 10 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
      color: colors.text, backgroundColor: colors.inputBackground,
    },
    dateInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dateInputText: { flex: 1, fontSize: 15 },
    // Verlauf-Dialog – 1:1 Design/Struktur wie das History-Modal im
    // Kinder-Tab (app/(tabs)/kids.tsx).
    historyBox: {
      backgroundColor: colors.surface, borderRadius: 20, padding: 20,
      width: 340, maxWidth: '92%', gap: 10,
    },
    historyHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    historyDate: {
      fontSize: 12, fontWeight: '700', color: colors.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4,
    },
    historyRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6,
      borderBottomWidth: 1, borderColor: colors.border,
    },
    historyTitle: { fontSize: 14, color: colors.text },
    historyMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
    historyTime: { fontSize: 13, fontWeight: '600', color: colors.accentNeon },
    modalActions: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
    },
    clearText: { fontSize: 13, fontWeight: '700', color: colors.danger, textDecorationLine: 'underline' },
    cancelBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
    cancelBtnText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
    saveBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.accentNeon },
    saveBtnText: { fontSize: 14, fontWeight: '700', color: colors.accentFg },
  });
