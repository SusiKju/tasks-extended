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
import { useTheme, ThemeColors } from '../utils/theme';
import { useFamily } from '../hooks/useFamily';
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
  makeId,
  BambiniSortMode,
} from '../services/bambini';

/** Bewusst nicht über colors.danger (wird in mono() vergraut) – wie NotesScreen IMPORTANT_RED. */
const NOT_ANGEMELDET_RED = '#EF4444';
const WHATSAPP_GREEN = '#25D366';
const INFO_YELLOW = '#F5B301';
import { getJahrgangStatus } from '../utils/bambiniSeason';

/** ISO 'YYYY-MM-DD' → 'DD.MM.YYYY' (string-basiert, ohne Zeitzonen-Fallen). */
function formatDE(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
}

/** ISO-Zeitstempel → 'DD.MM.YYYY HH:MM' fürs Notiz-Item. */
function formatDateTimeDE(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()} ${hh}:${min}`;
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
  const { colors } = useTheme();
  const { familyId } = useFamily();
  const fid = familyId ?? '';
  const s = makeStyles(colors);

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
  const [vereinAngemeldetInput, setVereinAngemeldetInput] = useState(false);
  const [schnuppertrainingInput, setSchnuppertrainingInput] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // TE-101: Notiz-Items (wichtig/nächste Aufgabe markierbar), löste die
  // Freitext-Notizen (TE-44) ab. Jede Aktion speichert sofort, damit die
  // Markierungen auf der Startseite live stimmen.
  const [notizenOpen, setNotizenOpen] = useState(false);
  const [notizItems, setNotizItems] = useState<NotizItem[]>([]);
  const [notizInput, setNotizInput] = useState('');
  const [notizHistoryOpenId, setNotizHistoryOpenId] = useState<string | null>(null);
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

  const closeNotizen = useCallback(() => setNotizenOpen(false), []);

  const persistNotizItems = useCallback((items: NotizItem[]) => {
    setNotizItems(items);
    if (fid) saveBambiniNotizItems(fid, items).catch((e) => console.warn('Bambini-Notizen speichern fehlgeschlagen', e));
  }, [fid]);

  const addNotizItem = useCallback(() => {
    const text = notizInput.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const item: NotizItem = { id: makeId(), text, marked: false, createdAt: now, history: [{ ts: now, text: 'erstellt' }] };
    persistNotizItems([item, ...notizItems]);
    setNotizInput('');
  }, [notizInput, notizItems, persistNotizItems]);

  const toggleNotizMarked = useCallback((id: string) => {
    const now = new Date().toISOString();
    persistNotizItems(
      notizItems.map((n) =>
        n.id === id
          ? { ...n, marked: !n.marked, history: [...n.history, { ts: now, text: n.marked ? 'Markierung entfernt' : 'markiert' }] }
          : n,
      ),
    );
  }, [notizItems, persistNotizItems]);

  const deleteNotizItem = useCallback((id: string) => {
    persistNotizItems(notizItems.filter((n) => n.id !== id));
  }, [notizItems, persistNotizItems]);

  const moveNotizItem = useCallback((id: string, direction: -1 | 1) => {
    const idx = notizItems.findIndex((n) => n.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= notizItems.length) return;
    const next = [...notizItems];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    persistNotizItems(next);
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
    const now = new Date().toISOString();
    persistNotizItems(
      notizItems.map((n) =>
        n.id === notizEditId
          ? { ...n, text, history: [...n.history, { ts: now, text: `bearbeitet (vorher: "${editing.text}")` }] }
          : n,
      ),
    );
    setNotizEditId(null);
  }, [notizEditId, notizEditText, notizItems, persistNotizItems]);

  const markedNotizItems = notizItems.filter((n) => n.marked);

  // TE-113: zweite freie Item-Liste, gleiche Mechanik wie die Notizen oben,
  // eigener Speicherort (trainingsideenItems) für Trainingsideen zum aktuellen Training.
  const [trainingsideenOpen, setTrainingsideenOpen] = useState(false);
  const [trainingsideenItems, setTrainingsideenItems] = useState<NotizItem[]>([]);
  const [trainingsideeInput, setTrainingsideeInput] = useState('');
  const [trainingsideeHistoryOpenId, setTrainingsideeHistoryOpenId] = useState<string | null>(null);
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

  const closeTrainingsideen = useCallback(() => setTrainingsideenOpen(false), []);

  const persistTrainingsideenItems = useCallback((items: NotizItem[]) => {
    setTrainingsideenItems(items);
    if (fid) saveBambiniTrainingsideenItems(fid, items).catch((e) => console.warn('Trainingsideen speichern fehlgeschlagen', e));
  }, [fid]);

  const addTrainingsideeItem = useCallback(() => {
    const text = trainingsideeInput.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const item: NotizItem = { id: makeId(), text, marked: false, createdAt: now, history: [{ ts: now, text: 'erstellt' }] };
    persistTrainingsideenItems([item, ...trainingsideenItems]);
    setTrainingsideeInput('');
  }, [trainingsideeInput, trainingsideenItems, persistTrainingsideenItems]);

  const toggleTrainingsideeMarked = useCallback((id: string) => {
    const now = new Date().toISOString();
    persistTrainingsideenItems(
      trainingsideenItems.map((n) =>
        n.id === id
          ? { ...n, marked: !n.marked, history: [...n.history, { ts: now, text: n.marked ? 'Markierung entfernt' : 'markiert' }] }
          : n,
      ),
    );
  }, [trainingsideenItems, persistTrainingsideenItems]);

  const deleteTrainingsideeItem = useCallback((id: string) => {
    persistTrainingsideenItems(trainingsideenItems.filter((n) => n.id !== id));
  }, [trainingsideenItems, persistTrainingsideenItems]);

  const moveTrainingsideeItem = useCallback((id: string, direction: -1 | 1) => {
    const idx = trainingsideenItems.findIndex((n) => n.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= trainingsideenItems.length) return;
    const next = [...trainingsideenItems];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    persistTrainingsideenItems(next);
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
    const now = new Date().toISOString();
    persistTrainingsideenItems(
      trainingsideenItems.map((n) =>
        n.id === trainingsideeEditId
          ? { ...n, text, history: [...n.history, { ts: now, text: `bearbeitet (vorher: "${editing.text}")` }] }
          : n,
      ),
    );
    setTrainingsideeEditId(null);
  }, [trainingsideeEditId, trainingsideeEditText, trainingsideenItems, persistTrainingsideenItems]);

  const reload = useCallback(async () => {
    if (!fid) {
      setChildren([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await migrateRosterToBambini(fid);
      const [list, filters, notiz] = await Promise.all([loadBambini(fid), loadBambiniFilters(fid), loadBambiniNotizItems(fid)]);
      setChildren(list);
      setYearFilter(filters.years);
      setStoppedFilter(filters.stopped);
      setWackelkandidatFilter(filters.wackelkandidat);
      setSortMode(filters.sortMode);
      setSortReversed(filters.sortReversed);
      setFiltersOpen(filters.filtersOpen);
      setNotizItems(notiz);
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
    setEditing({ id: '', name: '', birthYear: 0, registeredSince: '', stopped: false, parentName: '', lastName: '', info: '', whatsapp: false, vereinAngemeldet: false, schnuppertraining: false });
    setNameInput('');
    setYearInput('');
    setSinceInput('');
    setStoppedInput(false);
    setParentInput('');
    setLastNameInput('');
    setInfoInput('');
    setWhatsappInput(false);
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
    setVereinAngemeldetInput(c.vereinAngemeldet);
    setSchnuppertrainingInput(c.schnuppertraining);
  };

  const closeModal = () => setEditing(null);

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
      vereinAngemeldet: vereinAngemeldetInput,
      schnuppertraining: schnuppertrainingInput,
    };

    if (editing && editing.id) {
      persist(children.map((c) => (c.id === editing.id ? { ...c, ...patch } : c)));
    } else {
      persist([...children, { id: makeId(), ...patch }]);
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
          <Text style={[s.rowName, c.stopped && s.rowNameStopped]} numberOfLines={1}>{c.name}</Text>
          {c.registeredSince ? (
            <Text style={s.rowSub} numberOfLines={1}>seit {formatDE(c.registeredSince)}</Text>
          ) : null}
        </View>
        <View style={s.iconSlot}>
          {c.whatsapp ? (
            <Ionicons name="logo-whatsapp" size={20} color={WHATSAPP_GREEN} accessibilityLabel="In WhatsApp-Gruppe" />
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
        <View style={s.badgeSlot}>
          {c.stopped ? <Text style={s.badgeStopped}>aufgehört</Text> : null}
        </View>
        <Text style={s.rowYear}>{c.birthYear || '—'}</Text>
      </Pressable>
    );
  };

  return (
    <View style={s.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} />
      ) : (
        <>
          {children.length > 0 ? (
            <View style={s.filterToggleRow}>
              <Text style={s.overview} numberOfLines={2}>{overviewText}</Text>
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
            ) : (
              sorted.map((c, index) => {
                const status = c.birthYear ? getJahrgangStatus(c.birthYear) : null;
                const gewechselt = status === 'gewechselt';
                return <React.Fragment key={c.id}>{renderChildRow(c, index, status, gewechselt)}</React.Fragment>;
              })
            )}

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
          </ScrollView>
        </>
      )}

      {/* TE-87: gleiches Icon/gleiche Aktion wie das Fußball-Icon auf dem Dashboard. */}
      <FussballKachel forceTheme="fussball" iconStyle={s.fabFussball} iconSize={26} />

      {/* TE-44: dritter FAB für freie Notizen (Trainingsideen o. Ä.). */}
      <Pressable style={s.fabNotizen} onPress={openNotizen} accessibilityLabel="Notizen öffnen">
        <Ionicons name="document-text" size={24} color="#3A2E00" />
      </Pressable>

      {/* TE-113: vierter FAB, eigene Liste für Trainingsideen zum aktuellen Training. */}
      <Pressable style={s.fabTrainingsideen} onPress={openTrainingsideen} accessibilityLabel="Trainingsideen öffnen">
        <Ionicons name="bulb" size={24} color="#0A2A4A" />
      </Pressable>

      <Pressable style={s.fab} onPress={openNew} accessibilityLabel="Kind hinzufügen">
        <Ionicons name="add" size={28} color={colors.accentFg} />
      </Pressable>

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={closeModal}>
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
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[s.card, s.notizenCard]}>
            <View style={s.notizenHeader}>
              <Ionicons name="document-text" size={18} color="#F2C518" />
              <Text style={[s.cardTitle, s.notizenTitle]}>Notizen</Text>
              <Pressable onPress={closeNotizen} hitSlop={12} accessibilityLabel="Schließen">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={s.notizenList} keyboardShouldPersistTaps="handled">
              {notizItems.length === 0 ? (
                <Text style={s.empty}>Noch keine Notizen.</Text>
              ) : (
                notizItems.map((n, idx) => (
                  <View key={n.id} style={s.notizItemRow}>
                    <View style={s.notizItemMain}>
                      <View style={s.notizReorder}>
                        <Pressable onPress={() => moveNotizItem(n.id, -1)} disabled={idx === 0} hitSlop={4} accessibilityLabel="Nach oben verschieben">
                          <Ionicons name="chevron-up" size={14} color={idx === 0 ? colors.border : colors.textSecondary} />
                        </Pressable>
                        <Pressable onPress={() => moveNotizItem(n.id, 1)} disabled={idx === notizItems.length - 1} hitSlop={4} accessibilityLabel="Nach unten verschieben">
                          <Ionicons name="chevron-down" size={14} color={idx === notizItems.length - 1 ? colors.border : colors.textSecondary} />
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
                    <Pressable onPress={() => setNotizHistoryOpenId((v) => (v === n.id ? null : n.id))}>
                      <Text style={s.notizItemMeta}>{formatDateTimeDE(n.createdAt)}</Text>
                    </Pressable>
                    {notizHistoryOpenId === n.id ? (
                      <View style={s.notizHistory}>
                        {n.history.map((h, i) => (
                          <Text key={i} style={s.notizHistoryEntry}>{formatDateTimeDE(h.ts)} · {h.text}</Text>
                        ))}
                      </View>
                    ) : null}
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
              <Pressable onPress={addNotizItem} style={[s.btn, s.notizAddBtn, { backgroundColor: colors.accent }]} accessibilityLabel="Notiz hinzufügen">
                <Ionicons name="add" size={20} color={colors.accentFg} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={trainingsideenOpen} transparent animationType="fade" onRequestClose={closeTrainingsideen}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[s.card, s.notizenCard, s.trainingsideenCard]}>
            <View style={s.notizenHeader}>
              <Ionicons name="bulb" size={18} color="#4A9EFF" />
              <Text style={[s.cardTitle, s.notizenTitle]}>Trainingsideen</Text>
              <Pressable onPress={closeTrainingsideen} hitSlop={12} accessibilityLabel="Schließen">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={s.notizenList} keyboardShouldPersistTaps="handled">
              {trainingsideenItems.length === 0 ? (
                <Text style={s.empty}>Noch keine Trainingsideen.</Text>
              ) : (
                trainingsideenItems.map((n, idx) => (
                  <View key={n.id} style={s.notizItemRow}>
                    <View style={s.notizItemMain}>
                      <View style={s.notizReorder}>
                        <Pressable onPress={() => moveTrainingsideeItem(n.id, -1)} disabled={idx === 0} hitSlop={4} accessibilityLabel="Nach oben verschieben">
                          <Ionicons name="chevron-up" size={14} color={idx === 0 ? colors.border : colors.textSecondary} />
                        </Pressable>
                        <Pressable onPress={() => moveTrainingsideeItem(n.id, 1)} disabled={idx === trainingsideenItems.length - 1} hitSlop={4} accessibilityLabel="Nach unten verschieben">
                          <Ionicons name="chevron-down" size={14} color={idx === trainingsideenItems.length - 1 ? colors.border : colors.textSecondary} />
                        </Pressable>
                      </View>
                      <Pressable
                        onPress={() => toggleTrainingsideeMarked(n.id)}
                        hitSlop={8}
                        accessibilityLabel={n.marked ? 'Markierung entfernen' : 'Als wichtig markieren'}
                      >
                        <Ionicons name={n.marked ? 'star' : 'star-outline'} size={20} color="#4A9EFF" />
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
                    <Pressable onPress={() => setTrainingsideeHistoryOpenId((v) => (v === n.id ? null : n.id))}>
                      <Text style={s.notizItemMeta}>{formatDateTimeDE(n.createdAt)}</Text>
                    </Pressable>
                    {trainingsideeHistoryOpenId === n.id ? (
                      <View style={s.notizHistory}>
                        {n.history.map((h, i) => (
                          <Text key={i} style={s.notizHistoryEntry}>{formatDateTimeDE(h.ts)} · {h.text}</Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>

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
              <Pressable onPress={addTrainingsideeItem} style={[s.btn, s.notizAddBtn, { backgroundColor: '#4A9EFF' }]} accessibilityLabel="Trainingsidee hinzufügen">
                <Ionicons name="add" size={20} color="#0A2A4A" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
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
      paddingVertical: 6,
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
    rowMain: { flex: 1 },
    rowName: { color: c.text, fontSize: 14, fontWeight: '600' },
    rowNameStopped: { textDecorationLine: 'line-through', color: c.textSecondary },
    // Feste Spaltenbreite pro Icon/Badge, sonst rutscht die Spalte je nach Zeile
    // (nicht jedes Kind hat WhatsApp/Info/Badge) hin und her ("Treppeneffekt").
    iconSlot: { width: 20, alignItems: 'center' },
    badgeSlot: { width: 62, alignItems: 'flex-start' },
    rowSub: { color: c.textSecondary, fontSize: 11, marginTop: 0 },
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
    rowYear: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },

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
    notizenCard: { maxWidth: 420, height: '70%' },
    trainingsideenCard: { borderColor: '#4A9EFF' },
    notizenHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    notizenTitle: { flex: 1 },
    notizenList: { flex: 1 },
    notizItemRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border, gap: 4 },
    notizItemMain: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    notizReorder: { gap: 2 },
    notizItemText: { flex: 1, color: c.text, fontSize: 15 },
    notizEditInput: { flex: 1, paddingVertical: 4, fontSize: 15 },
    notizItemMeta: { color: c.textSecondary, fontSize: 12, marginLeft: 28 },
    notizHistory: { marginLeft: 28, marginTop: 2, gap: 2 },
    notizHistoryEntry: { color: c.textSecondary, fontSize: 11 },
    notizAddRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    notizAddInput: { flex: 1 },
    notizAddBtn: { paddingHorizontal: 14 },
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
