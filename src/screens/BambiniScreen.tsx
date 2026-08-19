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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeColors } from '../utils/theme';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
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
  makeId,
  neuTier,
  NeuTier,
} from '../services/bambini';

/** Deckkraft des linken Hervorhebungs-Rands je Tier – frischer = kräftiger. */
const NEU_TIER_ALPHA: Record<NeuTier, string> = { 2: 'FF', 4: 'B3', 8: '80', 16: '4D' };
import { getJahrgangStatus, getBetreuungsZeitraum } from '../utils/bambiniSeason';

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

export function BambiniScreen() {
  const { colors } = useTheme();
  const { user } = useFirebaseAuth();
  const uid = user?.uid ?? '';
  const s = makeStyles(colors);

  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // TE-99: Quickfilter unter der Suchleiste (Jahrgang, aufgehört/aktiv).
  // TE-20: Jahrgang ist Mehrfachauswahl (mehrere Jahre gleichzeitig), pro User
  // in Firestore gespeichert (siehe bambiniByUser/{uid}.filters).
  // stoppedFilter: null = alle, true = nur aufgehört, false = nur aktiv (nicht aufgehört).
  const [yearFilter, setYearFilter] = useState<number[]>([]);
  const [stoppedFilter, setStoppedFilter] = useState<boolean | null>(null);
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
  const [showDatePicker, setShowDatePicker] = useState(false);

  const reload = useCallback(async () => {
    if (!uid) {
      setChildren([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await migrateRosterToBambini(uid);
      const [list, filters] = await Promise.all([loadBambini(uid), loadBambiniFilters(uid)]);
      setChildren(list);
      setYearFilter(filters.years);
      setStoppedFilter(filters.stopped);
    } catch (e) {
      console.warn('Bambini laden fehlgeschlagen', e);
    } finally {
      filtersLoaded.current = true;
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    reload();
  }, [reload]);

  // TE-20: Filterwechsel in Firestore spiegeln (erst nach dem initialen Laden).
  useEffect(() => {
    if (!filtersLoaded.current || !uid) return;
    saveBambiniFilters(uid, { years: yearFilter, stopped: stoppedFilter }).catch((e) =>
      console.warn('Bambini-Filter speichern fehlgeschlagen', e),
    );
  }, [uid, yearFilter, stoppedFilter]);

  const persist = useCallback(
    (next: Child[]) => {
      setChildren(next);
      if (uid) saveBambini(uid, next).catch((e) => console.warn('Bambini speichern fehlgeschlagen', e));
    },
    [uid],
  );

  const openNew = () => {
    setEditing({ id: '', name: '', birthYear: 0, registeredSince: '', stopped: false, parentName: '', lastName: '', info: '', whatsapp: false });
    setNameInput('');
    setYearInput('');
    setSinceInput('');
    setStoppedInput(false);
    setParentInput('');
    setLastNameInput('');
    setInfoInput('');
    setWhatsappInput(false);
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
    };

    if (editing && editing.id) {
      persist(children.map((c) => (c.id === editing.id ? { ...c, ...patch } : c)));
    } else {
      persist([...children, { id: makeId(), ...patch }]);
    }
    closeModal();
  };

  const removeEntry = (c: Child) => {
    confirmDelete(c.name, () => persist(children.filter((x) => x.id !== c.id)));
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
    return true;
  });

  // Nach Jahrgang gruppieren (children kommen bereits sortiert).
  const groups: { year: number; items: Child[] }[] = [];
  filtered.forEach((c) => {
    const g = groups.find((x) => x.year === c.birthYear);
    if (g) g.items.push(c);
    else groups.push({ year: c.birthYear, items: [c] });
  });

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

  return (
    <View style={s.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} />
      ) : (
        <>
          {children.length > 0 ? (
            <Text style={s.overview}>{overviewText}</Text>
          ) : null}

          {children.length > 0 ? (
            <SearchInput
              value={query}
              onChangeText={setQuery}
              placeholder="Suchen (ab 3 Zeichen)"
              colors={colors}
              style={s.searchInputMargin}
            />
          ) : null}

          {children.length > 0 ? (
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
          ) : null}

          {yearFilter.length > 0 || stoppedFilter !== null ? (
            <Text style={s.resultCount}>{filtered.length} Treffer</Text>
          ) : null}

          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            {children.length === 0 ? (
              <Text style={s.empty}>Noch keine Kinder. Mit „+" anlegen.</Text>
            ) : groups.length === 0 ? (
              <Text style={s.empty}>Keine Treffer.</Text>
            ) : (
              groups.map((g) => {
                const status = g.year ? getJahrgangStatus(g.year) : null;
                const gewechselt = status === 'gewechselt';
                const zeitraum = g.year ? getBetreuungsZeitraum(g.year) : null;
                return (
              <View key={g.year} style={s.group}>
                <View style={s.groupTitleRow}>
                  <Text style={[s.groupTitle, status === 'aktiv' && s.groupTitleActive, gewechselt && s.groupTitleMoved]}>
                    {g.year ? `Jahrgang ${g.year}` : 'Ohne Jahrgang'}
                    {gewechselt ? ' · F-Jugend' : ''}
                  </Text>
                  {zeitraum ? (
                    <Text style={s.groupHint}>betreut {zeitraum.von}–{zeitraum.bis}</Text>
                  ) : null}
                </View>
                {g.items.map((c) => {
                  const tier = c.stopped ? null : neuTier(c.registeredSince);
                  return (
                  <Pressable
                    key={c.id}
                    style={[
                      s.row,
                      status === 'aktiv' && s.rowActive,
                      gewechselt && s.rowMoved,
                      tier ? { borderLeftWidth: 4, borderLeftColor: colors.accent + NEU_TIER_ALPHA[tier] } : null,
                    ]}
                    onPress={() => openEdit(c)}
                  >
                    <View style={s.rowMain}>
                      <Text style={[s.rowName, c.stopped && s.rowNameStopped]} numberOfLines={1}>{c.name}</Text>
                      {c.registeredSince ? (
                        <Text style={s.rowSub}>seit {formatDE(c.registeredSince)}</Text>
                      ) : null}
                    </View>
                    <View style={s.iconSlot}>
                      {c.whatsapp ? (
                        <Ionicons name="logo-whatsapp" size={18} color={colors.textSecondary} accessibilityLabel="In WhatsApp-Gruppe" />
                      ) : null}
                    </View>
                    <View style={s.iconSlot}>
                      {c.info ? (
                        <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} accessibilityLabel="Info vorhanden" />
                      ) : null}
                    </View>
                    <View style={s.badgeSlot}>
                      {tier ? <Text style={s.badgeNeu}>neu</Text> : null}
                      {c.stopped ? <Text style={s.badgeStopped}>aufgehört</Text> : null}
                    </View>
                    <Text style={s.rowYear}>{c.birthYear || '—'}</Text>
                    <Pressable onPress={() => removeEntry(c)} hitSlop={8} style={s.rowDel} accessibilityLabel="Löschen">
                      <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                    </Pressable>
                  </Pressable>
                  );
                })}
                </View>
                );
              })
            )}
          </ScrollView>
        </>
      )}

      {/* TE-87: gleiches Icon/gleiche Aktion wie das Fußball-Icon auf dem Dashboard. */}
      <FussballKachel forceTheme="fussball" iconStyle={s.fabFussball} iconSize={26} />

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
                {sinceInput ? `Angemeldet seit ${formatDE(sinceInput)}` : 'Angemeldet seit …'}
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

            <View style={s.cardActions}>
              <Pressable onPress={closeModal} style={[s.btn, s.btnGhost]}>
                <Text style={[s.btnText, { color: colors.textSecondary }]}>Abbrechen</Text>
              </Pressable>
              <Pressable onPress={saveEntry} style={[s.btn, { backgroundColor: colors.accent }]}>
                <Text style={[s.btnText, { color: colors.accentFg }]}>Speichern</Text>
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
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { padding: 12, paddingBottom: 96 },
    empty: { color: c.textSecondary, textAlign: 'center', marginTop: 40, fontSize: 14 },

    // TE-97: kompakte Übersicht über alle Kinder, reiner Text ohne Button-Optik.
    overview: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      marginHorizontal: 12,
      marginTop: 10,
    },

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

    group: { marginBottom: 16 },
    groupTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
    groupTitle: { color: c.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    groupTitleActive: { color: c.accent },
    groupTitleMoved: { color: c.textMuted },
    groupHint: { color: c.textMuted, fontSize: 11 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 6,
    },
    rowActive: { borderColor: c.border, borderWidth: 1.5 },
    rowMoved: { borderColor: c.border + '40' },
    rowMain: { flex: 1 },
    rowName: { color: c.text, fontSize: 15, fontWeight: '600' },
    rowNameStopped: { textDecorationLine: 'line-through', color: c.textSecondary },
    // Feste Spaltenbreite pro Icon/Badge, sonst rutscht die Spalte je nach Zeile
    // (nicht jedes Kind hat WhatsApp/Info/Badge) hin und her ("Treppeneffekt").
    iconSlot: { width: 18, alignItems: 'center' },
    badgeSlot: { width: 62, alignItems: 'flex-start' },
    rowSub: { color: c.textSecondary, fontSize: 11, marginTop: 1 },
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
    badgeNeu: {
      color: c.accentFg,
      backgroundColor: c.accent,
      fontSize: 10,
      fontWeight: '700',
      overflow: 'hidden',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    rowYear: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
    rowDel: { padding: 2 },

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

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 360, backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 18, gap: 12 },
    cardTitle: { color: c.text, fontSize: 17, fontWeight: '700' },
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
    btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
    btnGhost: { borderWidth: 1, borderColor: c.border },
    btnText: { fontSize: 15, fontWeight: '600' },
  });
}
