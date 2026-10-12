/**
 * BambiniScreen.tsx
 *
 * Tab "Bambini" (TE-18): zentrale Pflege der Kinder (Name + Geburtsjahr).
 * Aus dieser Registry speisen sich die jahrgangsweise gefilterten Ansichten
 * in den Fußball-Notizen (FussballKachel). Beim ersten Öffnen werden alte
 * Roster-Namen automatisch hierher migriert.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, ThemeColors } from '../utils/theme';
import { GradientButton, PLUS_BUTTON, PLUS_ICON_SIZE } from '../components/GradientButton';
import { useFamily } from '../hooks/useFamily';
import { useStore } from '../store';
import { DatePickerModal } from '../components/DatePickerModal';
import { FussballKachel } from '../components/FussballKachel';
import { SearchInput } from '../components/SearchInput';
import {
  Child,
  loadBambini,
  saveBambini,
  migrateRosterToBambini,
  loadBambiniFilters,
  saveBambiniFilters,
  loadBambiniNotizItems,
  saveBambiniNotizItems,
  loadBambiniTrainingsideenItems,
  saveBambiniTrainingsideenItems,
  NotizItem,
  NotizKind,
  BambiniTraining,
  loadBambiniTraining,
  saveBambiniTraining,
  looksLikePhone,
  parseNeuesKind,
  makeId,
  BambiniSortMode,
} from '../services/bambini';

/** Bewusst nicht über colors.danger (wird in mono() vergraut) – wie NotesScreen IMPORTANT_RED. */
const NOT_ANGEMELDET_RED = '#EF4444';
const WHATSAPP_GREEN = '#25D366';
const SMS_BLUE = '#007AFF';
const INFO_YELLOW = '#F5B301';
import { getJahrgangStatus } from '../utils/bambiniSeason';

/** ISO 'YYYY-MM-DD' → 'DD.MM.YYYY' (string-basiert, ohne Zeitzonen-Fallen). */
function formatDE(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
}

