/**
 * KinderPlanScreen.tsx
 * Neuer Kinder-Tab („Kinder 2“), läuft parallel zum alten Kinder-Tab:
 * Strafpunkte (+1/+2/+3), Wochenaufgaben mit ✓/✗, Strafaufgaben nach Stufen.
 * Alle Einstellungen liegen an einer Stelle (Ansicht „Regeln“).
 * Unten ein Dock wie im Bambini-Tab: Übersicht | je Kind | Regeln.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Switch, Alert, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import uuid from 'react-native-uuid';
import { useTheme, ThemeColors } from '../utils/theme';
import { useFamily } from '../hooks/useFamily';
import ChildAvatar from '../components/ChildAvatar';
import type { ChildConfig } from '../services/family';
import { addTask } from '../services/kinderTasks';
import {
  subscribeRegeln, saveRegeln, subscribeWoche, addPunkt, setPunktGrund, deletePunkt, setMark,
  subscribeStrafaufgaben, addStrafaufgabe, setStrafaufgabeDone, deleteStrafaufgabe, syncStrafaufgaben,
} from '../services/kinderPlan';
import {
  KinderRegeln, KinderWoche, Strafaufgabe, Mark, Takt, DEFAULT_REGELN,
  weekKey, weekDays, kalenderwoche, isoDate, markKey, punkte, faelligeStufen, bisNaechsteStufe, quote, rotiere,
} from '../utils/kinderPlanLogic';

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const STUFEN_FARBEN = ['#FFD60A', '#FF453A', '#BF5AF2'];

/** Alert funktioniert auf Web nicht — window.confirm als Fallback (wie im Kinder-Tab). */
function confirmDelete(title: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(title)) onConfirm();
  } else {
    Alert.alert(title, '', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: onConfirm },
    ]);
  }
}
function showError(e: unknown) {
  const msg = (e as { message?: string })?.message ?? 'Speichern fehlgeschlagen.';
  if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Fehler', msg);
}
const run = (p: Promise<unknown>) => { p.catch(showError); };

