/**
 * KinderPlanKind.tsx
 * Bausteine der Kind-Seite im Kinderplan-Tab („Kinder 2“), übernommen aus dem
 * alten Kinder-Tab, damit beim Ablösen nichts verloren geht:
 *  - KindKacheln: Strafpunkte, Taschengeld, Fußball (Spiele/Tabelle), Schiedsrichter
 *  - KindAufgaben: Aufgaben der Kinder-App (bestätigen/ablehnen, bearbeiten, löschen, Verlauf)
 * Belohnungen werden bewusst nicht mehr angeboten.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, TextInput, Linking, Alert, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import uuid from 'react-native-uuid';
import type { ThemeColors } from '../utils/theme';
import type { ChildConfig } from '../services/family';
import {
  AllowanceMonth, subscribeToAllowanceMonths, setAllowanceReceived, nextAllowanceMonth,
  effectiveAllowance, formatEuro, formatMonthLabel,
} from '../services/allowance';
import { Match, Standing, subscribeToMatches, subscribeToTable } from '../services/fussballDe';
import {
  ChildTask, RepeatInterval, REPEAT_LABELS, ActivityEntry, toggleTask, rejectTask, markChildTasksSeen,
  updateTask, deleteTask, getActivityLog,
} from '../services/kinderTasks';
import type { KPStyles } from '../screens/KinderPlanScreen';

// Schiedsrichter-Lehrgang (TE-85): fester Link, wie im alten Kinder-Tab.
const REFEREE_COURSE_URL = 'https://claude.ai/code/artifact/4146ef89-451a-41f2-bfcc-9b0787895549';

// ── Gemeinsame Helfer (auch vom Screen genutzt) ─────────────────────────────

/** Verläufe für Action-Buttons (Text darauf immer weiß). */
export const GRAD = {
  danger: ['#FF6B3D', '#FF2D78'],
  ok: ['#1FA64A', '#0A8F9E'],
  primary: ['#0A5CFF', '#7B61FF'],
  sport: ['#0A5CFF', '#00B8D9'],
  // Heatmap für +1 / +2 / +3: je mehr Punkte, desto röter.
  heat1: ['#FFC53D', '#FF9500'],
  heat2: ['#FF8A1F', '#FF453A'],
  heat3: ['#FF3B30', '#B0002A'],
} as const;
export const HEAT_FG = ['#1C1C1E', '#FFFFFF', '#FFFFFF'];
export function Fill({ kind, mono }: { kind: keyof typeof GRAD; mono: (hex: string) => string }) {
  return <LinearGradient colors={[mono(GRAD[kind][0]), mono(GRAD[kind][1])]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />;
}

/** Alert funktioniert auf Web nicht — window.confirm als Fallback (wie im Kinder-Tab). */
export function confirmAction(title: string, onConfirm: () => void, okLabel = 'Löschen') {
  if (Platform.OS === 'web') {
    if (window.confirm(title)) onConfirm();
  } else {
    Alert.alert(title, '', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: okLabel, style: okLabel === 'Löschen' ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }
}
export function info(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${msg}`); else Alert.alert(title, msg);
}
export const run = (p: Promise<unknown>) => {
  p.catch((e) => info('Fehler', (e as { message?: string })?.message ?? 'Speichern fehlgeschlagen.'));
};
export const newId = () => uuid.v4() as string;

const fmtDate = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}.${m}.`; };
const pad = (n: number) => String(n).padStart(2, '0');
/** ISO-Zeitstempel → "19.10. 14:05" in Ortszeit. */
const fmtTs = (iso: string) => { const d = new Date(iso); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const wochentag = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return WOCHENTAG[new Date(y, m - 1, d).getDay()]; };

// ── Kacheln ────────────────────────────────────────────────────────────────

interface KachelnProps {
  fid: string;
  child: ChildConfig;
  pts: number;
  bis: number | null;
  barPct: number;
  today: string;
  s: KPStyles;
  colors: ThemeColors;
  mono: (hex: string) => string;
}

export function KindKacheln({ fid, child, pts, bis, barPct, today, s, colors, mono }: KachelnProps) {
  const [months, setMonths] = useState<Record<string, AllowanceMonth>>({});
  const [matches, setMatches] = useState<Match[]>([]);
  const [table, setTable] = useState<Standing[]>([]);
  const [open, setOpen] = useState<'geld' | 'fussball' | null>(null);
  const [fussballView, setFussballView] = useState<'spiele' | 'tabelle'>('spiele');

  useEffect(() => (fid ? subscribeToAllowanceMonths(fid, child.id, setMonths) : undefined), [fid, child.id]);
  useEffect(() => (fid ? subscribeToMatches(fid, child.id, setMatches) : undefined), [fid, child.id]);
  useEffect(() => (fid ? subscribeToTable(fid, child.id, setTable) : undefined), [fid, child.id]);

  const allowance = child.allowance ?? 0;
  const next = nextAllowanceMonth(months);
  const nextAmount = effectiveAllowance(allowance, months[next]);
  const history = Object.entries(months).sort(([a], [b]) => b.localeCompare(a));
  const upcoming = matches.filter((m) => m.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const own = table.find((r) => r.isOwn);
  const hasFussball = upcoming.length > 0 || table.length > 0;

  const toggleMonth = (key: string, received: boolean, amount: number) =>
    run(setAllowanceReceived(fid, child.id, key, !received, amount));

  return (
    <>
      <View style={s.grid}>
        <View style={[s.tile, s.half]}>
          <Text style={s.label}>Strafpunkte</Text>
          <Text style={s.bigNum}>{pts}</Text>
          <View style={s.bar}><View style={[s.barFill, { width: `${Math.round(barPct * 100)}%`, backgroundColor: mono(child.color) }]} /></View>
          <Text style={s.muted}>{bis === null ? 'höchste Stufe erreicht' : `noch ${bis} bis Strafaufgabe`}</Text>
        </View>

        {allowance > 0 ? (
          <Pressable onPress={() => setOpen('geld')} style={[s.tile, s.half]} accessibilityLabel="Taschengeld-Verlauf öffnen">
            <View style={s.rowBetween}><Text style={s.label}>Taschengeld</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted} /></View>
            <Text style={s.h2}>{formatMonthLabel(next).split(' ')[0]}</Text>
            <Text style={s.muted}>{formatEuro(nextAmount)} · {months[next]?.received ? 'übergeben' : 'noch nicht übergeben'}</Text>
            {!months[next]?.received ? (
              <Pressable onPress={() => toggleMonth(next, false, nextAmount)} style={s.okBtnSmall} accessibilityLabel={`Taschengeld ${formatMonthLabel(next)} übergeben`}>
                <Fill kind="ok" mono={mono} />
                <Text style={s.okBtnText}>Übergeben</Text>
              </Pressable>
            ) : null}
          </Pressable>
        ) : null}

        {hasFussball ? (
          <Pressable onPress={() => setOpen('fussball')} style={[s.tile, s.half]} accessibilityLabel="Fußball: Spiele und Tabelle öffnen">
            <View style={s.rowBetween}><Text style={s.label}>Nächstes Spiel</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted} /></View>
            {upcoming[0] ? (
              <>
                <Text style={s.h2}>{wochentag(upcoming[0].date)} {upcoming[0].time}</Text>
                <Text style={s.bold} numberOfLines={1}>{upcoming[0].isHome ? `vs. ${upcoming[0].away}` : `bei ${upcoming[0].home}`}</Text>
              </>
            ) : <Text style={s.muted}>Kein Spiel angesetzt</Text>}
            {own ? <Text style={s.muted}>Tabelle: Platz {own.rank}</Text> : null}
          </Pressable>
        ) : null}

        {child.refereeInfo ? (
          <Pressable onPress={() => Linking.openURL(REFEREE_COURSE_URL)} style={[s.tile, s.half]} accessibilityLabel="Schiedsrichter: Lehrgang und Termine öffnen">
            <View style={s.rowBetween}><Text style={s.label}>Schiedsrichter</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted} /></View>
            <View style={s.yellowCard} />
            <Text style={s.bold}>Lehrgang & Termine</Text>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={open !== null} transparent animationType="slide" onRequestClose={() => setOpen(null)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(null)} accessibilityLabel="Schließen" />
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.rowBetween}>
            <Text style={s.h2}>{open === 'geld' ? `Taschengeld · ${child.name}` : `Fußball · ${child.name}`}</Text>
            <Pressable onPress={() => setOpen(null)} style={s.closeBtn} accessibilityLabel="Schließen"><Ionicons name="close" size={20} color={colors.textMuted} /></Pressable>
          </View>
          {open === 'fussball' ? (
            <View style={s.segment}>
              {(['spiele', 'tabelle'] as const).map((k) => (
                <Pressable key={k} onPress={() => setFussballView(k)} style={s.segItem} accessibilityState={{ selected: fussballView === k }}>
                  {fussballView === k ? <Fill kind="sport" mono={mono} /> : null}
                  <Text style={[s.segText, fussballView === k && { color: '#FFFFFF' }]}>{k === 'spiele' ? 'Spiele' : 'Tabelle'}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <ScrollView style={{ maxHeight: 420 }}>
            {open === 'geld' ? (
              history.length === 0 ? <Text style={s.muted}>Noch keine Taschengeld-Einträge.</Text> : history.map(([key, m]) => {
                const amount = effectiveAllowance(allowance, m);
                return (
                  <View key={key} style={[s.rowCenter, s.divider, { paddingVertical: 6 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bold}>{formatMonthLabel(key)}</Text>
                      {m.received && m.confirmedAt ? <Text style={s.muted}>abgehakt am {fmtTs(m.confirmedAt)}</Text> : null}
                    </View>
                    <Text style={s.bold}>{formatEuro(amount)}</Text>
                    <Pressable onPress={() => toggleMonth(key, m.received, amount)} style={[s.chip, m.received && { borderColor: colors.success }]}
                      accessibilityLabel={`${formatMonthLabel(key)} ${m.received ? 'erhalten' : 'übergeben?'}`}>
                      <Text style={[s.chipText, { color: m.received ? colors.success : colors.textMuted }]}>{m.received ? 'erhalten' : 'übergeben?'}</Text>
                    </Pressable>
                  </View>
                );
              })
            ) : fussballView === 'spiele' ? (
              upcoming.length === 0 ? <Text style={s.muted}>Keine kommenden Spiele.</Text> : upcoming.map((m) => (
                <Pressable key={m.link ?? `${m.date}-${m.time}`} onPress={() => m.link && Linking.openURL(m.link)} style={[s.rowCenter, s.divider, { paddingVertical: 6 }]}>
                  <View style={{ width: 52, alignItems: 'center' }}>
                    <Text style={s.bold}>{wochentag(m.date)}</Text>
                    <Text style={s.muted}>{fmtDate(m.date)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.bold} numberOfLines={1}>{m.isHome ? `vs. ${m.away}` : `bei ${m.home}`}</Text>
                    <Text style={s.muted} numberOfLines={1}>{m.competition}</Text>
                  </View>
                  <Text style={s.bold}>{m.time}</Text>
                </Pressable>
              ))
            ) : (
              table.map((r) => (
                <View key={r.club} style={[s.rowCenter, s.divider, { paddingVertical: 4 }]}>
                  <Text style={[s.body, { width: 28 }, r.isOwn && s.ownRow]}>{r.rank}.</Text>
                  <Text style={[s.body, { flex: 1 }, r.isOwn && s.ownRow]} numberOfLines={1}>{r.club}</Text>
                  <Text style={[s.muted, { width: 44 }]}>{r.played} Sp.</Text>
                  <Text style={[s.bold, { width: 28, textAlign: 'right' }, r.isOwn && s.ownRow]}>{r.points}</Text>
                </View>
              ))
            )}
          </ScrollView>
          {open === 'fussball' ? <Text style={s.muted}>Spiel antippen öffnet es auf fussball.de.</Text> : null}
        </View>
      </Modal>
    </>
  );
}

// ── Aufgaben aus der Kinder-App ─────────────────────────────────────────────

interface AufgabenProps {
  fid: string;
  child: ChildConfig;
  tasks: ChildTask[];
  /** Alle Kinder-Aufgaben, um Gruppenaufgaben bei allen Teilnehmern zu löschen. */
  alleTasks: Record<string, ChildTask[]>;
  /** Strafaufgaben haben ihren eigenen Block und tauchen hier nicht auf. */
  hideIds: Set<string>;
  today: string;
  s: KPStyles;
  colors: ThemeColors;
  mono: (hex: string) => string;
}

const REPEATS: (RepeatInterval | null)[] = [null, 'daily', 'weekly', 'monthly'];
export const repeatLabel = (r: RepeatInterval | null) => (r ? REPEAT_LABELS[r] : 'nein');

/** Zeilen für die „Heute“-Karte der Kind-Seite (ohne eigenen Rahmen). */
export function KindAufgaben({ fid, child, tasks, alleTasks, hideIds, today, s, colors, mono }: AufgabenProps) {
  const [edit, setEdit] = useState<{ task: ChildTask; title: string; repeat: RepeatInterval | null } | null>(null);
  const [verlauf, setVerlauf] = useState<ActivityEntry[] | 'laden' | null>(null);
  const liste = tasks.filter((t) => !hideIds.has(t.id));

  const openVerlauf = () => {
    setVerlauf('laden');
    getActivityLog(fid, child.id).then(setVerlauf).catch((e) => { setVerlauf(null); info('Fehler', e?.message ?? 'Verlauf konnte nicht geladen werden.'); });
  };

  const saveEdit = () => {
    if (!edit) return;
    const title = edit.title.trim();
    if (!title) { setEdit(null); return; }
    run(updateTask(fid, child.id, edit.task.id, { title, repeat: edit.repeat }, { actor: 'parent', title }));
    setEdit(null);
  };

  const remove = (t: ChildTask) => {
    confirmAction(t.groupId ? 'Gruppenaufgabe bei allen Kindern löschen?' : `„${t.title}“ löschen?`, () => {
      // Gruppenaufgabe in einem Rutsch bei allen Teilnehmern löschen (wie TE-146 im alten Tab).
      const targets = t.groupId
        ? Object.entries(alleTasks).flatMap(([cid, ts]) => ts.filter((x) => x.groupId === t.groupId).map((x) => ({ cid, id: x.id })))
        : [{ cid: child.id, id: t.id }];
      run(Promise.all(targets.map((x) => deleteTask(fid, x.cid, x.id, { actor: 'parent', title: t.title }))));
      setEdit(null);
    });
  };

  return (
    <>
      {liste.map((t) => {
        const zuPruefen = t.done && t.seenByParent === false;
        const sub = [
          t.repeat ? REPEAT_LABELS[t.repeat] : 'einmalig',
          t.groupId ? 'Gruppe' : null,
          !t.done && t.date < today ? `seit ${fmtDate(t.date)}` : null,
        ].filter(Boolean).join(' · ');
        return (
          <Pressable key={t.id} onLongPress={() => setEdit({ task: t, title: t.title, repeat: t.repeat ?? null })} delayLongPress={400}
            style={[s.divider, { gap: 8 }]} accessibilityHint="Lange drücken zum Bearbeiten oder Löschen">
            <View style={s.rowCenter}>
              <View style={{ flex: 1 }}>
                <Text style={[s.bold, t.done && !zuPruefen && s.doneText]}>{t.title}</Text>
                <Text style={[s.muted, t.rejected && s.alertText]}>{t.rejected ? 'abgelehnt – nochmal machen' : sub}</Text>
              </View>
              {zuPruefen ? <Text style={s.badgeYellow}>von {child.name} abgehakt</Text> : (
                <Pressable onPress={() => run(toggleTask(fid, child.id, t.id, !t.done, { actor: 'parent', title: t.title }))}
                  style={[s.markBtn, t.done ? s.markBtnOn : { borderWidth: 2, borderColor: colors.border }]}
                  accessibilityLabel={`${t.title} ${t.done ? 'wieder öffnen' : 'erledigt'}`} accessibilityState={{ checked: t.done }}>
                  {/* Offen = leeres Kästchen, erledigt = grün gefüllt mit Haken; erneut tippen holt zurück. */}
                  {t.done ? <><Fill kind="ok" mono={mono} /><Ionicons name="checkmark" size={22} color="#FFFFFF" /></> : null}
                </Pressable>
              )}
            </View>
            {zuPruefen ? (
              <View style={s.rowCenter}>
                <Pressable onPress={() => run(markChildTasksSeen(fid, child.id, [t.id]))} style={[s.okBtn, { flex: 1, alignItems: 'center' }]} accessibilityLabel={`${t.title} bestätigen`}>
                  <Fill kind="ok" mono={mono} />
                  <Text style={s.okBtnText}>Bestätigen</Text>
                </Pressable>
                <Pressable onPress={() => run(rejectTask(fid, child.id, t.id, { title: t.title }))} style={[s.outlineBtn, { flex: 1 }]} accessibilityLabel={`${t.title} ablehnen`}>
                  <Text style={s.bold}>Ablehnen</Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <View style={[s.rowBetween, s.divider]}>
        <Text style={s.muted}>{liste.length ? 'Kästchen = abhaken / zurückholen · lange drücken = bearbeiten' : 'Keine weiteren Aufgaben in der Kinder-App.'}</Text>
        <Pressable onPress={openVerlauf} hitSlop={8} accessibilityLabel={`Verlauf von ${child.name}`}><Text style={s.link}>Verlauf ›</Text></Pressable>
      </View>

      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={saveEdit}>
        <Pressable style={s.backdrop} onPress={saveEdit} accessibilityLabel="Speichern und schließen" />
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.h2}>Aufgabe bearbeiten</Text>
          <TextInput value={edit?.title ?? ''} onChangeText={(title) => edit && setEdit({ ...edit, title })} style={s.input}
            placeholderTextColor={colors.placeholder} onSubmitEditing={saveEdit} />
          <Text style={s.label}>Wiederholen</Text>
          <View style={s.segment}>
            {REPEATS.map((r) => (
              <Pressable key={r ?? 'none'} onPress={() => edit && setEdit({ ...edit, repeat: r })} style={s.segItem} accessibilityState={{ selected: edit?.repeat === r }}>
                {edit?.repeat === r ? <Fill kind="primary" mono={mono} /> : null}
                <Text style={[s.segText, edit?.repeat === r && { color: '#FFFFFF' }]}>{repeatLabel(r)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.rowCenter}>
            <Pressable onPress={() => edit && remove(edit.task)} style={[s.outlineBtn, { flex: 1 }]} accessibilityLabel="Aufgabe löschen">
              <Text style={[s.bold, { color: colors.danger }]}>Löschen</Text>
            </Pressable>
            <Pressable onPress={saveEdit} style={[s.gradBtn, { flex: 2 }]} accessibilityLabel="Speichern">
              <Fill kind="primary" mono={mono} />
              <Text style={s.gradBtnText}>Speichern</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={verlauf !== null} transparent animationType="slide" onRequestClose={() => setVerlauf(null)}>
        <Pressable style={s.backdrop} onPress={() => setVerlauf(null)} accessibilityLabel="Schließen" />
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.rowBetween}>
            <Text style={s.h2}>Verlauf · {child.name}</Text>
            <Pressable onPress={() => setVerlauf(null)} style={s.closeBtn} accessibilityLabel="Schließen"><Ionicons name="close" size={20} color={colors.textMuted} /></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 460 }}>
            {verlauf === 'laden' ? <ActivityIndicator color={colors.textMuted} />
              : !verlauf || verlauf.length === 0 ? <Text style={s.muted}>Noch keine Einträge.</Text>
              : verlauf.map((v) => (
              <View key={v.id} style={[s.rowCenter, s.divider, { paddingVertical: 4 }]}>
                <Text style={[s.muted, { width: 92 }]}>{fmtTs(v.at)}</Text>
                <Text style={[s.body, { flex: 1 }]} numberOfLines={2}>{v.taskTitle || 'Aufgabe'}</Text>
                <Text style={s.muted}>{({ created: 'erstellt', completed: 'abgehakt', reopened: 'wieder offen', edited: 'bearbeitet', deleted: 'gelöscht' } as const)[v.action]}{v.actor === 'child' ? ` (${child.name})` : ''}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
