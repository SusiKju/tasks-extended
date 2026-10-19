/**
 * WandScreen.tsx
 * Wand-Modus (`?wall=1`): reine Lese-Ansicht für ein Display an der Wand.
 * Eine Spalte pro Kind mit Strafpunkten, Strafaufgaben, Wochenaufgaben und
 * Aufgaben aus der Kinder-App. Keine Buttons außer dem PIN-Ausstieg.
 * Daten live per onSnapshot, gleiche Quellen wie „Kinder 2“ (KinderPlanScreen).
 * Immer im Theme „Bento Dark“, unabhängig von der Einstellung auf dem Gerät.
 * Stundenplan von heute je Kind; an Ferien-/Feiertagen und am Wochenende statt-
 * dessen ein Hinweis im Kopf (schulfreiGrund, Sachsen).
 * Familienfotos (TE-101): Tipp auf „Fotos“ zeigt sie im Vollbild, Tipp zurück.
 * Schmales Display (Handy quer, TE-102): ein Kind pro Seite, wischen zum nächsten.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEMES, ThemeColors } from '../utils/theme';
import { useFamily } from '../hooks/useFamily';
import { useStore } from '../store';
import ChildAvatar from '../components/ChildAvatar';
import type { ChildConfig } from '../services/family';
import { ChildTask, subscribeToChildTasks } from '../services/kinderTasks';
import {
  PERIODS, TimetableMap, PeriodTimesMap, key as ttKey, applyPeriodTimes, isBiweeklyActiveWeek, isAusfallstunde,
  subjectColor, subscribeToTimetable, subscribeToPeriodTimes,
} from '../services/timetable';
import { schulfreiGrund } from '../utils/schulferien';
import { WandFoto, subscribeWandFotos } from '../services/wandFotos';
import { subscribeRegeln, subscribeWoche, subscribeStrafaufgaben } from '../services/kinderPlan';
import {
  KinderRegeln, KinderWoche, Strafaufgabe, DEFAULT_REGELN, TAG_KURZ, aufgabenVon, aktuellerTag,
  weekKey, kalenderwoche, isoDate, markKey, punkte, faelligeStufen, bisNaechsteStufe,
} from '../utils/kinderPlanLogic';

const colors = THEMES['bento-night'].colors;
const s = makeStyles(colors);

// Unter dieser Breite (Handy quer) eine Seite pro Kind statt aller Spalten nebeneinander.
const PAGED_BELOW = 1000;

const WOCHENTAG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

interface Props {
  onExit: () => void;
}

export default function WandScreen({ onExit }: Props) {
  const { familyId, children } = useFamily();
  const fid = familyId ?? '';
  const parentPin = useStore((st) => st.settings.parentPin ?? '1234');

  // Uhr; zieht auch Datum und Woche nach, wenn das Display über Mitternacht läuft.
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const today = isoDate(now);
  const wk = weekKey(now);

  const [regeln, setRegeln] = useState<KinderRegeln>(DEFAULT_REGELN);
  const [woche, setWoche] = useState<KinderWoche>({ punkte: {}, marks: {} });
  const [straf, setStraf] = useState<Record<string, Strafaufgabe>>({});
  const [tasksByChild, setTasksByChild] = useState<Record<string, ChildTask[]>>({});

  useEffect(() => (fid ? subscribeRegeln(fid, setRegeln) : undefined), [fid]);
  useEffect(() => (fid ? subscribeWoche(fid, wk, setWoche) : undefined), [fid, wk]);
  useEffect(() => (fid ? subscribeStrafaufgaben(fid, setStraf) : undefined), [fid]);
  useEffect(() => {
    if (!fid || children.length === 0) return;
    const unsubs = children.map((c) => subscribeToChildTasks(fid, c.id, today, (ts) => setTasksByChild((p) => ({ ...p, [c.id]: ts }))));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid, children, today]);

  const [timetables, setTimetables] = useState<Record<string, TimetableMap>>({});
  const [periodTimes, setPeriodTimes] = useState<Record<string, PeriodTimesMap>>({});
  useEffect(() => {
    if (!fid || children.length === 0) return;
    const unsubs = children.flatMap((c) => [
      subscribeToTimetable(fid, c.id, (m) => setTimetables((p) => ({ ...p, [c.id]: m }))),
      subscribeToPeriodTimes(fid, c.id, (m) => setPeriodTimes((p) => ({ ...p, [c.id]: m }))),
    ]);
    return () => unsubs.forEach((u) => u());
  }, [fid, children]);

  // Schultag? Wochenende und sächsische Ferien/Feiertage zeigen statt Stundenplan einen Hinweis.
  const dow = now.getDay();
  const dayIdx = dow >= 1 && dow <= 5 ? dow - 1 : -1;
  const frei = schulfreiGrund(now);
  const bisText = frei ? new Date(`${frei.bis}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) : '';
  const schulfreiText = frei?.art === 'ferien' ? `Ferien bis ${bisText} – keine Schule`
    : frei?.art === 'feiertag' ? 'Feiertag – keine Schule'
    : frei?.art === 'frei' ? 'Heute schulfrei'
    : dayIdx < 0 ? 'Wochenende – keine Schule' : null;
  const nowHM = now.toTimeString().slice(0, 5);
  const biweeklyActive = isBiweeklyActiveWeek(now);

  // Fotos: Diashow nur nach Tipp, wechselt alle 8 s und kehrt nach 5 min von selbst zur Übersicht zurück.
  const [fotos, setFotos] = useState<WandFoto[]>([]);
  const [fotoIdx, setFotoIdx] = useState<number | null>(null);
  useEffect(() => (fid ? subscribeWandFotos(fid, setFotos) : undefined), [fid]);
  useEffect(() => {
    if (fotoIdx === null) return;
    const next = setInterval(() => setFotoIdx((i) => (i === null ? null : (i + 1) % Math.max(fotos.length, 1))), 8_000);
    const back = setTimeout(() => setFotoIdx(null), 5 * 60_000);
    return () => { clearInterval(next); clearTimeout(back); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotoIdx === null, fotos.length]);
  const foto = fotoIdx !== null ? fotos[fotoIdx % Math.max(fotos.length, 1)] : undefined;

  const { width } = useWindowDimensions();
  const paged = width < PAGED_BELOW;
  const [page, setPage] = useState(0);
  const pager = useRef<ScrollView>(null);

  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const submitPin = () => {
    if (pin === parentPin) { setPinOpen(false); onExit(); }
    else setPinError(true);
    setPin('');
  };

  const strafListe = Object.entries(straf).map(([id, a]) => ({ id, ...a }));
  const strafTaskIds = new Set(strafListe.map((a) => a.taskId).filter((x): x is string => !!x));

  const barPct = (pts: number) => {
    const prev = [...regeln.stufen].reverse().find((st) => st.min <= pts)?.min ?? 0;
    const next = regeln.stufen.find((st) => st.min > pts)?.min;
    return next ? (pts - prev) / (next - prev) : 1;
  };

  const renderKind = (c: ChildConfig) => {
    const pts = punkte(woche, c.id);
    const due = faelligeStufen(regeln, pts, c.id, wk, strafListe);
    const bis = bisNaechsteStufe(regeln, pts);
    const offen = strafListe.filter((a) => a.childId === c.id && !a.done);
    const wochen = aufgabenVon(regeln, c.id)
      .map((a) => ({ a, cur: aktuellerTag(a, c.id, woche, wk, today) }))
      .filter((x): x is { a: typeof x.a; cur: NonNullable<typeof x.cur> } => !!x.cur);
    const tasks = (tasksByChild[c.id] ?? []).filter((t) => !strafTaskIds.has(t.id));
    const alarm = due.length > 0 || offen.length > 0;
    const tt = timetables[c.id] ?? {};
    const lessons = schulfreiText ? [] : applyPeriodTimes(PERIODS, periodTimes[c.id] ?? {})
      .filter((p) => !p.pause)
      .map((p) => ({ p, e: tt[ttKey(dayIdx, p.nr)] }))
      .filter((x): x is { p: typeof x.p; e: NonNullable<typeof x.e> } => !!x.e && !(x.e.biweekly && !biweeklyActive));

    return (
      <View key={c.id} style={[s.col, paged && { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }, alarm && s.colAlert]}>
        <View style={s.rowCenter}>
          <ChildAvatar child={c} size={44} />
          <Text style={[s.name, { flex: 1 }]} numberOfLines={1}>{c.name}</Text>
        </View>
        {/* Punkte in eigener Zeile neben dem Balken, damit der Name auch in schmalen Spalten ganz bleibt. */}
        <View style={s.rowCenter}>
          <Text style={s.bigNum} accessibilityLabel={`${pts} Strafpunkte`}>{pts}</Text>
          <View style={[s.bar, { flex: 1 }]}><View style={[s.barFill, { width: `${Math.round(barPct(pts) * 100)}%`, backgroundColor: c.color }]} /></View>
        </View>
        <Text style={[s.muted, bis === 1 && { color: colors.warning, fontWeight: '800' }]}>
          {bis === null ? 'Höchste Stufe erreicht' : `Noch ${bis} bis zur Strafaufgabe`}
        </Text>

        {due.length > 0 || offen.length > 0 ? (
          <View style={s.section}>
            <Text style={[s.label, { color: colors.danger }]}>Strafaufgaben</Text>
            {offen.map((a) => <Text key={a.id} style={s.item}>• {a.label}</Text>)}
            {due.map((st) => <Text key={st} style={s.item}>• Stufe {st + 1}: kommt noch</Text>)}
          </View>
        ) : null}

        {lessons.length > 0 ? (
          <View style={s.section}>
            <Text style={s.label}>Stundenplan heute</Text>
            {lessons.map(({ p, e }) => {
              const ausfall = isAusfallstunde(e);
              const jetzt = nowHM >= p.start && nowHM < p.end;
              const vorbei = nowHM >= p.end;
              return (
                <View key={String(p.nr)} style={[s.rowCenter, jetzt && s.lessonNow, vorbei && { opacity: 0.45 }]}>
                  <Text style={[s.muted, { width: 48 }]}>{p.start}</Text>
                  <View style={[s.dot, { backgroundColor: e.pause ? colors.warning : subjectColor(e.fach) }]} />
                  <Text style={[s.item, { flex: 1 }, ausfall && s.done, e.pause && { fontStyle: 'italic', color: colors.warning }]} numberOfLines={1}>
                    {ausfall ? 'fällt aus' : e.fach}{e.optional ? <Text style={s.muted}> (optional)</Text> : null}
                  </Text>
                  {e.raum && !ausfall ? <Text style={s.muted}>{e.raum}</Text> : null}
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={s.section}>
          <Text style={s.label}>Wochenaufgaben</Text>
          {wochen.length === 0 ? <Text style={s.muted}>keine</Text> : wochen.map(({ a, cur }) => {
            const m = woche.marks[markKey(c.id, a.id, cur.date)] ?? '';
            const wann = cur.kommt ? TAG_KURZ[cur.tag] : cur.ueberfaellig ? `überfällig (${TAG_KURZ[cur.tag]})` : 'heute';
            return (
              <View key={a.id} style={s.rowCenter}>
                <Ionicons
                  name={m === 'ok' ? 'checkmark-circle' : m === 'no' ? 'close-circle' : 'ellipse-outline'}
                  size={24}
                  color={m === 'ok' ? colors.success : m === 'no' ? colors.danger : cur.ueberfaellig ? colors.warning : colors.textMuted}
                />
                <Text style={[s.item, { flex: 1 }, m === 'ok' && s.done]} numberOfLines={2}>{a.label}</Text>
                <Text style={[s.muted, cur.ueberfaellig && !m && { color: colors.danger, fontWeight: '800' }]}>{m ? '' : wann}</Text>
              </View>
            );
          })}
        </View>

        <View style={s.section}>
          <Text style={s.label}>Aufgaben</Text>
          {tasks.length === 0 ? <Text style={s.muted}>keine</Text> : tasks.map((t) => (
            <View key={t.id} style={s.rowCenter}>
              <Ionicons name={t.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={t.done ? colors.success : colors.textMuted} />
              <Text style={[s.item, { flex: 1 }, t.done && s.done]} numberOfLines={2}>{t.title}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <View style={[s.header, paged && s.headerSmall]}>
        <Text style={[s.title, paged && { fontSize: 17 }]} numberOfLines={1}>{WOCHENTAG[now.getDay()]}, {now.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })} · KW {kalenderwoche(now)}</Text>
        {schulfreiText ? (
          <View style={s.freiBanner}>
            <Ionicons name={dayIdx < 0 && !frei ? 'happy-outline' : 'sunny-outline'} size={22} color="#000" />
            <Text style={[s.freiText, paged && { fontSize: 15 }]} numberOfLines={1}>{schulfreiText}</Text>
          </View>
        ) : null}
        {fotos.length > 0 ? (
          <Pressable onPress={() => setFotoIdx(0)} style={s.fotoBtn} accessibilityLabel="Fotos ansehen">
            <Ionicons name="images-outline" size={22} color={colors.text} />
            {paged ? null : <Text style={s.item}>Fotos</Text>}
          </Pressable>
        ) : null}
        {paged && children.length > 1 ? (
          <View style={s.rowCenter}>
            {children.map((c, i) => (
              <Pressable key={c.id} onPress={() => pager.current?.scrollTo({ x: i * width, animated: false })} hitSlop={8} accessibilityLabel={c.name}>
                <View style={[s.pageDot, { backgroundColor: c.color }, i !== page && { opacity: 0.3 }]} />
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={[s.clock, paged && { fontSize: 26 }]}>{now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
      {children.length === 0 ? (
        <Text style={[s.muted, { padding: 16 }]}>Noch keine Kinder in der Familie angelegt.</Text>
      ) : paged ? (
        <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEventThrottle={100}
          onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {children.map((c) => (
            <ScrollView key={c.id} style={{ width }} contentContainerStyle={s.pageInner}>{renderKind(c)}</ScrollView>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.grid}>{children.map(renderKind)}</ScrollView>
      )}

      {foto ? (
        <Pressable onPress={() => setFotoIdx(null)} style={s.fotoView} accessibilityLabel="Zurück zur Übersicht">
          <Image source={{ uri: foto.data }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          <Text style={s.fotoHint}>{(fotoIdx! % fotos.length) + 1} / {fotos.length} · Tippen für Übersicht</Text>
        </Pressable>
      ) : null}

      <Pressable onPress={() => setPinOpen(true)} style={s.exitBtn} accessibilityLabel="Wand-Modus verlassen">
        <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
      </Pressable>
      <Modal visible={pinOpen} transparent animationType="fade" onRequestClose={() => setPinOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Text style={s.label}>Eltern-PIN</Text>
            <TextInput value={pin} onChangeText={(t) => { setPin(t); setPinError(false); }} onSubmitEditing={submitPin}
              secureTextEntry keyboardType="number-pad" autoFocus style={[s.input, pinError && { borderColor: colors.danger }]} />
            {pinError ? <Text style={{ color: colors.danger }}>Falscher PIN</Text> : null}
            <View style={s.rowCenter}>
              <Pressable onPress={() => { setPinOpen(false); setPin(''); setPinError(false); }} style={s.btn}><Text style={s.item}>Abbrechen</Text></Pressable>
              <Pressable onPress={submitPin} style={[s.btn, { backgroundColor: colors.accentNeon }]}><Text style={[s.item, { color: '#000' }]}>Verlassen</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
    headerSmall: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 10 },
    title: { flexShrink: 1, color: c.text, fontSize: 24, fontWeight: '800' },
    clock: { color: c.text, fontSize: 40, fontWeight: '800' },
    // Alle Kinder nebeneinander in einer Reihe (Display im Querformat).
    pageInner: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 },
    pageDot: { width: 12, height: 12, borderRadius: 6 },
    grid: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, padding: 16 },
    col: { flex: 1, minWidth: 0, backgroundColor: c.surface, borderRadius: 20, padding: 18, gap: 10, borderWidth: 2, borderColor: 'transparent' },
    colAlert: { borderColor: c.danger },
    rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    name: { color: c.text, fontSize: 24, fontWeight: '800' },
    bigNum: { color: c.text, fontSize: 44, fontWeight: '800', lineHeight: 48 },
    bar: { height: 10, borderRadius: 5, backgroundColor: c.surfaceHigh, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 5 },
    section: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 10 },
    label: { color: c.textMuted, fontSize: 14, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
    item: { color: c.text, fontSize: 19, fontWeight: '600' },
    done: { color: c.textMuted, textDecorationLine: 'line-through' },
    muted: { color: c.textMuted, fontSize: 15 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    lessonNow: { backgroundColor: c.surfaceHigh, borderRadius: 10, marginHorizontal: -6, paddingHorizontal: 6, paddingVertical: 2 },
    freiBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.warning, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
    freiText: { color: '#000', fontSize: 20, fontWeight: '800' },
    fotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceHigh, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
    fotoView: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
    fotoHint: { position: 'absolute', bottom: 16, alignSelf: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 15 },
    exitBtn: { position: 'absolute', right: 12, bottom: 12, padding: 10, opacity: 0.4 },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    modal: { backgroundColor: c.surface, borderRadius: 18, padding: 20, gap: 12, width: 300 },
    input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 20, backgroundColor: c.inputBackground, color: c.text, borderWidth: 1.5, borderColor: c.border },
    btn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceHigh },
  });
}