/** Verläufe für Action-Buttons (Text darauf immer weiß). */
const GRAD = {
  danger: ['#FF6B3D', '#FF2D78'],
  ok: ['#1FA64A', '#0A8F9E'],
  primary: ['#0A5CFF', '#7B61FF'],
  // Heatmap für +1 / +2 / +3: je mehr Punkte, desto röter.
  heat1: ['#FFC53D', '#FF9500'],
  heat2: ['#FF8A1F', '#FF453A'],
  heat3: ['#FF3B30', '#B0002A'],
} as const;
const HEAT_FG = ['#1C1C1E', '#FFFFFF', '#FFFFFF'];
function Fill({ kind, mono }: { kind: keyof typeof GRAD; mono: (hex: string) => string }) {
  return <LinearGradient colors={[mono(GRAD[kind][0]), mono(GRAD[kind][1])]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />;
}
const newId = () => uuid.v4() as string;

type View_ = 'uebersicht' | 'regeln' | string; // sonst: childId

export function KinderPlanScreen() {
  const { colors, mono } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { familyId, children } = useFamily();
  const fid = familyId ?? '';

  const today = isoDate(new Date());
  const wk = weekKey();
  const days = weekDays(wk);

  const [view, setView] = useState<View_>('uebersicht');
  const [regeln, setRegeln] = useState<KinderRegeln>(DEFAULT_REGELN);
  const [regelnLoaded, setRegelnLoaded] = useState(false);
  const [woche, setWoche] = useState<KinderWoche>({ punkte: {}, marks: {} });
  const [straf, setStraf] = useState<Record<string, Strafaufgabe>>({});
  const [snack, setSnack] = useState<{ id: string; childId: string; pts: number } | null>(null);
  const [sheetChild, setSheetChild] = useState<string | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!fid) return;
    return subscribeRegeln(fid, (r) => { setRegeln(r); setRegelnLoaded(true); });
  }, [fid]);
  useEffect(() => (fid ? subscribeWoche(fid, wk, setWoche) : undefined), [fid, wk]);
  useEffect(() => (fid ? subscribeStrafaufgaben(fid, setStraf) : undefined), [fid]);

  // Von der Kinder-App abgehakte Strafaufgaben übernehmen (nur wenn sich die offenen ändern).
  const openKey = Object.entries(straf).filter(([, a]) => !a.done).map(([id]) => id).sort().join(',');
  useEffect(() => {
    if (fid && openKey) syncStrafaufgaben(fid, straf).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid, openKey]);

  // Automatische Rotation einmal pro Woche (montags bzw. beim ersten Öffnen der Woche).
  const childIds = children.map((c) => c.id);
  useEffect(() => {
    if (!fid || !regelnLoaded || !regeln.rotieren || regeln.letzteRotation === wk || childIds.length === 0) return;
    // ponytail: zwei Geräte gleichzeitig könnten doppelt rotieren; Transaktion, falls das je passiert
    run(saveRegeln(fid, { ...regeln, zuteilung: rotiere(regeln.zuteilung, childIds), letzteRotation: wk }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid, regelnLoaded, regeln.rotieren, regeln.letzteRotation, wk, childIds.join(',')]);

  useEffect(() => () => { if (snackTimer.current) clearTimeout(snackTimer.current); }, []);

  // Ansicht zurücksetzen, falls ein Kind entfernt wurde.
  useEffect(() => {
    if (view !== 'uebersicht' && view !== 'regeln' && children.length && !children.some((c) => c.id === view)) setView('uebersicht');
  }, [children, view]);

  const strafListe = Object.entries(straf).map(([id, a]) => ({ id, ...a }));

  const kidInfo = (c: ChildConfig) => {
    const pts = punkte(woche, c.id);
    return {
      pts,
      due: faelligeStufen(regeln, pts, c.id, wk, strafListe),
      bis: bisNaechsteStufe(regeln, pts),
      q: quote(regeln, woche, c.id, wk, today),
      offen: strafListe.filter((a) => a.childId === c.id && !a.done),
    };
  };

  // ── Aktionen ──────────────────────────────────────────────────────────────

  const givePunkte = (childId: string, pts: number, grund: string | null = null) => {
    const id = newId();
    run(addPunkt(fid, wk, id, { childId, pts, grund, at: new Date().toISOString(), markKey: null }));
    if (!grund) {
      setSnack({ id, childId, pts });
      if (snackTimer.current) clearTimeout(snackTimer.current);
      snackTimer.current = setTimeout(() => setSnack(null), 8000);
    }
  };

  const setWochenMark = (childId: string, aufgabeId: string, label: string, date: string, val: Mark) => {
    const key = markKey(childId, aufgabeId, date);
    const next: Mark = woche.marks[key] === val ? '' : val;
    run((async () => {
      await setMark(fid, wk, key, next);
      for (const [id, e] of Object.entries(woche.punkte)) if (e.markKey === key) await deletePunkt(fid, wk, id);
      if (next === 'no' && regeln.vergessenPts > 0) {
        await addPunkt(fid, wk, newId(), {
          childId, pts: regeln.vergessenPts, grund: `${label} vergessen`, at: new Date().toISOString(), markKey: key,
        });
      }
    })());
  };

  const vergebeStrafaufgabe = (childId: string, label: string, stufe: number) =>
    run(addStrafaufgabe(fid, newId(), { childId, label, stufe, week: wk }));

  const updateRegeln = (fn: (r: KinderRegeln) => KinderRegeln) => run(saveRegeln(fid, fn(regeln)));

  // ── Bausteine ─────────────────────────────────────────────────────────────

  const PlusButtons = ({ childId }: { childId: string }) => (
    <View style={s.plusRow}>
      {[1, 2, 3].map((n) => (
        <Pressable key={n} onPress={() => givePunkte(childId, n)} style={s.plusBtn}
          accessibilityLabel={`${n} Strafpunkt${n > 1 ? 'e' : ''} geben`}>
          <Fill kind={`heat${n}` as 'heat1' | 'heat2' | 'heat3'} mono={mono} />
          <Text style={[s.plusText, { color: HEAT_FG[n - 1] }]}>+{n}</Text>
        </Pressable>
      ))}
    </View>
  );

  const Bar = ({ pts, color }: { pts: number; color: string }) => {
    const prev = [...regeln.stufen].reverse().find((st) => st.min <= pts)?.min ?? 0;
    const next = regeln.stufen.find((st) => st.min > pts)?.min;
    const pct = next ? (pts - prev) / (next - prev) : 1;
    return <View style={s.bar}><View style={[s.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: mono(color) }]} /></View>;
  };

  const StrafRow = ({ a }: { a: Strafaufgabe & { id: string } }) => (
    <View style={s.rowBetween}>
      <View style={{ flex: 1 }}>
        <Text style={s.bold}>{a.label}</Text>
        <Text style={s.muted}>Stufe {a.stufe + 1}{a.week !== wk ? ' · aus der Vorwoche' : ''}</Text>
      </View>
      <Pressable onPress={() => run(setStrafaufgabeDone(fid, a.id, a, true))} style={s.okBtn} accessibilityLabel={`${a.label} erledigt`}>
        <Fill kind="ok" mono={mono} />
        <Text style={s.okBtnText}>Erledigt</Text>
      </Pressable>
      <Pressable onPress={() => confirmDelete('Strafaufgabe entfernen?', () => run(deleteStrafaufgabe(fid, a.id, a)))} hitSlop={8} accessibilityLabel="Strafaufgabe entfernen">
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  // ── Übersicht ─────────────────────────────────────────────────────────────

  const renderUebersicht = () => {
    const infos = children.map((c) => ({ c, ...kidInfo(c) }));
    const sum = infos.reduce((n, i) => n + i.pts, 0);
    const q = infos.reduce((a, i) => ({ ok: a.ok + i.q.ok, soll: a.soll + i.q.soll }), { ok: 0, soll: 0 });
    const offene = infos.flatMap((i) => [
      ...i.due.map((st) => ({ type: 'due' as const, c: i.c, st })),
      ...i.offen.map((a) => ({ type: 'open' as const, c: i.c, a })),
    ]);
    return (
      <>
        <Text style={s.sub}>KW {kalenderwoche()} · {sum} Strafpunkte{q.soll ? ` · ${Math.round((q.ok / q.soll) * 100)} % Aufgaben erledigt` : ''}</Text>
        <View style={s.grid}>
          {infos.map(({ c, pts, due, bis, q: kq, offen }) => (
            <Pressable key={c.id} onPress={() => setView(c.id)} style={[s.tile, s.half, (due.length > 0 || offen.length > 0) && s.tileAlert]}
              accessibilityLabel={`${c.name} öffnen`}>
              <View style={s.rowCenter}>
                <ChildAvatar child={c} size={30} />
                <Text style={[s.bold, { flex: 1 }]} numberOfLines={1}>{c.name}</Text>
                <Text style={s.bigNum}>{pts}</Text>
              </View>
              <Bar pts={pts} color={c.color} />
              {due.length > 0 ? <Text style={s.alertText}>Strafaufgabe fällig</Text>
                : offen.length > 0 ? <Text style={s.alertText}>Strafaufgabe offen</Text>
                : <Text style={[s.muted, bis === 1 && { color: colors.warning, fontWeight: '700' }]}>{bis === null ? 'Höchste Stufe erreicht' : `Noch ${bis} bis Strafaufgabe`}</Text>}
              <Text style={s.muted}>
                Aufgaben <Text style={s.boldSmall}>{kq.ok} / {kq.soll}</Text>
                {kq.soll > 0 && kq.ok === kq.soll ? <Text style={{ color: colors.success, fontWeight: '700' }}> · alles erledigt</Text> : null}
              </Text>
              <PlusButtons childId={c.id} />
            </Pressable>
          ))}
        </View>
        {children.length === 0 ? <Text style={s.muted}>Noch keine Kinder in der Familie angelegt.</Text> : null}
        {offene.length > 0 ? (
          <View style={s.tile}>
            <Text style={s.label}>Offene Strafaufgaben</Text>
            {offene.map((o) => (
              <View key={o.type === 'due' ? `${o.c.id}-${o.st}` : o.a.id} style={s.rowCenter}>
                <ChildAvatar child={o.c} size={26} />
                {o.type === 'due' ? (
                  <>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bold}>{o.c.name} · Stufe {o.st + 1}</Text>
                      <Text style={s.muted}>noch keine Aufgabe ausgewählt</Text>
                    </View>
                    <Pressable onPress={() => setView(o.c.id)} style={s.dangerBtn}><Fill kind="danger" mono={mono} /><Text style={s.dangerBtnText}>Auswählen</Text></Pressable>
                  </>
                ) : <View style={{ flex: 1 }}><StrafRow a={o.a} /></View>}
              </View>
            ))}
          </View>
        ) : null}
      </>
    );
  };

  // ── Kind ──────────────────────────────────────────────────────────────────

  const [dueChoice, setDueChoice] = useState<Record<string, string>>({});

  const renderKind = (c: ChildConfig) => {
    const { pts, due, bis, offen } = kidInfo(c);
    const aufgaben = regeln.wochenaufgaben.filter((a) => regeln.zuteilung[a.id] === c.id);
    const eintraege = Object.entries(woche.punkte).filter(([, e]) => e.childId === c.id).sort((a, b) => b[1].at.localeCompare(a[1].at));
    return (
      <>
        <View style={s.rowCenter}>
          <ChildAvatar child={c} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={s.h1}>{c.name}</Text>
            <Text style={s.muted}>KW {kalenderwoche()} · {bis === null ? 'höchste Stufe erreicht' : `noch ${bis} bis zur nächsten Strafaufgabe`}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.bigNum}>{pts}</Text>
            <Text style={s.muted}>Strafpunkte</Text>
          </View>
        </View>
        <Bar pts={pts} color={c.color} />

        {/* Strafpunkte werden nur auf der Übersicht vergeben. */}
        <Pressable onPress={() => setSheetChild(c.id)} style={s.gradBtn} accessibilityLabel="Aufgabe vergeben">
          <Fill kind="primary" mono={mono} />
          <Text style={s.gradBtnText}>+ Aufgabe vergeben</Text>
        </Pressable>

        {due.map((st) => {
          const choices = regeln.stufen[st]?.aufgaben ?? [];
          const picked = dueChoice[`${c.id}-${st}`] ?? choices[0];
          return (
            <View key={st} style={[s.tile, s.tileAlert]}>
              <Text style={s.alertText}>Strafaufgabe fällig · Stufe {st + 1} (ab {regeln.stufen[st].min} Punkten)</Text>
              {choices.length === 0 ? <Text style={s.muted}>Für diese Stufe sind unter „Regeln“ noch keine Aufgaben hinterlegt.</Text> : (
                <>
                  <View style={s.chips}>
                    {choices.map((ch) => (
                      <Pressable key={ch} onPress={() => setDueChoice((p) => ({ ...p, [`${c.id}-${st}`]: ch }))}
                        style={[s.chip, picked === ch && s.chipDanger]} accessibilityState={{ selected: picked === ch }}>
                        <Text style={s.chipText}>{ch}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable onPress={() => picked && vergebeStrafaufgabe(c.id, picked, st)} style={s.dangerBtnWide}>
                    <Fill kind="danger" mono={mono} />
                    <Text style={s.dangerBtnText}>{picked} zuweisen</Text>
                  </Pressable>
                </>
              )}
            </View>
          );
        })}

        {offen.length > 0 ? (
          <View style={s.tile}>
            <Text style={s.label}>Strafaufgaben</Text>
            {offen.map((a) => <StrafRow key={a.id} a={a} />)}
            <Text style={s.muted}>Steht auch in {c.name}s Kinder-App.</Text>
          </View>
        ) : null}

        <View style={s.tile}>
          <View style={s.rowBetween}>
            <Text style={s.label}>Wochenaufgaben heute</Text>
            <Pressable onPress={() => setSheetChild(c.id)} hitSlop={8}><Text style={s.link}>+ zuweisen</Text></Pressable>
          </View>
          {aufgaben.length === 0 ? <Text style={s.muted}>Keine Wochenaufgaben zugewiesen.</Text> : aufgaben.map((a) => {
            const date = a.takt === 'woechentlich' ? wk : today;
            const m = woche.marks[markKey(c.id, a.id, date)] ?? '';
            return (
              <View key={a.id} style={[s.rowCenter, s.divider]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bold}>{a.label} <Text style={s.muted}>{a.takt === 'taeglich' ? 'täglich' : 'diese Woche'}</Text></Text>
                  {a.takt === 'taeglich' ? (
                    <View style={s.strip} accessibilityLabel={days.map((d, i) => `${DAY_LABELS[i]} ${({ ok: 'erledigt', no: 'vergessen' } as Record<string, string>)[woche.marks[markKey(c.id, a.id, d)] ?? ''] ?? (d <= today ? 'offen' : '')}`).join(', ')}>
                      {days.map((d) => {
                        const dm = woche.marks[markKey(c.id, a.id, d)];
                        const bg = dm === 'ok' ? colors.success : dm === 'no' ? colors.danger : d <= today ? colors.textMuted : colors.surfaceHigh;
                        return <View key={d} style={[s.stripSeg, { backgroundColor: bg }]} />;
                      })}
                    </View>
                  ) : null}
                </View>
                <Pressable onPress={() => setWochenMark(c.id, a.id, a.label, date, 'ok')} style={[s.markBtn, m === 'ok' && s.markBtnOn]}
                  accessibilityLabel={`${a.label} erledigt`} accessibilityState={{ selected: m === 'ok' }}>
                  {m === 'ok' ? <Fill kind="ok" mono={mono} /> : null}
                  <Ionicons name="checkmark" size={22} color={m === 'ok' ? '#FFFFFF' : colors.success} />
                </Pressable>
                <Pressable onPress={() => setWochenMark(c.id, a.id, a.label, date, 'no')} style={[s.markBtn, m === 'no' && s.markBtnOn]}
                  accessibilityLabel={`${a.label} vergessen, plus ${regeln.vergessenPts} Strafpunkte`} accessibilityState={{ selected: m === 'no' }}>
                  {m === 'no' ? <Fill kind="danger" mono={mono} /> : null}
                  <Ionicons name="close" size={22} color={m === 'no' ? '#FFFFFF' : colors.danger} />
                </Pressable>
              </View>
            );
          })}
          {aufgaben.length > 0 ? <Text style={s.muted}>✗ = vergessen, trägt automatisch +{regeln.vergessenPts} Strafpunkte ein.</Text> : null}
        </View>

        <View style={s.tile}>
          <Text style={s.label}>Strafpunkte diese Woche</Text>
          {eintraege.length === 0 ? <Text style={s.muted}>Keine. Super!</Text> : eintraege.map(([id, e]) => (
            <View key={id} style={s.rowBetween}>
              <Text style={s.muted}>{DAY_LABELS[(new Date(e.at).getDay() + 6) % 7]}</Text>
              <Text style={[s.body, { flex: 1 }]} numberOfLines={1}>{e.grund ?? 'ohne Grund'}</Text>
              <Text style={s.alertText}>+{e.pts}</Text>
              <Pressable onPress={() => confirmDelete('Strafpunkte löschen?', () => run(deletePunkt(fid, wk, id)))} hitSlop={8} accessibilityLabel="Eintrag löschen">
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      </>
    );
  };

  // ── Regeln ────────────────────────────────────────────────────────────────

  const [newGrund, setNewGrund] = useState('');
  const [newWA, setNewWA] = useState('');
  const [newStufeAufgabe, setNewStufeAufgabe] = useState<Record<number, string>>({});

  const Stepper = ({ value, onChange, min = 0, label }: { value: number; onChange: (n: number) => void; min?: number; label: string }) => (
    <View style={s.rowCenter}>
      <Pressable onPress={() => value > min && onChange(value - 1)} style={s.stepBtn} accessibilityLabel={`${label} verringern`}><Text style={s.stepText}>–</Text></Pressable>
      <Text style={[s.alertText, { minWidth: 20, textAlign: 'center', fontSize: 15 }]}>{value}</Text>
      <Pressable onPress={() => onChange(value + 1)} style={s.stepBtn} accessibilityLabel={`${label} erhöhen`}><Text style={s.stepText}>+</Text></Pressable>
    </View>
  );

  const AddRow = ({ value, onChange, onAdd, placeholder }: { value: string; onChange: (t: string) => void; onAdd: () => void; placeholder: string }) => (
    <View style={[s.rowCenter, s.divider]}>
      <TextInput value={value} onChangeText={onChange} onSubmitEditing={onAdd} placeholder={placeholder}
        placeholderTextColor={colors.placeholder} style={s.input} returnKeyType="done" />
      <Pressable onPress={onAdd} style={s.stepBtn} accessibilityLabel="Hinzufügen"><Ionicons name="add" size={20} color={colors.text} /></Pressable>
    </View>
  );

  const renderRegeln = () => (
    <>
      <Text style={s.sub}>Gilt für alle Kinder. Alles wird nur hier eingestellt.</Text>

      <View style={s.tile}>
        <Text style={s.label}>Gründe für Strafpunkte</Text>
        <Text style={s.muted}>Zur Auswahl, nachdem du auf der Übersicht +1, +2 oder +3 vergeben hast.</Text>
        {regeln.gruende.map((g) => (
          <View key={g.id} style={[s.rowCenter, s.divider]}>
            <Text style={[s.body, { flex: 1 }]}>{g.label}</Text>
            <Pressable onPress={() => confirmDelete(`„${g.label}“ löschen?`, () => updateRegeln((r) => ({ ...r, gruende: r.gruende.filter((x) => x.id !== g.id) })))} hitSlop={8} accessibilityLabel={`${g.label} löschen`}>
              <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
        {AddRow({
          value: newGrund, onChange: setNewGrund, placeholder: 'Neuer Grund, z. B. Frech gewesen',
          onAdd: () => { const t = newGrund.trim(); if (!t) return; updateRegeln((r) => ({ ...r, gruende: [...r.gruende, { id: newId(), label: t }] })); setNewGrund(''); },
        })}
      </View>

      <View style={s.tile}>
        <Text style={s.label}>Strafaufgaben nach Punkten</Text>
        {regeln.stufen.map((st, i) => (
          <View key={i} style={[{ gap: 8 }, i > 0 && s.divider]}>
            <View style={s.rowCenter}>
              <Text style={[s.bold, { flex: 1 }]}><Text style={{ color: mono(STUFEN_FARBEN[i % STUFEN_FARBEN.length]) }}>Stufe {i + 1}</Text> · ab Punkten</Text>
              <Stepper value={st.min} min={1} label={`Stufe ${i + 1} Schwelle`} onChange={(n) => updateRegeln((r) => ({ ...r, stufen: r.stufen.map((x, j) => (j === i ? { ...x, min: n } : x)) }))} />
              <Pressable onPress={() => confirmDelete(`Stufe ${i + 1} löschen?`, () => updateRegeln((r) => ({ ...r, stufen: r.stufen.filter((_, j) => j !== i) })))} hitSlop={8} accessibilityLabel={`Stufe ${i + 1} löschen`}>
                <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={s.chips}>
              {st.aufgaben.map((a) => (
                <Pressable key={a} onPress={() => confirmDelete(`„${a}“ entfernen?`, () => updateRegeln((r) => ({ ...r, stufen: r.stufen.map((x, j) => (j === i ? { ...x, aufgaben: x.aufgaben.filter((y) => y !== a) } : x)) })))}
                  style={s.chip} accessibilityLabel={`${a} entfernen`}>
                  <Text style={s.chipText}>{a}  <Text style={s.muted}>×</Text></Text>
                </Pressable>
              ))}
            </View>
            {AddRow({
              value: newStufeAufgabe[i] ?? '', onChange: (t) => setNewStufeAufgabe((p) => ({ ...p, [i]: t })), placeholder: `Aufgabe für Stufe ${i + 1}`,
              onAdd: () => {
                const t = (newStufeAufgabe[i] ?? '').trim(); if (!t) return;
                updateRegeln((r) => ({ ...r, stufen: r.stufen.map((x, j) => (j === i && !x.aufgaben.includes(t) ? { ...x, aufgaben: [...x.aufgaben, t] } : x)) }));
                setNewStufeAufgabe((p) => ({ ...p, [i]: '' }));
              },
            })}
          </View>
        ))}
        <Pressable onPress={() => updateRegeln((r) => ({ ...r, stufen: [...r.stufen, { min: (r.stufen[r.stufen.length - 1]?.min ?? 0) + 4, aufgaben: [] }] }))} hitSlop={8}>
          <Text style={s.link}>+ Stufe hinzufügen</Text>
        </Pressable>
        <Text style={s.muted}>Punkte starten jeden Montag wieder bei 0. Jede Stufe gibt höchstens eine Strafaufgabe pro Woche.</Text>
      </View>

      <View style={s.tile}>
        <Text style={s.label}>Wochenaufgaben</Text>
        {regeln.wochenaufgaben.map((a) => {
          const owner = children.find((c) => c.id === regeln.zuteilung[a.id]);
          return (
            <View key={a.id} style={[s.rowCenter, s.divider]}>
              <View style={{ flex: 1 }}>
                <Text style={s.body}>{a.label}</Text>
                <Text style={s.muted}>{owner ? `jetzt ${owner.name}` : 'niemandem zugewiesen'}</Text>
              </View>
              <Pressable onPress={() => updateRegeln((r) => ({ ...r, wochenaufgaben: r.wochenaufgaben.map((x) => (x.id === a.id ? { ...x, takt: (x.takt === 'taeglich' ? 'woechentlich' : 'taeglich') as Takt } : x)) }))}
                style={s.chip} accessibilityLabel={`Takt von ${a.label} wechseln`}>
                <Text style={s.chipText}>{a.takt === 'taeglich' ? 'täglich' : 'wöchentlich'}</Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(`„${a.label}“ löschen?`, () => updateRegeln((r) => {
                const { [a.id]: _, ...zuteilung } = r.zuteilung;
                return { ...r, wochenaufgaben: r.wochenaufgaben.filter((x) => x.id !== a.id), zuteilung };
              }))} hitSlop={8} accessibilityLabel={`${a.label} löschen`}>
                <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          );
        })}
        {AddRow({
          value: newWA, onChange: setNewWA, placeholder: 'Neue Wochenaufgabe',
          onAdd: () => { const t = newWA.trim(); if (!t) return; updateRegeln((r) => ({ ...r, wochenaufgaben: [...r.wochenaufgaben, { id: newId(), label: t, takt: 'taeglich' }] })); setNewWA(''); },
        })}
        <View style={[s.rowCenter, s.divider]}>
          <View style={{ flex: 1 }}>
            <Text style={s.body}>Vergessen (✗) gibt</Text>
            <Text style={s.muted}>Strafpunkte, automatisch eingetragen</Text>
          </View>
          <Stepper value={regeln.vergessenPts} label="Strafpunkte für vergessene Wochenaufgabe" onChange={(n) => updateRegeln((r) => ({ ...r, vergessenPts: n }))} />
        </View>
        <View style={[s.rowCenter, s.divider]}>
          <View style={{ flex: 1 }}>
            <Text style={s.body}>Jeden Montag rotieren</Text>
            <Text style={s.muted}>Alle Wochenaufgaben wandern zum nächsten Kind.</Text>
          </View>
          <Switch value={regeln.rotieren} onValueChange={(v) => updateRegeln((r) => ({ ...r, rotieren: v, letzteRotation: wk }))} />
        </View>
      </View>
    </>
  );

  // ── Aufgabe-vergeben-Sheet ────────────────────────────────────────────────

  const [sheetMode, setSheetMode] = useState<'woche' | 'einmalig' | 'straf'>('woche');
  const [sheetPick, setSheetPick] = useState<string | null>(null);
  const [sheetText, setSheetText] = useState('');
  const sheetKid = children.find((c) => c.id === sheetChild);
  const closeSheet = () => { setSheetChild(null); setSheetPick(null); setSheetText(''); };

  const sheetSubmit = () => {
    if (!sheetKid) return;
    if (sheetMode === 'woche' && sheetPick) {
      updateRegeln((r) => ({ ...r, zuteilung: { ...r.zuteilung, [sheetPick]: sheetKid.id } }));
    } else if (sheetMode === 'einmalig' && sheetText.trim()) {
      run(addTask(fid, sheetKid.id, { title: sheetText.trim(), done: false, date: today, createdAt: new Date().toISOString() }));
    } else if (sheetMode === 'straf' && sheetPick) {
      const [stufe, label] = [Number(sheetPick.split('|')[0]), sheetPick.split('|').slice(1).join('|')];
      vergebeStrafaufgabe(sheetKid.id, label, stufe);
    } else return;
    closeSheet();
  };

  const sheetLabel = !sheetKid ? '' : sheetMode === 'woche'
    ? (sheetPick ? `${regeln.wochenaufgaben.find((a) => a.id === sheetPick)?.label} an ${sheetKid.name} geben` : 'Wochenaufgabe wählen')
    : sheetMode === 'einmalig' ? `An ${sheetKid.name} schicken`
    : (sheetPick ? `${sheetPick.split('|').slice(1).join('|')} zuweisen` : 'Strafaufgabe wählen');

  const renderSheet = () => (
    <Modal visible={!!sheetKid} transparent animationType="slide" onRequestClose={closeSheet}>
      <Pressable style={s.backdrop} onPress={closeSheet} accessibilityLabel="Schließen" />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.rowBetween}>
          <Text style={s.h2}>Aufgabe für {sheetKid?.name}</Text>
          <Pressable onPress={closeSheet} style={s.closeBtn} accessibilityLabel="Schließen"><Ionicons name="close" size={20} color={colors.textMuted} /></Pressable>
        </View>
        <View style={s.segment}>
          {([['woche', 'Wochenaufgabe'], ['einmalig', 'Einmalig'], ['straf', 'Strafaufgabe']] as const).map(([k, l]) => (
            <Pressable key={k} onPress={() => { setSheetMode(k); setSheetPick(null); }} style={s.segItem} accessibilityState={{ selected: sheetMode === k }}>
              {sheetMode === k ? <LinearGradient colors={[mono('#0A5CFF'), mono('#7B61FF')]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
              <Text style={[s.segText, sheetMode === k && { color: '#FFFFFF' }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {sheetMode === 'woche' ? regeln.wochenaufgaben.map((a) => {
            const owner = children.find((c) => c.id === regeln.zuteilung[a.id]);
            const mine = owner?.id === sheetKid?.id;
            return (
              <Pressable key={a.id} disabled={mine} onPress={() => setSheetPick(a.id)} style={[s.rowCenter, s.divider, { paddingVertical: 10 }, mine && { opacity: 0.45 }]}
                accessibilityState={{ selected: sheetPick === a.id, disabled: mine }}>
                <Ionicons name={sheetPick === a.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={sheetPick === a.id ? colors.accentNeon : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={s.bold}>{a.label}</Text>
                  <Text style={s.muted}>{a.takt === 'taeglich' ? 'täglich' : 'wöchentlich'}</Text>
                </View>
                <Text style={s.muted}>{mine ? `hat ${owner?.name}` : owner ? `jetzt ${owner.name}` : 'frei'}</Text>
              </Pressable>
            );
          }) : sheetMode === 'einmalig' ? (
            <View style={{ gap: 8, paddingVertical: 8 }}>
              <TextInput value={sheetText} onChangeText={setSheetText} placeholder="z. B. Hausaufgaben zeigen" placeholderTextColor={colors.placeholder}
                style={s.input} onSubmitEditing={sheetSubmit} autoFocus />
              <Text style={s.muted}>Landet als normale Aufgabe in der Kinder-App.</Text>
            </View>
          ) : regeln.stufen.map((st, i) => (
            <View key={i} style={{ gap: 6, paddingVertical: 8 }}>
              <Text style={s.label}>Stufe {i + 1} · ab {st.min} Punkten</Text>
              <View style={s.chips}>
                {st.aufgaben.map((a) => {
                  const key = `${i}|${a}`;
                  return (
                    <Pressable key={key} onPress={() => setSheetPick(key)} style={[s.chip, sheetPick === key && s.chipDanger]} accessibilityState={{ selected: sheetPick === key }}>
                      <Text style={s.chipText}>{a}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
        {sheetMode === 'woche' ? (
          <View style={[s.rowCenter, s.switchBox]}>
            <View style={{ flex: 1 }}>
              <Text style={s.bold}>Jeden Montag rotieren</Text>
              <Text style={s.muted}>Alle Wochenaufgaben wandern zum nächsten Kind</Text>
            </View>
            <Switch value={regeln.rotieren} onValueChange={(v) => updateRegeln((r) => ({ ...r, rotieren: v, letzteRotation: wk }))} />
          </View>
        ) : null}
        <Pressable onPress={sheetSubmit} style={s.gradBtnWide} accessibilityLabel={sheetLabel}>
          <LinearGradient colors={[mono('#0A5CFF'), mono('#7B61FF')]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={s.gradBtnText}>{sheetLabel}</Text>
        </Pressable>
      </View>
    </Modal>
  );

  // ── Dock & Snackbar ───────────────────────────────────────────────────────

  type McIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  const dockItems: { key: string; label: string; icon?: McIcon; iconOff?: McIcon; child?: ChildConfig; colors: [string, string]; badge?: number }[] = [
    { key: 'uebersicht', label: 'Übersicht', icon: 'view-dashboard', iconOff: 'view-dashboard-outline', colors: ['#0A5CFF', '#7B61FF'] },
    ...children.map((c) => {
      const i = kidInfo(c);
      return { key: c.id, label: c.name, child: c, colors: [c.color, '#7B61FF'] as [string, string], badge: i.due.length + i.offen.length };
    }),
    { key: 'regeln', label: 'Regeln', icon: 'cog', iconOff: 'cog-outline', colors: ['#FF9F0A', '#FF375F'] },
  ];

  const snackKid = snack ? children.find((c) => c.id === snack.childId) : undefined;
  const currentKid = children.find((c) => c.id === view);

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {view === 'regeln' ? renderRegeln() : currentKid ? renderKind(currentKid) : renderUebersicht()}
      </ScrollView>

      {snack && snackKid ? (
        <View style={s.snack}>
          <View style={s.rowBetween}>
            <Text style={s.snackTitle}>{snackKid.name} +{snack.pts} · Grund? <Text style={s.snackMuted}>(optional)</Text></Text>
            <Pressable onPress={() => { run(deletePunkt(fid, wk, snack.id)); setSnack(null); }} hitSlop={8}>
              <Text style={s.snackUndo}>Rückgängig</Text>
            </Pressable>
          </View>
          <View style={s.chips}>
            {regeln.gruende.map((g) => (
              <Pressable key={g.id} onPress={() => { run(setPunktGrund(fid, wk, snack.id, g.label)); setSnack(null); }} style={s.snackChip}>
                <Text style={s.snackChipText}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={s.dock}>
        {dockItems.map((v) => {
          const on = view === v.key;
          return (
            <Pressable key={v.key} style={s.dockItem} onPress={() => setView(v.key)} accessibilityLabel={v.label} accessibilityState={{ selected: on }}>
              {on ? <LinearGradient colors={[mono(v.colors[0]), mono(v.colors[1])]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
              <View>
                {v.child ? <ChildAvatar child={v.child} size={36} />
                  : <MaterialCommunityIcons name={on ? v.icon! : v.iconOff!} size={28} color={on ? '#FFFFFF' : colors.textSecondary} />}
                {v.badge ? <View style={s.dockBadge}><Text style={s.dockBadgeText}>{v.badge}</Text></View> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {renderSheet()}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    scroll: { padding: 16, paddingBottom: 120, gap: 12 },
    h1: { color: c.text, fontSize: 26, fontWeight: '800' },
    h2: { color: c.text, fontSize: 20, fontWeight: '800' },
    sub: { color: c.textMuted, fontSize: 13 },
    label: { color: c.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
    body: { color: c.text, fontSize: 15 },
    bold: { color: c.text, fontSize: 15, fontWeight: '700' },
    boldSmall: { color: c.text, fontWeight: '700' },
    muted: { color: c.textMuted, fontSize: 12 },
    bigNum: { color: c.text, fontSize: 26, fontWeight: '800' },
    alertText: { color: c.danger, fontSize: 12, fontWeight: '700' },
    link: { color: c.accentNeon, fontSize: 13, fontWeight: '700' },
    rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: { backgroundColor: c.surface, borderRadius: 18, padding: 14, gap: 8, borderWidth: 1.5, borderColor: 'transparent' },
    half: { flexBasis: '47%', flexGrow: 1, padding: 12 },
    tileAlert: { borderColor: c.danger },
    bar: { height: 6, borderRadius: 3, backgroundColor: c.surfaceHigh, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3 },
    plusRow: { flexDirection: 'row', gap: 6 },
    plusBtn: { flex: 1, height: 40, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    plusText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
    gradBtn: { height: 44, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    gradBtnWide: { height: 52, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    gradBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    okBtn: { height: 36, paddingHorizontal: 14, borderRadius: 12, overflow: 'hidden', justifyContent: 'center' },
    okBtnText: { color: '#FFFFFF', fontWeight: '800' },
    dangerBtn: { height: 36, paddingHorizontal: 14, borderRadius: 12, overflow: 'hidden', justifyContent: 'center' },
    dangerBtnWide: { height: 44, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    dangerBtnText: { color: '#FFFFFF', fontWeight: '800' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: c.surfaceHigh, borderWidth: 1.5, borderColor: c.border, justifyContent: 'center' },
    chipDanger: { borderColor: c.danger },
    chipText: { color: c.text, fontSize: 14, fontWeight: '600' },
    markBtn: { width: 48, height: 44, borderRadius: 12, overflow: 'hidden', backgroundColor: c.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
    markBtnOn: { backgroundColor: 'transparent' },
    strip: { flexDirection: 'row', gap: 4, marginTop: 4 },
    stripSeg: { width: 18, height: 6, borderRadius: 3 },
    stepBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
    stepText: { color: c.text, fontSize: 18, fontWeight: '800' },
    input: { flex: 1, minHeight: 40, borderRadius: 10, paddingHorizontal: 12, backgroundColor: c.inputBackground, color: c.text, borderWidth: 1, borderColor: c.border },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 16, paddingTop: 10, gap: 12, borderWidth: 1, borderColor: c.border },
    handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
    segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: c.surfaceHigh },
    segItem: { flex: 1, height: 38, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    segText: { color: c.textSecondary, fontSize: 13, fontWeight: '800' },
    switchBox: { padding: 12, borderRadius: 14, backgroundColor: c.surfaceHigh },
    snack: { position: 'absolute', left: 12, right: 12, bottom: 84, backgroundColor: c.text, borderRadius: 16, padding: 12, gap: 8, elevation: 10, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
    snackTitle: { color: c.background, fontWeight: '800', flexShrink: 1 },
    snackMuted: { color: c.background, fontWeight: '400', opacity: 0.6 },
    snackUndo: { color: c.accent, fontWeight: '800' },
    snackChip: { height: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: c.textMuted, justifyContent: 'center' },
    snackChipText: { color: c.background, fontSize: 13, fontWeight: '600' },
    dock: {
      position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', gap: 4, padding: 5, borderRadius: 22,
      backgroundColor: c.surfaceHigh, borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 8,
    },
    dockItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 17, overflow: 'hidden' },
    dockBadge: { position: 'absolute', top: -4, right: -8, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#FF375F', alignItems: 'center', justifyContent: 'center' },
    dockBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  });
}
