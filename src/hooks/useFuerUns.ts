/**
 * useFuerUns.ts (TE-55)
 * Zentraler Zustand für "Für uns" – von Dashboard-Banner, Tab-Badge und
 * FuerUnsScreen gemeinsam genutzt, damit die Subscribe-/Ableitungslogik nicht
 * dreimal existiert.
 *
 * Identität (wer bin ich / wer ist der Partner) läuft über die echte
 * Firebase-uid + den Mitgliedsnamen aus der Family (subscribeToMembers) –
 * nicht mehr über ein frei eingegebenes "Wie heißt du"-Feld, das beide
 * Partner unabhängig setzen konnten und dadurch kollidieren durfte.
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFamilyId } from './useFamily';
import { useFirebaseAuth } from './useFirebaseAuth';
import { FamilyMember, subscribeToMembers } from '../services/family';
import {
  FuerUnsItem,
  subscribeToFuerUns,
  unreadFromPartner,
  sentTodayByMe,
  FuerUnsMood,
  subscribeToFuerUnsMoods,
  fuerUnsDisplayName,
  moodToday,
  activePause,
} from '../services/fuerUns';

/**
 * „Gesehen“-Stand für Änderungen des Partners (Barometer/Pause), geteilt über
 * alle Hook-Instanzen (Tab-Badge, Dashboard-Zeile, Tab), damit ein Antippen an
 * einer Stelle überall wirkt. Persistiert pro Gerät in AsyncStorage.
 */
let seenPartnerKey: string | null | undefined;
let seenLoadedFor: string | null = null;
const seenListeners = new Set<(v: string | null) => void>();
function publishSeen(v: string | null) {
  seenPartnerKey = v;
  seenListeners.forEach((l) => l(v));
}
const seenStorageKey = (uid: string) => `fuerUnsPartnerSeen:${uid}`;

export function useFuerUns() {
  const familyId = useFamilyId();
  const { user } = useFirebaseAuth();
  const myUid = user?.uid ?? null;
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [items, setItems] = useState<FuerUnsItem[]>([]);
  const [deletedItems, setDeletedItems] = useState<FuerUnsItem[]>([]);
  const [archivedItems, setArchivedItems] = useState<FuerUnsItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [moods, setMoods] = useState<FuerUnsMood[]>([]);
  const [seen, setSeen] = useState<string | null | undefined>(seenPartnerKey);

  useEffect(() => {
    seenListeners.add(setSeen);
    if (myUid && seenLoadedFor !== myUid) {
      seenLoadedFor = myUid;
      AsyncStorage.getItem(seenStorageKey(myUid)).then(publishSeen).catch(() => publishSeen(null));
    }
    return () => { seenListeners.delete(setSeen); };
  }, [myUid]);

  useEffect(() => {
    if (!familyId) {
      setMembers([]);
      return;
    }
    return subscribeToMembers(familyId, setMembers);
  }, [familyId]);

  useEffect(() => {
    if (!familyId) {
      setItems([]);
      setDeletedItems([]);
      setArchivedItems([]);
      setLoaded(false);
      return;
    }
    return subscribeToFuerUns(
      familyId,
      (active, deleted, archived) => { setLoadError(false); setItems(active); setDeletedItems(deleted); setArchivedItems(archived); setLoaded(true); },
      () => { setLoadError(true); setItems([]); setDeletedItems([]); setArchivedItems([]); setLoaded(true); }
    );
  }, [familyId]);

  // Lust-Barometer: Fehler (z. B. Rule noch nicht deployt) lässt es nur leer.
  useEffect(() => {
    if (!familyId) {
      setMoods([]);
      return;
    }
    return subscribeToFuerUnsMoods(familyId, setMoods, () => setMoods([]));
  }, [familyId]);

  const myName = members.find((m) => m.uid === myUid)?.displayName ?? null;
  const unread = myUid ? unreadFromPartner(items, myUid) : [];

  // Änderung des Partners = neuer Barometer-Stand oder Pause gestartet/beendet.
  const partnerDoc = moods.find((m) => m.uid !== myUid);
  const partnerKey = partnerDoc ? `${partnerDoc.updatedAt ?? ''}|${partnerDoc.pauseUntil ?? ''}` : null;
  const partnerChanged = !!partnerKey && seen !== undefined && seen !== partnerKey
    && (!!moodToday(partnerDoc) || !!activePause(partnerDoc));
  const markPartnerSeen = useCallback(() => {
    if (!myUid || !partnerKey) return;
    publishSeen(partnerKey);
    AsyncStorage.setItem(seenStorageKey(myUid), partnerKey).catch(() => {});
  }, [myUid, partnerKey]);

  return {
    familyId,
    myUid,
    myName,
    items,
    deletedItems,
    archivedItems,
    loadError,
    loaded,
    unreadCount: unread.length,
    /** Partner hat Barometer/Pause geändert und ich habe es noch nicht angesehen. */
    partnerChanged,
    markPartnerSeen,
    /** Zahl für den Tab-Badge: ungelesene Nachrichten + 1 für eine ungesehene Partner-Änderung. */
    badgeCount: unread.length + (partnerChanged ? 1 : 0),
    /** Eigener Anzeigename (Kosename, sonst Vorname) für den Paar-Kopf. */
    myDisplayName: fuerUnsDisplayName(myUid, myName),
    myMood: moodToday(moods.find((m) => m.uid === myUid)),
    partnerMood: moodToday(moods.find((m) => m.uid !== myUid)),
    myPause: activePause(moods.find((m) => m.uid === myUid)),
    partnerPause: activePause(moods.find((m) => m.uid !== myUid)),
    partnerLastSeenAt: moods.find((m) => m.uid !== myUid)?.lastSeenAt ?? null,
    partnerName: (() => {
      // Abgehakte Nachrichten zählen mit; ohne Nachrichten/Barometer bleibt das andere Elternteil.
      const partnerUid = [...items, ...archivedItems].find((i) => i.addedByUid && i.addedByUid !== myUid)?.addedByUid
        ?? moods.find((m) => m.uid !== myUid)?.uid
        ?? members.find((m) => m.uid !== myUid && m.role === 'parent')?.uid;
      return fuerUnsDisplayName(partnerUid, members.find((m) => m.uid === partnerUid)?.displayName);
    })(),
    // Abgehakte Nachrichten zählen mit – sonst taucht der Schreiben-Hinweis nach dem Abhaken wieder auf.
    sentToday: myUid ? sentTodayByMe([...items, ...archivedItems], myUid) : true,
  };
}