/** ISO 'YYYY-MM-DD' → lokales Date (für den Picker-Startwert). */
function parseISO(iso: string): Date | null {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** Lokales Date → ISO 'YYYY-MM-DD' (kein UTC-Shift). */
function toISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Alert funktioniert auf Web nicht — window.confirm als Fallback. */
function confirmDelete(name: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`„${name}" löschen?`)) onConfirm();
  } else {
    Alert.alert('Löschen', `„${name}" löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: onConfirm },
    ]);
  }
}

const SORT_OPTIONS: { value: BambiniSortMode; label: string }[] = [
  { value: 'jahrgang', label: 'Alphabetisch nach Jahrgang' },
  { value: 'erstesmal', label: 'Dabei seit' },
];

export function BambiniScreen() {
  const { colors, mono } = useTheme();
  const { familyId } = useFamily();
  const fid = familyId ?? '';
  const s = makeStyles(colors);
  // TE-74: Bento Dark bekommt eine ruhigere, nach Jahrgang gruppierte Liste.
  const bento = useStore((st) => st.settings.theme) === 'bento-night';

  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // TE-99: Quickfilter unter der Suchleiste (Jahrgang, aufgehört/aktiv).
  // TE-20: Jahrgang ist Mehrfachauswahl (mehrere Jahre gleichzeitig), family-weit
  // in Firestore gespeichert (siehe families/{familyId}/config/bambini.filters).
  // stoppedFilter: null = alle, true = nur aufgehört, false = nur aktiv (nicht aufgehört).
  const [yearFilter, setYearFilter] = useState<number[]>([]);
  const [stoppedFilter, setStoppedFilter] = useState<boolean | null>(null);
  // TE-112: Wackelkandidaten sind standardmäßig ausgeblendet und werden nur mit
  // explizit aktiviertem Chip zusätzlich zu den übrigen Filtern (Jahrgang etc.)
  // eingeblendet – kein exklusiver "nur Wackelkandidaten"-Modus mehr.
  const [wackelkandidatFilter, setWackelkandidatFilter] = useState(false);
  // TE-109: Sortierung der flachen Liste (keine Jahrgangs-Überschriften mehr) –
  // family-weit persistiert, wie die übrigen Quickfilter (siehe filtersLoaded unten).
  const [sortMode, setSortMode] = useState<BambiniSortMode>('jahrgang');
  const [sortReversed, setSortReversed] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  // TE-110: Such-/Filter-/Sortierbereich ein-/ausblendbar, sitzt inline über der
  // Liste (kein Modal) – Zustand ebenfalls family-weit persistiert.
  const [filtersOpen, setFiltersOpen] = useState(true);
  // Erst nach dem initialen Laden aus Firestore speichern wir Änderungen zurück,
  // sonst würde der leere Default-State die gespeicherte Auswahl überschreiben.
  const filtersLoaded = useRef(false);

  // Modal-State: editing === null → zu; mit Child → bearbeiten; mit '' id → neu.
  const [editing, setEditing] = useState<Child | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [sinceInput, setSinceInput] = useState(''); // ISO 'YYYY-MM-DD' oder ''
  const [stoppedInput, setStoppedInput] = useState(false);
  const [parentInput, setParentInput] = useState('');
  const [lastNameInput, setLastNameInput] = useState('');
  const [infoInput, setInfoInput] = useState('');
  const [whatsappInput, setWhatsappInput] = useState(false);
  const [smsInput, setSmsInput] = useState(false);
  const [vereinAngemeldetInput, setVereinAngemeldetInput] = useState(false);
  const [schnuppertrainingInput, setSchnuppertrainingInput] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // TE-101: Notiz-Items (wichtig/nächste Aufgabe markierbar), löste die
  // Freitext-Notizen (TE-44) ab. Jede Aktion speichert sofort, damit die
  // Markierungen auf der Startseite live stimmen.
  // TE-113: Löschen ist seither weich (deletedAt statt Entfernen aus dem
  // Array) – der Verlauf-Dialog (gleiches Muster wie SchuleScreen) zeigt
  // gelöschte Items und macht sie wiederherstellbar.
  const [notizenOpen, setNotizenOpen] = useState(false);
  const [notizItems, setNotizItems] = useState<NotizItem[]>([]);
  const [notizInput, setNotizInput] = useState('');
  const [notizHistoryOpen, setNotizHistoryOpen] = useState(false);
  const [notizEditId, setNotizEditId] = useState<string | null>(null);
  const [notizEditText, setNotizEditText] = useState('');

  const openNotizen = useCallback(() => {
    setNotizInput('');
    setNotizenOpen(true);
    if (!fid) return;
    loadBambiniNotizItems(fid)
      .then(setNotizItems)
      .catch((e) => console.warn('Bambini-Notizen laden fehlgeschlagen', e));
  }, [fid]);

  const persistNotizItems = useCallback((items: NotizItem[]) => {
    setNotizItems(items);
    if (fid) saveBambiniNotizItems(fid, items).catch((e) => console.warn('Bambini-Notizen speichern fehlgeschlagen', e));
  }, [fid]);

  // TE-13: Schließen (daneben tippen / Zurück / X) übernimmt Getipptes statt es zu verwerfen.
  const closeNotizen = useCallback(() => {
    let items = notizItems;
    const edited = notizEditText.trim();
    if (notizEditId && edited) items = items.map((n) => (n.id === notizEditId ? { ...n, text: edited } : n));
    const text = notizInput.trim();
    if (text) items = [{ id: makeId(), text, marked: false, createdAt: new Date().toISOString(), deletedAt: null }, ...items];
    if (items !== notizItems) persistNotizItems(items);
    setNotizEditId(null);
    setNotizInput('');
    setNotizenOpen(false);
  }, [notizItems, notizEditId, notizEditText, notizInput, persistNotizItems]);

  const addNotizItem = useCallback(() => {
    const text = notizInput.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const item: NotizItem = { id: makeId(), text, marked: false, createdAt: now, deletedAt: null };
    persistNotizItems([item, ...notizItems]);
    setNotizInput('');
  }, [notizInput, notizItems, persistNotizItems]);

  const toggleNotizMarked = useCallback((id: string) => {
    persistNotizItems(notizItems.map((n) => (n.id === id ? { ...n, marked: !n.marked } : n)));
  }, [notizItems, persistNotizItems]);

  const deleteNotizItem = useCallback((id: string) => {
    const now = new Date().toISOString();
    persistNotizItems(notizItems.map((n) => (n.id === id ? { ...n, deletedAt: now } : n)));
  }, [notizItems, persistNotizItems]);

  const restoreNotizItem = useCallback((id: string) => {
    persistNotizItems(notizItems.map((n) => (n.id === id ? { ...n, deletedAt: null } : n)));
  }, [notizItems, persistNotizItems]);

  const moveNotizItem = useCallback((id: string, direction: -1 | 1) => {
    const active = notizItems.filter((n) => !n.deletedAt);
    const idx = active.findIndex((n) => n.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= active.length) return;
    [active[idx], active[swapIdx]] = [active[swapIdx], active[idx]];
    persistNotizItems([...active, ...notizItems.filter((n) => n.deletedAt)]);
  }, [notizItems, persistNotizItems]);

  const startEditNotiz = useCallback((n: NotizItem) => {
    setNotizEditId(n.id);
    setNotizEditText(n.text);
  }, []);

  const cancelEditNotiz = useCallback(() => setNotizEditId(null), []);

  const saveEditNotiz = useCallback(() => {
    const text = notizEditText.trim();
    const editing = notizItems.find((n) => n.id === notizEditId);
    if (!editing || !text || text === editing.text) {
      setNotizEditId(null);
      return;
    }
    persistNotizItems(notizItems.map((n) => (n.id === notizEditId ? { ...n, text } : n)));
    setNotizEditId(null);
  }, [notizEditId, notizEditText, notizItems, persistNotizItems]);

  const activeNotizItems = notizItems.filter((n) => !n.deletedAt);
  const deletedNotizItems = notizItems
    .filter((n) => n.deletedAt)
    .sort((a, b) => (b.deletedAt as string).localeCompare(a.deletedAt as string));
  const markedNotizItems = activeNotizItems.filter((n) => n.marked);

  // TE-113: zweite freie Item-Liste, gleiche Mechanik wie die Notizen oben,
  // eigener Speicherort (trainingsideenItems) für Trainingsideen zum aktuellen Training.
  const [trainingsideenOpen, setTrainingsideenOpen] = useState(false);
  const [trainingsideenItems, setTrainingsideenItems] = useState<NotizItem[]>([]);
  const [trainingsideeInput, setTrainingsideeInput] = useState('');
  const [trainingsideeHistoryOpen, setTrainingsideeHistoryOpen] = useState(false);
  const [trainingsideeEditId, setTrainingsideeEditId] = useState<string | null>(null);
  const [trainingsideeEditText, setTrainingsideeEditText] = useState('');

  const openTrainingsideen = useCallback(() => {
    setTrainingsideeInput('');
    setTrainingsideenOpen(true);
    if (!fid) return;
    loadBambiniTrainingsideenItems(fid)
      .then(setTrainingsideenItems)
      .catch((e) => console.warn('Trainingsideen laden fehlgeschlagen', e));
  }, [fid]);

  const persistTrainingsideenItems = useCallback((items: NotizItem[]) => {
    setTrainingsideenItems(items);
    if (fid) saveBambiniTrainingsideenItems(fid, items).catch((e) => console.warn('Trainingsideen speichern fehlgeschlagen', e));
  }, [fid]);

  // TE-13: Schließen (daneben tippen / Zurück / X) übernimmt Getipptes statt es zu verwerfen.
  const closeTrainingsideen = useCallback(() => {
    let items = trainingsideenItems;
    const edited = trainingsideeEditText.trim();
    if (trainingsideeEditId && edited) items = items.map((n) => (n.id === trainingsideeEditId ? { ...n, text: edited } : n));
    const text = trainingsideeInput.trim();
    if (text) items = [{ id: makeId(), text, marked: false, createdAt: new Date().toISOString(), deletedAt: null }, ...items];
    if (items !== trainingsideenItems) persistTrainingsideenItems(items);
    setTrainingsideeEditId(null);
    setTrainingsideeInput('');
    setTrainingsideenOpen(false);
  }, [trainingsideenItems, trainingsideeEditId, trainingsideeEditText, trainingsideeInput, persistTrainingsideenItems]);

  const addTrainingsideeItem = useCallback(() => {
    const text = trainingsideeInput.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const item: NotizItem = { id: makeId(), text, marked: false, createdAt: now, deletedAt: null };
    persistTrainingsideenItems([item, ...trainingsideenItems]);
    setTrainingsideeInput('');
  }, [trainingsideeInput, trainingsideenItems, persistTrainingsideenItems]);

  const toggleTrainingsideeMarked = useCallback((id: string) => {
    persistTrainingsideenItems(trainingsideenItems.map((n) => (n.id === id ? { ...n, marked: !n.marked } : n)));
  }, [trainingsideenItems, persistTrainingsideenItems]);

  const deleteTrainingsideeItem = useCallback((id: string) => {
    const now = new Date().toISOString();
    persistTrainingsideenItems(trainingsideenItems.map((n) => (n.id === id ? { ...n, deletedAt: now } : n)));
  }, [trainingsideenItems, persistTrainingsideenItems]);

  const restoreTrainingsideeItem = useCallback((id: string) => {
    persistTrainingsideenItems(trainingsideenItems.map((n) => (n.id === id ? { ...n, deletedAt: null } : n)));
  }, [trainingsideenItems, persistTrainingsideenItems]);

  const moveTrainingsideeItem = useCallback((id: string, direction: -1 | 1) => {
    const active = trainingsideenItems.filter((n) => !n.deletedAt);
    const idx = active.findIndex((n) => n.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= active.length) return;
    [active[idx], active[swapIdx]] = [active[swapIdx], active[idx]];
    persistTrainingsideenItems([...active, ...trainingsideenItems.filter((n) => n.deletedAt)]);
  }, [trainingsideenItems, persistTrainingsideenItems]);

  const startEditTrainingsidee = useCallback((n: NotizItem) => {
    setTrainingsideeEditId(n.id);
    setTrainingsideeEditText(n.text);
  }, []);

  const cancelEditTrainingsidee = useCallback(() => setTrainingsideeEditId(null), []);

  const saveEditTrainingsidee = useCallback(() => {
    const text = trainingsideeEditText.trim();
    const editing = trainingsideenItems.find((n) => n.id === trainingsideeEditId);
    if (!editing || !text || text === editing.text) {
      setTrainingsideeEditId(null);
      return;
    }
    persistTrainingsideenItems(trainingsideenItems.map((n) => (n.id === trainingsideeEditId ? { ...n, text } : n)));
    setTrainingsideeEditId(null);
  }, [trainingsideeEditId, trainingsideeEditText, trainingsideenItems, persistTrainingsideenItems]);

  const activeTrainingsideenItems = trainingsideenItems.filter((n) => !n.deletedAt);
  const deletedTrainingsideenItems = trainingsideenItems
    .filter((n) => n.deletedAt)
    .sort((a, b) => (b.deletedAt as string).localeCompare(a.deletedAt as string));
  const markedTrainingsideenItems = activeTrainingsideenItems.filter((n) => n.marked);

  // TE-81: Trainingsmodus – Start/Beenden-Kachel, Schnellnotiz während des Trainings,
  // danach Notizen zuordnen. Notizen landen in den bestehenden Bambini-Notiz-Items.
  const [training, setTraining] = useState<BambiniTraining>({ startedAt: null, lastStart: null, lastEnd: null });
  const [quickText, setQuickText] = useState('');
  const [quickKind, setQuickKind] = useState<NotizKind | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [assignNoteId, setAssignNoteId] = useState<string | null>(null);
  const pendingNeuNoteId = useRef<string | null>(null);

  useEffect(() => {
    if (!training.startedAt) return;
    setNowTick(Date.now());
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, [training.startedAt]);

  const persistTraining = useCallback((next: BambiniTraining) => {
    setTraining(next);
    if (fid) saveBambiniTraining(fid, next).catch((e) => console.warn('Training speichern fehlgeschlagen', e));
  }, [fid]);

  const toggleTraining = () => {
    const now = new Date().toISOString();
    if (training.startedAt) persistTraining({ startedAt: null, lastStart: training.startedAt, lastEnd: now });
    else persistTraining({ ...training, startedAt: now });
  };

  // Ohne explizit gewählten Chip erkennt die Zeile eine Telefonnummer selbst.
  const quickKindEffective: NotizKind = quickKind ?? (looksLikePhone(quickText) ? 'tel' : 'info');

  const addQuickNote = () => {
    const text = quickText.trim();
    if (!text || !training.startedAt) return;
    const item: NotizItem = {
      id: makeId(), text, marked: false, createdAt: new Date().toISOString(), deletedAt: null,
      kind: quickKindEffective, trainingId: training.startedAt,
    };
    persistNotizItems([item, ...notizItems]);
    setQuickText('');
    setQuickKind(null);
  };

  const resolveNote = (id: string) => {
    const now = new Date().toISOString();
    persistNotizItems(notizItems.map((n) => (n.id === id ? { ...n, deletedAt: now } : n)));
  };

  const assignTelToChild = (c: Child) => {
    const note = notizItems.find((n) => n.id === assignNoteId);
    setAssignNoteId(null);
    if (!note) return;
    persist(children.map((x) => (x.id === c.id ? { ...x, info: x.info ? `${x.info}\n${note.text}` : note.text } : x)));
    resolveNote(note.id);
  };

  const createFromNeu = (n: NotizItem) => {
    const parsed = parseNeuesKind(n.text);
    openNew();
    setNameInput(parsed.name);
    setYearInput(parsed.birthYear ? String(parsed.birthYear) : '');
    setParentInput(parsed.parentName);
    setSchnuppertrainingInput(true);
    pendingNeuNoteId.current = n.id;
  };

  // TE-83: alle offenen Trainingsnotizen, egal aus welchem Training – sie bleiben,
  // bis sie zugeordnet oder erledigt sind (vorher nur die des letzten Trainings).
  const trainingId = training.startedAt ?? training.lastStart;
  const trainingNotes = notizItems.filter((n) => n.trainingId && !n.deletedAt);
  const trainingMinutes = training.startedAt
    ? Math.max(0, Math.floor((nowTick - Date.parse(training.startedAt)) / 60000))
    : 0;
  const lastDuration = training.lastStart && training.lastEnd
    ? Math.round((Date.parse(training.lastEnd) - Date.parse(training.lastStart)) / 60000)
    : null;

  const reload = useCallback(async () => {
    if (!fid) {
      setChildren([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await migrateRosterToBambini(fid);
      const [list, filters, notiz, trainingsideen, trainingState] = await Promise.all([
        loadBambini(fid),
        loadBambiniFilters(fid),
        loadBambiniNotizItems(fid),
        loadBambiniTrainingsideenItems(fid),
        loadBambiniTraining(fid),
      ]);
      setTraining(trainingState);
      // TE-82: läuft ein Training, direkt in den Trainingsmodus.
      if (trainingState.startedAt) setTrainingsideenOpen(true);
      setChildren(list);
      setYearFilter(filters.years);
      setStoppedFilter(filters.stopped);
      setWackelkandidatFilter(filters.wackelkandidat);
      setSortMode(filters.sortMode);
      setSortReversed(filters.sortReversed);
      setFiltersOpen(filters.filtersOpen);
      setNotizItems(notiz);
      setTrainingsideenItems(trainingsideen);
    } catch (e) {
      console.warn('Bambini laden fehlgeschlagen', e);
    } finally {
      filtersLoaded.current = true;
      setLoading(false);
    }
  }, [fid]);

  useEffect(() => {
    reload();
  }, [reload]);

  // TE-20: Filterwechsel in Firestore spiegeln (erst nach dem initialen Laden).
  useEffect(() => {
    if (!filtersLoaded.current || !fid) return;
    saveBambiniFilters(fid, {
      years: yearFilter,
      stopped: stoppedFilter,
      wackelkandidat: wackelkandidatFilter,
      sortMode,
      sortReversed,
      filtersOpen,
    }).catch((e) => console.warn('Bambini-Filter speichern fehlgeschlagen', e));
  }, [fid, yearFilter, stoppedFilter, wackelkandidatFilter, sortMode, sortReversed, filtersOpen]);

  const persist = useCallback(
    (next: Child[]) => {
      setChildren(next);
      if (fid) saveBambini(fid, next).catch((e) => console.warn('Bambini speichern fehlgeschlagen', e));
    },
    [fid],
  );

  const openNew = () => {
    setEditing({ id: '', name: '', birthYear: 0, registeredSince: '', stopped: false, parentName: '', lastName: '', info: '', whatsapp: false, sms: false, vereinAngemeldet: false, schnuppertraining: false });
    setNameInput('');
    setYearInput('');
    setSinceInput('');
    setStoppedInput(false);
    setParentInput('');
    setLastNameInput('');
    setInfoInput('');
    setWhatsappInput(false);
    setSmsInput(false);
    setVereinAngemeldetInput(false);
    setSchnuppertrainingInput(false);
  };

  const openEdit = (c: Child) => {
    setEditing(c);
    setNameInput(c.name);
    setYearInput(c.birthYear ? String(c.birthYear) : '');
    setSinceInput(c.registeredSince);
    setStoppedInput(c.stopped);
    setParentInput(c.parentName);
    setLastNameInput(c.lastName);
    setInfoInput(c.info);
    setWhatsappInput(c.whatsapp);
    setSmsInput(c.sms);
    setVereinAngemeldetInput(c.vereinAngemeldet);
    setSchnuppertrainingInput(c.schnuppertraining);
  };

  const closeModal = () => {
    setEditing(null);
    pendingNeuNoteId.current = null;
  };

  const saveEntry = () => {
    const name = nameInput.trim();
    if (!name) {
      closeModal();
      return;
    }
    const year = Number(yearInput);
    const birthYear = Number.isFinite(year) && year > 1900 ? Math.trunc(year) : 0;
    const patch = {
      name,
      birthYear,
      registeredSince: sinceInput,
      stopped: stoppedInput,
      parentName: parentInput.trim(),
      lastName: lastNameInput.trim(),
      info: infoInput.trim(),
      whatsapp: whatsappInput,
      sms: smsInput,
      vereinAngemeldet: vereinAngemeldetInput,
      schnuppertraining: schnuppertrainingInput,
    };

    if (editing && editing.id) {
      persist(children.map((c) => (c.id === editing.id ? { ...c, ...patch } : c)));
    } else {
      persist([...children, { id: makeId(), ...patch }]);
      // TE-81: aus einer „Neues Kind“-Trainingsnotiz angelegt → Notiz ist erledigt.
      if (pendingNeuNoteId.current) resolveNote(pendingNeuNoteId.current);
    }
    closeModal();
  };

  const removeEntry = (c: Child) => {
    confirmDelete(c.name, () => {
      persist(children.filter((x) => x.id !== c.id));
      if (editing?.id === c.id) closeModal();
    });
  };

  // TE-96: Live-Filter ab drei Zeichen (Vor-/Nachname, Elternname, Jahrgang).
  // TE-99: zusätzlich Quickfilter nach Jahrgang und „aufgehört".
  const q = query.trim().toLowerCase();
  const filtered = children.filter((c) => {
    if (q.length >= 3) {
      const matchesQuery =
        c.name.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.parentName.toLowerCase().includes(q) ||
        String(c.birthYear).includes(q);
      if (!matchesQuery) return false;
    }
    if (yearFilter.length > 0 && !yearFilter.includes(c.birthYear)) return false;
    if (stoppedFilter !== null && c.stopped !== stoppedFilter) return false;
    if (c.schnuppertraining && !wackelkandidatFilter) return false;
    return true;
  });

  // TE-109: flache Liste, keine Jahrgangs-Gruppierung mehr – Wackelkandidaten
  // reihen sich mit ein (Jahrgang steht ohnehin auf jedem Item).
  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === 'erstesmal') {
      if (!a.registeredSince && !b.registeredSince) return a.name.localeCompare(b.name, 'de');
      if (!a.registeredSince) return 1;
      if (!b.registeredSince) return -1;
      return a.registeredSince.localeCompare(b.registeredSince);
    }
    return b.birthYear - a.birthYear || a.name.localeCompare(b.name, 'de');
  });
  if (sortReversed) sorted.reverse();

  // TE-97: Übersicht über alle Kinder (ungefiltert, unabhängig von der Suche).
  const stoppedCount = children.filter((c) => c.stopped).length;
  const yearCounts: { year: number; count: number }[] = [];
  children.forEach((c) => {
    const y = yearCounts.find((x) => x.year === c.birthYear);
    if (y) y.count += 1;
    else yearCounts.push({ year: c.birthYear, count: 1 });
  });
  yearCounts.sort((a, b) => a.year - b.year);
  const yearSummary = yearCounts.map(({ year, count }) => `${year || '—'}: ${count}`).join(', ');
  const overviewText = `${children.length} Kinder · ${stoppedCount} aufgehört${yearSummary ? ' · ' + yearSummary : ''}`;

  const renderChildRow = (c: Child, index: number, status: 'aktiv' | 'gewechselt' | null, gewechselt: boolean) => {
    return (
      <Pressable
        style={[
          s.row,
          status === 'aktiv' && s.rowActive,
          gewechselt && s.rowMoved,
          c.schnuppertraining && s.rowSchnupper,
        ]}
        onPress={() => openEdit(c)}
      >
        <Text style={s.rowIndex}>{index + 1}.</Text>
        <View style={s.rowMain}>
          {/* TE-37: Datum nur noch im Detail; Elternname inline als graue Kapitälchen. */}
          <Text style={[s.rowName, c.stopped && s.rowNameStopped]} numberOfLines={1}>
            {c.name}
            {c.parentName ? <Text style={s.rowParent}>{'  '}{c.parentName.toUpperCase()}</Text> : null}
          </Text>
          {c.stopped ? <Text style={s.badgeStopped}>aufgehört</Text> : null}
        </View>
        {/* TE-39: Icons + Alter als enger Block, eigener kleiner gap statt Zeilen-gap 8. */}
        <View style={s.rowTrail}>
          <View style={s.iconSlot}>
            {c.whatsapp ? (
              <Ionicons name="logo-whatsapp" size={20} color={WHATSAPP_GREEN} accessibilityLabel="In WhatsApp-Gruppe" />
            ) : c.sms ? (
              <Ionicons name="chatbox-ellipses" size={20} color={SMS_BLUE} accessibilityLabel="Kommunikation per SMS" />
            ) : null}
          </View>
          <View style={s.iconSlot}>
            {!c.vereinAngemeldet ? (
              <Ionicons name="document-text" size={20} color={NOT_ANGEMELDET_RED} accessibilityLabel="Nicht im Verein angemeldet" />
            ) : null}
          </View>
          <View style={s.iconSlot}>
            {c.info ? (
              <Ionicons name="information-circle" size={20} color={INFO_YELLOW} accessibilityLabel="Info vorhanden" />
            ) : null}
          </View>
          {/* TE-38: Alter statt Jahrgang (nur Jahrgang gespeichert → Jahrgangsalter). */}
          <Text style={s.rowYear}>{c.birthYear ? `${new Date().getFullYear() - c.birthYear} J.` : '—'}</Text>
        </View>
      </Pressable>
    );
  };

  // TE-74 (Bento Dark): Zeile ohne eigenen Rahmen, Eltern als zweite graue Zeile,
  // Kontakt/Status als farbige Punkte. Alter steht im Gruppenkopf.
  const renderBentoRow = (c: Child, first: boolean) => {
    const dots: { color: string; label: string }[] = [];
    if (c.whatsapp) dots.push({ color: WHATSAPP_GREEN, label: 'In WhatsApp-Gruppe' });
    else if (c.sms) dots.push({ color: SMS_BLUE, label: 'Kommunikation per SMS' });
    if (!c.vereinAngemeldet) dots.push({ color: NOT_ANGEMELDET_RED, label: 'Nicht im Verein angemeldet' });
    if (c.info) dots.push({ color: INFO_YELLOW, label: 'Info vorhanden' });
    return (
      <Pressable
        key={c.id}
        style={[s.bRow, c.schnuppertraining && s.rowSchnupper]}
        onPress={() => openEdit(c)}
      >
        {!first ? <View style={s.bDivider} /> : null}
        <View style={s.bAvatar}>
          <Text style={s.bAvatarText}>{(c.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={s.bMain}>
          <View style={s.rowMain}>
            <Text style={[s.bName, c.stopped && s.rowNameStopped]} numberOfLines={1}>{c.name}</Text>
            {c.stopped ? <Text style={s.badgeStopped}>aufgehört</Text> : null}
          </View>
          {c.parentName ? <Text style={s.bParent} numberOfLines={1}>{c.parentName}</Text> : null}
        </View>
        <View style={s.bDots}>
          {dots.map((d) => (
            <View key={d.label} style={[s.bDot, { backgroundColor: d.color }]} accessibilityLabel={d.label} />
          ))}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
    );
  };

  const EXERCISE_GRADIENTS: [string, string][] = [
    ['#0A5CFF', '#00B8D9'],
    ['#7B2FF7', '#F72585'],
    ['#FF9F0A', '#FF375F'],
    ['#30D158', '#00B8D9'],
  ];
  const NOTE_TAG: Record<NotizKind, { label: string; color: string }> = {
    tel: { label: 'TEL', color: '#4A9EFF' },
    neu: { label: 'NEU', color: '#30D158' },
    info: { label: 'INFO', color: colors.textSecondary },
  };
  const QUICK_CHIPS: { kind: NotizKind; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { kind: 'tel', label: 'Telefon', icon: 'call' },
    { kind: 'neu', label: 'Neues Kind', icon: 'person-add' },
    { kind: 'info', label: 'Notiz', icon: 'create' },
  ];

  // TE-81: Trainingsmodus. Eine Kachel startet und beendet an derselben Stelle.
  const renderTraining = () => {
    if (loading) return null;
    const running = !!training.startedAt;
    const startSub = markedTrainingsideenItems.length
      ? `${markedTrainingsideenItems.length} ${markedTrainingsideenItems.length === 1 ? 'Übung' : 'Übungen'} für heute`
      : lastDuration !== null
        ? `Letztes Training ${formatDE(training.lastEnd!.slice(0, 10))}, ${lastDuration} min`
        : 'Unten Übungen für heute auswählen';
    const tileColors: [string, string] = running ? ['#FF375F', '#7928CA'] : ['#30D158', '#00B8D9'];
    return (
      <View style={s.trainSection}>
        <Pressable style={s.trainTile} onPress={toggleTraining} accessibilityLabel={running ? 'Training beenden' : 'Training starten'}>
          <LinearGradient colors={[mono(tileColors[0]), mono(tileColors[1])]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={s.trainIcon}>
            <Ionicons name={running ? 'stop' : 'play'} size={18} color="#FFFFFF" />
          </View>
          <View style={s.bMain}>
            <Text style={s.trainTitle}>{running ? 'Training beenden' : 'Training starten'}</Text>
            <Text style={s.trainSub} numberOfLines={1}>
              {running ? `seit ${new Date(training.startedAt!).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : startSub}
            </Text>
          </View>
          {running ? <Text style={s.trainTimer}>{trainingMinutes}′</Text> : null}
        </Pressable>

        {running || trainingNotes.length > 0 ? (
          <View style={s.quickBox}>
            {running ? (
              <>
                <View style={s.quickRow}>
                  <TextInput
                    style={[s.input, s.quickInput]}
                    value={quickText}
                    onChangeText={setQuickText}
                    onSubmitEditing={addQuickNote}
                    placeholder="Notiz … z. B. Telefonnummer, neues Kind"
                    placeholderTextColor={colors.placeholder}
                    returnKeyType="send"
                    blurOnSubmit={false}
                  />
                  <Pressable style={s.quickSend} onPress={addQuickNote} accessibilityLabel="Notiz speichern">
                    <LinearGradient colors={[mono('#FFE600'), mono('#FF7A00')]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    <Ionicons name="arrow-up" size={16} color="#1C1C1E" />
                  </Pressable>
                </View>
                <View style={s.quickChips}>
                  {QUICK_CHIPS.map((ch) => {
                    const on = quickKindEffective === ch.kind && quickText.trim().length > 0;
                    return (
                      <Pressable
                        key={ch.kind}
                        style={[s.filterChip, on && s.filterChipActive]}
                        onPress={() => setQuickKind((v) => (v === ch.kind ? null : ch.kind))}
                      >
                        <Text style={[s.filterChipText, on && s.filterChipTextActive]}>{ch.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <Text style={s.bTileLabel}>Notizen vom Training</Text>
            )}
            {trainingNotes.map((n) => {
              const kind = n.kind ?? 'info';
              const tag = NOTE_TAG[kind];
              return (
                <View key={n.id} style={s.quickNote}>
                  <Text style={[s.quickTag, { color: tag.color, backgroundColor: tag.color + '26' }]}>{tag.label}</Text>
                  <View style={s.bMain}>
                    <Text style={s.quickNoteText}>{n.text}</Text>
                    <Text style={s.quickNoteTime}>
                      {n.trainingId !== trainingId ? `${formatDE(n.createdAt.slice(0, 10))}, ` : ''}
                      {new Date(n.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  {!running || n.trainingId !== trainingId ? (
                    <Pressable
                      hitSlop={8}
                      onPress={() =>
                        kind === 'tel' ? setAssignNoteId(n.id) : kind === 'neu' ? createFromNeu(n) : resolveNote(n.id)
                      }
                    >
                      <Text style={s.quickAction}>{kind === 'tel' ? 'Zu Kind →' : kind === 'neu' ? 'Anlegen →' : 'Erledigt'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {markedTrainingsideenItems.length > 0 ? (
          <>
            <Text style={[s.bTileLabel, s.exLabel]}>Übungen heute</Text>
            <View style={s.exGrid}>
              {markedTrainingsideenItems.map((n, i) => {
                const g = EXERCISE_GRADIENTS[i % EXERCISE_GRADIENTS.length];
                return (
                  <View key={n.id} style={s.exCard}>
                    <LinearGradient colors={[mono(g[0]), mono(g[1])]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    <Text style={s.exText} numberOfLines={3}>{n.text}</Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
      </View>
    );
  };

  // TE-82: Trainingsmodus als eigene Ansicht hinter dem Glühbirnen-Button –
  // Start/Beenden, Übungskarten, Schnellnotiz und Auswahl der Übungen für heute.
  const renderTrainingView = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.tvHeader}>
          <Ionicons name="bulb" size={20} color="#4A9EFF" />
          <Text style={s.tvTitle}>Trainingsmodus</Text>
          <Pressable onPress={() => setTrainingsideeHistoryOpen(true)} hitSlop={10} accessibilityLabel="Verlauf">
            <Ionicons name="time-outline" size={20} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={closeTrainingsideen} hitSlop={12} accessibilityLabel="Zur Bambini-Übersicht">
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        {renderTraining()}

        <Text style={[s.bTileLabel, s.exLabel]}>Übungen auswählen</Text>
        <View style={s.tvIdeas}>
          {activeTrainingsideenItems.length === 0 ? (
            <Text style={s.empty}>Noch keine Trainingsideen.</Text>
          ) : (
            activeTrainingsideenItems.map((n, idx) => (
              <View key={n.id} style={s.notizItemRow}>
                <View style={s.notizItemMain}>
                  <View style={s.notizReorder}>
                    <Pressable onPress={() => moveTrainingsideeItem(n.id, -1)} disabled={idx === 0} hitSlop={4} accessibilityLabel="Nach oben verschieben">
                      <Ionicons name="chevron-up" size={14} color={idx === 0 ? colors.border : colors.textSecondary} />
                    </Pressable>
                    <Pressable onPress={() => moveTrainingsideeItem(n.id, 1)} disabled={idx === activeTrainingsideenItems.length - 1} hitSlop={4} accessibilityLabel="Nach unten verschieben">
                      <Ionicons name="chevron-down" size={14} color={idx === activeTrainingsideenItems.length - 1 ? colors.border : colors.textSecondary} />
                    </Pressable>
                  </View>
                  {/* TE-81: „heute“ – angeschaltete Ideen erscheinen als Übungskarten auf der Bambini-Seite. */}
                  <Pressable
                    onPress={() => toggleTrainingsideeMarked(n.id)}
                    hitSlop={8}
                    style={[s.heutePill, n.marked && s.heutePillOn]}
                    accessibilityLabel={n.marked ? 'Nicht mehr für heute' : 'Für heute einplanen'}
                  >
                    {n.marked ? (
                      <LinearGradient colors={[mono('#0A5CFF'), mono('#00B8D9')]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    ) : null}
                    <Text style={[s.heutePillText, n.marked && s.heutePillTextOn]}>heute</Text>
                  </Pressable>
                  {trainingsideeEditId === n.id ? (
                    <>
                      <TextInput
                        style={[s.input, s.notizEditInput]}
                        value={trainingsideeEditText}
                        onChangeText={setTrainingsideeEditText}
                        onSubmitEditing={saveEditTrainingsidee}
                        returnKeyType="done"
                        autoFocus
                      />
                      <Pressable onPress={saveEditTrainingsidee} hitSlop={8} accessibilityLabel="Speichern">
                        <Ionicons name="checkmark" size={20} color={colors.accent} />
                      </Pressable>
                      <Pressable onPress={cancelEditTrainingsidee} hitSlop={8} accessibilityLabel="Abbrechen">
                        <Ionicons name="close" size={18} color={colors.textSecondary} />
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Text style={s.notizItemText}>{n.text}</Text>
                      <Pressable onPress={() => startEditTrainingsidee(n)} hitSlop={8} accessibilityLabel="Bearbeiten">
                        <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                      </Pressable>
                      <Pressable onPress={() => deleteTrainingsideeItem(n.id)} hitSlop={8} accessibilityLabel="Löschen">
                        <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            ))
          )}
                <View style={s.notizAddRow}>
          <TextInput
            style={[s.input, s.notizAddInput]}
            value={trainingsideeInput}
            onChangeText={setTrainingsideeInput}
            placeholder="Neue Trainingsidee…"
            placeholderTextColor={colors.placeholder}
            onSubmitEditing={addTrainingsideeItem}
            returnKeyType="done"
          />
          <GradientButton gradient={colors.gradients?.idea} onPress={addTrainingsideeItem} style={[[s.btn, s.notizAddBtn], PLUS_BUTTON]} fallbackStyle={{ backgroundColor: '#4A9EFF' }} accessibilityLabel="Trainingsidee hinzufügen">
            <Ionicons name="add" size={PLUS_ICON_SIZE} color={colors.gradients?.idea?.fg ?? '#0A2A4A'} />
          </GradientButton>
                </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // TE-76: Bento-Kacheln – Zahlen, Jahrgangs-Balken (antippen = filtern), Beitrag, Vereinsseite.
  const renderBentoTiles = () => {
    const maxCount = Math.max(1, ...yearCounts.map((y) => y.count));
    const toggleYear = (year: number) =>
      setYearFilter((v) => (v.includes(year) ? v.filter((y) => y !== year) : [...v, year]));
    return (
      <View style={s.bTiles}>
        <View style={s.bTileRow}>
          <Pressable style={[s.bTile, s.bTileHalf]} onPress={() => setStoppedFilter((v) => (v === false ? null : false))}>
            {/* TE-77: Verläufe aus der Button-Palette (theme.ts gradients). */}
            <LinearGradient colors={['#30D158', '#00B8D9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={s.bTileHead}>
              <Text style={[s.bTileLabel, s.bOnColor]}>Aktiv</Text>
              <Ionicons name="people" size={18} color="#FFFFFF" />
            </View>
            <Text style={[s.bTileNumber, s.bOnColor]}>{children.length - stoppedCount}</Text>
          </Pressable>
          <Pressable style={[s.bTile, s.bTileHalf]} onPress={() => setStoppedFilter((v) => (v === true ? null : true))}>
            <LinearGradient colors={['#FF375F', '#7928CA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={s.bTileHead}>
              <Text style={[s.bTileLabel, s.bOnColor]}>Aufgehört</Text>
              <Ionicons name="exit-outline" size={18} color="#FFFFFF" />
            </View>
            <Text style={[s.bTileNumber, s.bOnColor]}>{stoppedCount}</Text>
          </Pressable>
        </View>

        <View style={s.bTile}>
          <View style={s.bTileHead}>
            <Text style={s.bTileLabel}>Jahrgänge</Text>
            <Ionicons name="bar-chart" size={18} color={colors.accent} />
          </View>
          <View style={s.bBars}>
            {yearCounts.map(({ year, count }) => {
              // TE-77: aktive Jahrgänge (alle, wenn kein Filter) im Verlauf, übrige gedimmt.
              const on = yearFilter.length === 0 || yearFilter.includes(year);
              return (
                <Pressable key={year} style={s.bBarCol} onPress={() => toggleYear(year)} accessibilityLabel={`Jahrgang ${year || 'ohne'} filtern`}>
                  <Text style={[s.bBarCount, !on && s.bBarOff]}>{count}</Text>
                  <View style={[s.bBar, { height: 8 + (count / maxCount) * 52 }]}>
                    {on ? (
                      <LinearGradient colors={['#00B8D9', '#0A5CFF', '#7B61FF']} style={StyleSheet.absoluteFill} />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceHigh }]} />
                    )}
                  </View>
                  <Text style={[s.bBarYear, on && { color: colors.text }]}>{year ? String(year).slice(2) : '—'}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={s.bTileRow}>
          <Pressable style={[s.bTile, s.bTileHalf]} onPress={() => Linking.openURL('https://serkowitzer-fsv.de/dokumente/')}>
            <View style={[s.bIconBadge, { backgroundColor: colors.warning + '26' }]}>
              <Ionicons name="wallet" size={16} color={colors.warning} />
            </View>
            <Text style={s.bTileTitle}>Beitrag</Text>
            <Text style={s.bTileSub}>70 € / Jahr{'\n'}35 € / Halbjahr</Text>
          </Pressable>
          <Pressable style={[s.bTile, s.bTileHalf]} onPress={() => Linking.openURL('https://serkowitzer-fsv.de/g-junioren/#')}>
            <View style={s.bTileHead}>
              <View style={[s.bIconBadge, { backgroundColor: colors.accent + '26' }]}>
                <Ionicons name="football" size={16} color={colors.accent} />
              </View>
              <Ionicons name="arrow-up-outline" size={16} color={colors.textMuted} style={{ transform: [{ rotate: '45deg' }] }} />
            </View>
            <Text style={s.bTileTitle}>Vereinsseite</Text>
            <Text style={s.bTileSub}>G-Junioren auf serkowitzer-fsv.de</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  // Gruppen nur bei Jahrgangs-Sortierung; bei „erstes Mal" eine einzige Gruppe ohne Kopf.
  const bentoGroups: { year: number | null; items: Child[] }[] = [];
  if (bento) {
    sorted.forEach((c) => {
      const key = sortMode === 'jahrgang' ? c.birthYear : null;
      const last = bentoGroups[bentoGroups.length - 1];
      if (last && last.year === key) last.items.push(c);
      else bentoGroups.push({ year: key, items: [c] });
    });
  }

  return (
    <View style={s.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} />
      ) : trainingsideenOpen ? (
        renderTrainingView()
      ) : (
        <>
          {children.length > 0 ? (
            <View style={s.filterToggleRow}>
              {bento ? <View style={s.bSpacer} /> : <Text style={s.overview} numberOfLines={2}>{overviewText}</Text>}
              <Pressable
                style={[s.filterToggleBtn, filtersOpen && s.filterToggleBtnActive]}
                onPress={() => setFiltersOpen((v) => !v)}
                accessibilityLabel={filtersOpen ? 'Filter schließen' : 'Filter anzeigen'}
              >
                <Ionicons
                  name={filtersOpen ? 'close' : 'options-outline'}
                  size={18}
                  color={filtersOpen ? colors.accentFg : colors.textSecondary}
                />
              </Pressable>
            </View>
          ) : null}

          {/* TE-110: Such-/Filter-/Sortierbereich – sitzt inline über der Liste (kein
              eigener Layer), ein-/ausblendbar über den Filter-Button oben. */}
          {children.length > 0 && filtersOpen ? (
            <>
              <SearchInput
                value={query}
                onChangeText={setQuery}
                placeholder="Suchen (ab 3 Zeichen)"
                colors={colors}
                style={s.searchInputMargin}
              />

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.quickFiltersScroll}
                contentContainerStyle={s.quickFilters}
                keyboardShouldPersistTaps="handled"
              >
                <Pressable
                  style={[s.filterChip, stoppedFilter === false && s.filterChipActive]}
                  onPress={() => setStoppedFilter((v) => (v === false ? null : false))}
                >
                  <Text style={[s.filterChipText, stoppedFilter === false && s.filterChipTextActive]}>Aktiv</Text>
                </Pressable>
                <Pressable
                  style={[s.filterChip, stoppedFilter === true && s.filterChipActive]}
                  onPress={() => setStoppedFilter((v) => (v === true ? null : true))}
                >
                  <Text style={[s.filterChipText, stoppedFilter === true && s.filterChipTextActive]}>Aufgehört</Text>
                </Pressable>
                <Pressable
                  style={[s.filterChip, wackelkandidatFilter && s.filterChipActive]}
                  onPress={() => setWackelkandidatFilter((v) => !v)}
                >
                  <Text style={[s.filterChipText, wackelkandidatFilter && s.filterChipTextActive]}>Wackelkandidaten</Text>
                </Pressable>
                {yearCounts.map(({ year }) => (
                  <Pressable
                    key={year}
                    style={[s.filterChip, yearFilter.includes(year) && s.filterChipActive]}
                    onPress={() =>
                      setYearFilter((v) => (v.includes(year) ? v.filter((y) => y !== year) : [...v, year]))
                    }
                  >
                    <Text style={[s.filterChipText, yearFilter.includes(year) && s.filterChipTextActive]}>
                      {year || 'Ohne Jahrgang'}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={s.sortRow}>
                <Text style={s.sortLabel}>Sortierung</Text>
                <Pressable style={s.sortButton} onPress={() => setSortMenuOpen(true)} accessibilityLabel="Sortierung wählen">
                  <Text style={s.sortButtonText} numberOfLines={1}>
                    {SORT_OPTIONS.find((o) => o.value === sortMode)?.label}
                  </Text>
                  <Ionicons name={sortReversed ? 'arrow-up' : 'arrow-down'} size={14} color={colors.textSecondary} />
                  <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                </Pressable>
              </View>

              {yearFilter.length > 0 || stoppedFilter !== null || wackelkandidatFilter ? (
                <Text style={s.resultCount}>{filtered.length} Treffer</Text>
              ) : null}
            </>
          ) : null}

          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            {/* TE-76 (Bento Dark): Kachel-Kopf statt Übersichtszeile und Info-Karten unten. */}
            {bento && children.length > 0 ? renderBentoTiles() : null}

            {/* TE-101/TE-103: markierte Notiz-Items (wichtig/nächste Aufgabe) als gelbe Alert-Box, gleiches Gelb wie der Notizen-FAB. */}
            {markedNotizItems.length > 0 ? (
              <View style={s.markedBox}>
                {markedNotizItems.map((n) => (
                  <View key={n.id} style={s.markedItemRow}>
                    <View style={s.markedDot} />
                    <Text style={s.markedText} numberOfLines={1}>{n.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}


            {children.length === 0 ? (
              <Text style={s.empty}>Noch keine Kinder. Mit „+" anlegen.</Text>
            ) : sorted.length === 0 ? (
              <Text style={s.empty}>Keine Treffer.</Text>
            ) : bento ? (
              bentoGroups.map((g) => (
                <View key={String(g.year)} style={s.bSection}>
                  {g.year !== null ? (
                    <View style={s.bGroupHead}>
                      <Text style={s.bGroupTitle}>
                        {g.year ? `Jahrgang ${g.year} · ${new Date().getFullYear() - g.year} J.` : 'Ohne Jahrgang'}
                      </Text>
                      <Text style={s.bGroupTitle}>{g.items.length}</Text>
                    </View>
                  ) : null}
                  <View style={s.bGroup}>{g.items.map((c, i) => renderBentoRow(c, i === 0))}</View>
                </View>
              ))
            ) : (
              sorted.map((c, index) => {
                const status = c.birthYear ? getJahrgangStatus(c.birthYear) : null;
                const gewechselt = status === 'gewechselt';
                return <React.Fragment key={c.id}>{renderChildRow(c, index, status, gewechselt)}</React.Fragment>;
              })
            )}

            {!bento ? (
            <>
            {/* TE-47: Beitragshöhe aus der Beitragsordnung 2026 (serkowitzer-fsv.de),
                Link führt zur Dokumente-Seite (Mitgliedsantrag, Beitragsordnung). */}
            <Pressable
              style={s.beitragCard}
              onPress={() => Linking.openURL('https://serkowitzer-fsv.de/dokumente/')}
            >
              <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
              <View style={s.rowMain}>
                <Text style={s.beitragTitle}>Beitrag G-Jugend (Bambini): 70,00 € / Jahr · 35,00 € / Halbjahr</Text>
                <Text style={s.beitragSub}>Beitragsordnung 2026 · Mitgliedsantrag unter serkowitzer-fsv.de/dokumente</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
            </Pressable>

            <Pressable
              style={s.beitragCard}
              onPress={() => Linking.openURL('https://serkowitzer-fsv.de/g-junioren/#')}
            >
              <Ionicons name="football-outline" size={18} color={colors.textSecondary} />
              <View style={s.rowMain}>
                <Text style={s.beitragTitle}>G-Junioren auf serkowitzer-fsv.de</Text>
                <Text style={s.beitragSub}>Vereinsseite der G-Jugend</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
            </Pressable>
            </>
            ) : null}
          </ScrollView>
        </>
      )}

      {/* TE-82: im Trainingsmodus nur die Glühbirne (führt zurück), sonst alle FABs. */}
      {!trainingsideenOpen ? (
        <>
          {/* TE-87: gleiches Icon/gleiche Aktion wie das Fußball-Icon auf dem Dashboard. */}
          <FussballKachel forceTheme="fussball" iconStyle={s.fabFussball} iconSize={26} />

          {/* TE-44: dritter FAB für freie Notizen (Trainingsideen o. Ä.). */}
          <Pressable style={s.fabNotizen} onPress={openNotizen} accessibilityLabel="Notizen öffnen">
            <Ionicons name="document-text" size={24} color="#3A2E00" />
          </Pressable>
        </>
      ) : null}

      {/* TE-113/TE-82: Glühbirne öffnet und schließt den Trainingsmodus. */}
      <Pressable
        style={[s.fabTrainingsideen, trainingsideenOpen && s.fabTrainingsideenOn]}
        onPress={trainingsideenOpen ? closeTrainingsideen : openTrainingsideen}
        accessibilityLabel={trainingsideenOpen ? 'Trainingsmodus schließen' : 'Trainingsmodus öffnen'}
      >
        <Ionicons name={trainingsideenOpen ? 'close' : 'bulb'} size={24} color="#0A2A4A" />
      </Pressable>

      {!trainingsideenOpen ? (
        <GradientButton gradient={colors.gradients?.primary} style={[s.fab, PLUS_BUTTON]} onPress={openNew} accessibilityLabel="Kind hinzufügen">
          <Ionicons name="add" size={PLUS_ICON_SIZE} color={colors.gradients?.primary?.fg ?? colors.accentFg} />
        </GradientButton>
      ) : null}

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={saveEntry}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.card}>
            <Text style={s.cardTitle}>{editing?.id ? 'Kind bearbeiten' : 'Neues Kind'}</Text>
            <TextInput
              style={s.input}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Name"
              placeholderTextColor={colors.placeholder}
              autoFocus
            />
            <TextInput
              style={s.input}
              value={yearInput}
              onChangeText={(t) => setYearInput(t.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="Geburtsjahr (z. B. 2019)"
              placeholderTextColor={colors.placeholder}
              keyboardType="number-pad"
              maxLength={4}
            />

            <Pressable style={s.dateField} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
              <Text style={[s.dateFieldText, { color: sinceInput ? colors.text : colors.placeholder }]}>
                {sinceInput ? `Das erste Mal da seit ${formatDE(sinceInput)}` : 'Das erste Mal da seit …'}
              </Text>
              {sinceInput ? (
                <Pressable onPress={() => setSinceInput('')} hitSlop={8} accessibilityLabel="Datum entfernen">
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </Pressable>

            <Pressable style={s.checkRow} onPress={() => setStoppedInput((v) => !v)}>
              <Ionicons
                name={stoppedInput ? 'checkbox' : 'square-outline'}
                size={22}
                color={stoppedInput ? colors.accent : colors.textSecondary}
              />
              <Text style={[s.checkLabel, { color: colors.text }]}>Hat aufgehört</Text>
            </Pressable>

            <Pressable style={s.checkRow} onPress={() => setWhatsappInput((v) => !v)}>
              <Ionicons
                name={whatsappInput ? 'checkbox' : 'square-outline'}
                size={22}
                color={whatsappInput ? colors.accent : colors.textSecondary}
              />
              <Text style={[s.checkLabel, { color: colors.text }]}>In WhatsApp-Gruppe</Text>
            </Pressable>

            <Pressable style={s.checkRow} onPress={() => setSmsInput((v) => !v)}>
              <Ionicons
                name={smsInput ? 'checkbox' : 'square-outline'}
                size={22}
                color={smsInput ? colors.accent : colors.textSecondary}
              />
              <Text style={[s.checkLabel, { color: colors.text }]}>Kein WhatsApp, per SMS</Text>
            </Pressable>

            <Pressable style={s.checkRow} onPress={() => setVereinAngemeldetInput((v) => !v)}>
              <Ionicons
                name={vereinAngemeldetInput ? 'checkbox' : 'square-outline'}
                size={22}
                color={vereinAngemeldetInput ? colors.accent : colors.textSecondary}
              />
              <Text style={[s.checkLabel, { color: colors.text }]}>Im Verein angemeldet</Text>
            </Pressable>

            <Pressable style={s.checkRow} onPress={() => setSchnuppertrainingInput((v) => !v)}>
              <Ionicons
                name={schnuppertrainingInput ? 'checkbox' : 'square-outline'}
                size={22}
                color={schnuppertrainingInput ? colors.accent : colors.textSecondary}
              />
              <Text style={[s.checkLabel, { color: colors.text }]}>Wackelkandidat</Text>
            </Pressable>

            <TextInput
              style={s.input}
              value={parentInput}
              onChangeText={setParentInput}
              placeholder="Elternname"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={s.input}
              value={lastNameInput}
              onChangeText={setLastNameInput}
              placeholder="Nachname"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={[s.input, s.inputMultiline]}
              value={infoInput}
              onChangeText={setInfoInput}
              placeholder="Info (z. B. Allergie, Hinweis)"
              placeholderTextColor={colors.placeholder}
              multiline
            />

            <View style={[s.cardActions, editing?.id ? s.cardActionsWithDelete : null]}>
              {editing?.id ? (
                <Pressable onPress={() => editing && removeEntry(editing)} hitSlop={8} accessibilityLabel="Kind löschen">
                  <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
                </Pressable>
              ) : null}
              <View style={s.cardActionsRight}>
                <Pressable onPress={closeModal} style={[s.btn, s.btnGhost]}>
                  <Text style={[s.btnText, { color: colors.textSecondary }]}>Abbrechen</Text>
                </Pressable>
                <Pressable onPress={saveEntry} style={[s.btn, { backgroundColor: colors.accent }]}>
                  <Text style={[s.btnText, { color: colors.accentFg }]}>Speichern</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={notizenOpen} transparent animationType="fade" onRequestClose={closeNotizen}>
        <Pressable style={s.overlay} onPress={closeNotizen}>
          <KeyboardAvoidingView style={s.notizenKav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={[s.card, s.notizenCard]} onPress={() => {}}>
              <View style={s.notizenHeader}>
                <Ionicons name="document-text" size={18} color="#F2C518" />
                <Text style={[s.cardTitle, s.notizenTitle]}>Notizen</Text>
                <Pressable onPress={() => setNotizHistoryOpen(true)} hitSlop={10} accessibilityLabel="Verlauf">
                  <Ionicons name="time-outline" size={20} color={colors.textMuted} />
                </Pressable>
                <Pressable onPress={closeNotizen} hitSlop={12} accessibilityLabel="Schließen">
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>
              <ScrollView style={s.notizenList} keyboardShouldPersistTaps="handled">
                {activeNotizItems.length === 0 ? (
                  <Text style={s.empty}>Noch keine Notizen.</Text>
                ) : (
                  activeNotizItems.map((n, idx) => (
                    <View key={n.id} style={s.notizItemRow}>
                      <View style={s.notizItemMain}>
                        <View style={s.notizReorder}>
                          <Pressable onPress={() => moveNotizItem(n.id, -1)} disabled={idx === 0} hitSlop={4} accessibilityLabel="Nach oben verschieben">
                            <Ionicons name="chevron-up" size={14} color={idx === 0 ? colors.border : colors.textSecondary} />
                          </Pressable>
                          <Pressable onPress={() => moveNotizItem(n.id, 1)} disabled={idx === activeNotizItems.length - 1} hitSlop={4} accessibilityLabel="Nach unten verschieben">
                            <Ionicons name="chevron-down" size={14} color={idx === activeNotizItems.length - 1 ? colors.border : colors.textSecondary} />
                          </Pressable>
                        </View>
                        <Pressable
                          onPress={() => toggleNotizMarked(n.id)}
                          hitSlop={8}
                          accessibilityLabel={n.marked ? 'Markierung entfernen' : 'Als wichtig markieren'}
                        >
                          <Ionicons name={n.marked ? 'star' : 'star-outline'} size={20} color="#F2C518" />
                        </Pressable>
                        {notizEditId === n.id ? (
                          <>
                            <TextInput
                              style={[s.input, s.notizEditInput]}
                              value={notizEditText}
                              onChangeText={setNotizEditText}
                              onSubmitEditing={saveEditNotiz}
                              returnKeyType="done"
                              autoFocus
                            />
                            <Pressable onPress={saveEditNotiz} hitSlop={8} accessibilityLabel="Speichern">
                              <Ionicons name="checkmark" size={20} color={colors.accent} />
                            </Pressable>
                            <Pressable onPress={cancelEditNotiz} hitSlop={8} accessibilityLabel="Abbrechen">
                              <Ionicons name="close" size={18} color={colors.textSecondary} />
                            </Pressable>
                          </>
                        ) : (
                          <>
                            <Text style={s.notizItemText}>{n.text}</Text>
                            <Pressable onPress={() => startEditNotiz(n)} hitSlop={8} accessibilityLabel="Bearbeiten">
                              <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                            </Pressable>
                            <Pressable onPress={() => deleteNotizItem(n.id)} hitSlop={8} accessibilityLabel="Löschen">
                              <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                            </Pressable>
                          </>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>

              <View style={s.notizAddRow}>
                <TextInput
                  style={[s.input, s.notizAddInput]}
                  value={notizInput}
                  onChangeText={setNotizInput}
                  placeholder="Neue Notiz…"
                  placeholderTextColor={colors.placeholder}
                  onSubmitEditing={addNotizItem}
                  returnKeyType="done"
                />
                <GradientButton gradient={colors.gradients?.primary} onPress={addNotizItem} style={[[s.btn, s.notizAddBtn], PLUS_BUTTON]} fallbackStyle={{ backgroundColor: colors.accent }} accessibilityLabel="Notiz hinzufügen">
                  <Ionicons name="add" size={PLUS_ICON_SIZE} color={colors.gradients?.primary?.fg ?? colors.accentFg} />
                </GradientButton>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* TE-113: Verlauf-Dialog für gelöschte Notizen, gleiches Muster wie im Schule-Tab. */}
      <Modal visible={notizHistoryOpen} transparent animationType="fade" onRequestClose={() => setNotizHistoryOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setNotizHistoryOpen(false)}>
          <Pressable style={s.historyBox} onPress={() => {}}>
            <View style={s.notizenHeader}>
              <Text style={s.cardTitle}>Verlauf</Text>
              <Pressable onPress={() => setNotizHistoryOpen(false)} hitSlop={12} accessibilityLabel="Schließen">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
            {deletedNotizItems.length === 0 ? (
              <Text style={s.empty}>Noch nichts gelöscht.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {deletedNotizItems.map((n) => (
                  <View key={n.id} style={s.historyRow}>
                    <Ionicons name="trash" size={18} color={colors.danger} />
                    <Text style={s.historyTitle} numberOfLines={2}>{n.text}</Text>
                    <Pressable onPress={() => restoreNotizItem(n.id)} hitSlop={8} accessibilityLabel="Wiederherstellen">
                      <Ionicons name="arrow-undo-circle-outline" size={20} color={colors.accentNeon} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* TE-81: Telefonnummer aus einer Trainingsnotiz einem Kind zuordnen (landet in dessen Info). */}
      <Modal visible={assignNoteId !== null} transparent animationType="fade" onRequestClose={() => setAssignNoteId(null)}>
        <Pressable style={s.overlay} onPress={() => setAssignNoteId(null)}>
          <Pressable style={[s.card, s.assignCard]} onPress={() => {}}>
            <Text style={s.cardTitle}>Zu welchem Kind?</Text>
            <Text style={s.quickNoteTime} numberOfLines={2}>
              {notizItems.find((n) => n.id === assignNoteId)?.text}
            </Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {[...children]
                .filter((c) => !c.stopped)
                .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                .map((c) => (
                  <Pressable key={c.id} style={s.assignRow} onPress={() => assignTelToChild(c)}>
                    <Text style={s.bName}>{c.name}</Text>
                    {c.parentName ? <Text style={s.bParent}>{c.parentName}</Text> : null}
                  </Pressable>
                ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>


      {/* TE-113: Verlauf-Dialog für gelöschte Trainingsideen. */}
      <Modal visible={trainingsideeHistoryOpen} transparent animationType="fade" onRequestClose={() => setTrainingsideeHistoryOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setTrainingsideeHistoryOpen(false)}>
          <Pressable style={s.historyBox} onPress={() => {}}>
            <View style={s.notizenHeader}>
              <Text style={s.cardTitle}>Verlauf</Text>
              <Pressable onPress={() => setTrainingsideeHistoryOpen(false)} hitSlop={12} accessibilityLabel="Schließen">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
            {deletedTrainingsideenItems.length === 0 ? (
              <Text style={s.empty}>Noch nichts gelöscht.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {deletedTrainingsideenItems.map((n) => (
                  <View key={n.id} style={s.historyRow}>
                    <Ionicons name="trash" size={18} color={colors.danger} />
                    <Text style={s.historyTitle} numberOfLines={2}>{n.text}</Text>
                    <Pressable onPress={() => restoreTrainingsideeItem(n.id)} hitSlop={8} accessibilityLabel="Wiederherstellen">
                      <Ionicons name="arrow-undo-circle-outline" size={20} color={colors.accentNeon} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <DatePickerModal
        visible={showDatePicker}
        value={parseISO(sinceInput)}
        onConfirm={(d) => { setSinceInput(toISO(d)); setShowDatePicker(false); }}
        onCancel={() => setShowDatePicker(false)}
        colors={colors}
      />

      <Modal visible={sortMenuOpen} transparent animationType="fade" onRequestClose={() => setSortMenuOpen(false)}>
        <Pressable style={s.sortOverlay} onPress={() => setSortMenuOpen(false)}>
          <View style={s.sortMenu}>
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => { setSortMode(opt.value); setSortMenuOpen(false); }}
                style={[s.sortMenuItem, sortMode === opt.value && s.sortMenuItemActive]}
              >
                <Text style={s.sortMenuText}>{opt.label}</Text>
                {sortMode === opt.value ? <Ionicons name="checkmark" size={16} color={colors.accent} /> : null}
              </Pressable>
            ))}
            <View style={s.sortDivider} />
            <Pressable onPress={() => setSortReversed((v) => !v)} style={s.sortMenuItem}>
              <View style={s.sortReverseRow}>
                <Ionicons
                  name={sortReversed ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={sortReversed ? colors.accent : colors.textSecondary}
                />
                <Text style={s.sortMenuText}>Umgekehrte Reihenfolge</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { padding: 12, paddingBottom: 96 },
    empty: { color: c.textSecondary, textAlign: 'center', marginTop: 40, fontSize: 14 },

    // TE-110: Übersicht + Filter-Toggle in einer Zeile.
    filterToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginHorizontal: 12,
      marginTop: 10,
    },
    // TE-97: kompakte Übersicht über alle Kinder, reiner Text ohne Button-Optik.
    overview: {
      flex: 1,
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    filterToggleBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBackground,
      borderWidth: 1,
      borderColor: c.border,
    },
    filterToggleBtnActive: { backgroundColor: c.accent, borderColor: c.accent },

    // TE-98: SearchInput-Komponente mit globalem Design.
    searchInputMargin: {
      marginHorizontal: 12,
      marginTop: 12,
    },

    // TE-99: Quickfilter-Pills unter der Suchleiste.
    // RN-ScrollView ist standardmäßig flexGrow/flexShrink: 1 (auch horizontal) —
    // als Sibling der großen Listen-ScrollView würde sie sich sonst den
    // verfügbaren Platz teilen und auf eine Restbreite zusammengequetscht werden.
    quickFiltersScroll: { flexGrow: 0, flexShrink: 0 },
    quickFilters: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 10 },
    resultCount: { color: c.textSecondary, fontSize: 12, fontWeight: '600', marginHorizontal: 12, marginTop: 6 },

    // TE-109: Sortierungs-Dropdown über der (jetzt flachen) Liste.
    sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 10 },
    sortLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '600' },
    sortButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.inputBackground,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    sortButtonText: { color: c.text, fontSize: 13, fontWeight: '600' },
    sortOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    sortMenu: { width: '100%', maxWidth: 320, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 6 },
    sortMenuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8 },
    sortMenuItemActive: { backgroundColor: c.inputBackground },
    sortMenuText: { color: c.text, fontSize: 15 },
    sortDivider: { height: 1, backgroundColor: c.border, marginVertical: 4 },
    sortReverseRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    filterChip: {
      backgroundColor: c.inputBackground,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    filterChipActive: { backgroundColor: c.accent, borderColor: c.accent },
    filterChipText: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
    filterChipTextActive: { color: c.accentFg },

    beitragCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginTop: 6,
    },
    beitragTitle: { color: c.text, fontSize: 13, fontWeight: '600' },
    beitragSub: { color: c.textSecondary, fontSize: 11, marginTop: 2 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 4,
      paddingHorizontal: 12,
      marginBottom: 4,
      position: 'relative',
      overflow: 'hidden',
    },
    rowActive: { borderColor: c.border, borderWidth: 1.5 },
    rowMoved: { borderColor: c.border + '40' },
    // TE-110: Wackelkandidaten früher per Wobble-Animation hervorgehoben, jetzt
    // stattdessen einfach etwas transparenter.
    rowSchnupper: { opacity: 0.55 },
    rowIndex: { color: c.textSecondary, fontSize: 12, fontWeight: '600', width: 24, textAlign: 'right' },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowName: { color: c.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
    rowNameStopped: { textDecorationLine: 'line-through', color: c.textSecondary },
    // Feste Spaltenbreite pro Icon/Badge, sonst rutscht die Spalte je nach Zeile
    // (nicht jedes Kind hat WhatsApp/Info/Badge) hin und her ("Treppeneffekt").
    iconSlot: { width: 20, alignItems: 'center' },
    rowTrail: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    rowParent: { color: c.textSecondary, fontSize: 11, fontWeight: '500', letterSpacing: 0.6, textDecorationLine: 'none' },
    badgeStopped: {
      color: c.warningFg,
      backgroundColor: c.warning,
      fontSize: 10,
      fontWeight: '700',
      overflow: 'hidden',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    rowYear: { color: c.textSecondary, fontSize: 13, fontWeight: '600', width: 30, textAlign: 'right' },

    // TE-74: Bento Dark – gruppierte Liste (iOS inset grouped).
    bSection: { marginBottom: 16 },
    bGroupHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 6 },
    bGroupTitle: { color: c.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
    bGroup: { backgroundColor: c.surface, borderRadius: 14, overflow: 'hidden' },
    bRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12 },
    bDivider: { position: 'absolute', top: 0, left: 52, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.border },
    bAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.surfaceHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bAvatarText: { color: c.textSecondary, fontSize: 12, fontWeight: '600' },
    bMain: { flex: 1, minWidth: 0 },
    bName: { color: c.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
    bParent: { color: c.textMuted, fontSize: 12, marginTop: 1 },
    bDots: { flexDirection: 'row', gap: 4 },

    // TE-82: Trainingsmodus-Ansicht.
    tvHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, marginBottom: 12 },
    tvTitle: { flex: 1, color: c.text, fontSize: 20, fontWeight: '700' },
    tvIdeas: { backgroundColor: c.surface, borderRadius: 16, padding: 10, gap: 4, marginTop: 6 },
    fabTrainingsideenOn: { right: 16, borderWidth: 2, borderColor: c.text },

    // TE-81: Trainingsmodus.
    trainSection: { gap: 10, marginBottom: 18 },
    trainTile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, overflow: 'hidden' },
    trainIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
    trainTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    trainSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 1 },
    trainTimer: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
    quickBox: { backgroundColor: c.surface, borderRadius: 16, padding: 10, gap: 8 },
    quickRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    quickInput: { flex: 1, marginBottom: 0 },
    quickSend: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    quickChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    quickNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 },
    quickTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', marginTop: 1 },
    quickNoteText: { color: c.text, fontSize: 13 },
    quickNoteTime: { color: c.textMuted, fontSize: 11 },
    quickAction: { color: c.accent, fontSize: 12, fontWeight: '700' },
    exLabel: { paddingHorizontal: 4 },
    exGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    exCard: { width: '48.5%', minHeight: 64, borderRadius: 16, padding: 12, overflow: 'hidden', justifyContent: 'center' },
    exText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    heutePill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    heutePillOn: { borderColor: 'transparent' },
    heutePillText: { color: c.textSecondary, fontSize: 11, fontWeight: '700' },
    heutePillTextOn: { color: '#FFFFFF' },
    assignCard: { gap: 8 },
    assignRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },

    // TE-76: Bento-Kacheln oben.
    bSpacer: { flex: 1 },
    bTiles: { gap: 8, marginBottom: 18 },
    bTileRow: { flexDirection: 'row', gap: 8 },
    bTile: { backgroundColor: c.surface, borderRadius: 18, padding: 14, overflow: 'hidden', gap: 6 },
    bTileHalf: { flex: 1 },
    bTileHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    bTileLabel: { color: c.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
    bTileNumber: { color: c.text, fontSize: 40, fontWeight: '800', lineHeight: 44 },
    bOnColor: { color: '#FFFFFF' },
    bTileTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
    bTileSub: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    bIconBadge: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    bBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 4 },
    bBarCol: { flex: 1, alignItems: 'center', gap: 4 },
    bBar: { alignSelf: 'stretch', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, overflow: 'hidden' },
    bBarCount: { color: c.text, fontSize: 12, fontWeight: '700' },
    bBarOff: { color: c.textMuted },
    bBarYear: { color: c.textMuted, fontSize: 12 },
    bDot: { width: 7, height: 7, borderRadius: 4 },

    fab: {
      position: 'absolute',
      right: 18,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 6,
    },
    // TE-87: zweiter FAB links neben dem Plus-Icon, öffnet den Fußball-Notizdialog.
    fabFussball: {
      position: 'absolute',
      right: 86,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 6,
    },

    // TE-44: dritter FAB links neben Fußball-Icon, öffnet den Notizen-Dialog.
    fabNotizen: {
      position: 'absolute',
      right: 154,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#F2C518',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 6,
    },

    // TE-113: vierter FAB links neben Notizen, öffnet den Trainingsideen-Dialog.
    fabTrainingsideen: {
      position: 'absolute',
      right: 222,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#4A9EFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 6,
    },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 360, backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 18, gap: 12 },
    cardTitle: { color: c.text, fontSize: 17, fontWeight: '700' },
    // Notizen/Trainingsideen sollen den verfügbaren Platz (Overlay-Padding
    // ausgenommen) voll ausnutzen statt einer kleinen, mittig schwebenden Box.
    notizenKav: { width: '100%', height: '100%' },
    notizenCard: { maxWidth: undefined, width: '100%', height: '100%' },
    trainingsideenCard: { borderColor: '#4A9EFF' },
    notizenHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    notizenTitle: { flex: 1 },
    notizenList: { flex: 1 },
    notizItemRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border, gap: 4 },
    notizItemMain: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    notizReorder: { gap: 2 },
    notizItemText: { flex: 1, color: c.text, fontSize: 15 },
    notizEditInput: { flex: 1, paddingVertical: 4, fontSize: 15 },
    notizAddRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    notizAddInput: { flex: 1 },
    notizAddBtn: { paddingHorizontal: 14 },
    // TE-113: Verlauf-Dialog (gelöschte Items, wiederherstellbar) – gleiches Design wie im Schule-Tab.
    historyBox: { backgroundColor: c.surface, borderRadius: 20, padding: 20, width: 340, maxWidth: '92%', gap: 10, borderWidth: 1, borderColor: c.border },
    historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.border },
    historyTitle: { flex: 1, fontSize: 14, color: c.text },
    markedBox: {
      backgroundColor: '#F2C51826',
      borderWidth: 1,
      borderColor: '#F2C518',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 2,
      marginBottom: 16,
    },
    markedItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    markedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F2C518' },
    markedText: { flex: 1, color: c.text, fontSize: 14 },
    input: {
      backgroundColor: c.inputBackground,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: c.text,
      fontSize: 15,
    },
    inputMultiline: { minHeight: 60, textAlignVertical: 'top' },
    dateField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.inputBackground,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    dateFieldText: { flex: 1, fontSize: 15 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    checkLabel: { fontSize: 15, fontWeight: '500' },
    cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
    cardActionsWithDelete: { justifyContent: 'space-between', alignItems: 'center' },
    cardActionsRight: { flexDirection: 'row', gap: 8 },
    btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
    btnGhost: { borderWidth: 1, borderColor: c.border },
    btnText: { fontSize: 15, fontWeight: '600' },
  });
}
