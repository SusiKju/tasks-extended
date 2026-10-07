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

import { useEffect, useState } from 'react';
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
} from '../services/fuerUns';

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
    myMood: moods.find((m) => m.uid === myUid) ?? null,
    partnerMood: moods.find((m) => m.uid !== myUid) ?? null,
    partnerName: (() => {
      const partnerUid = items.find((i) => i.addedByUid && i.addedByUid !== myUid)?.addedByUid
        ?? moods.find((m) => m.uid !== myUid)?.uid;
      return members.find((m) => m.uid === partnerUid)?.displayName ?? null;
    })(),
    // Abgehakte Nachrichten zählen mit – sonst taucht der Schreiben-Hinweis nach dem Abhaken wieder auf.
    sentToday: myUid ? sentTodayByMe([...items, ...archivedItems], myUid) : true,
  };
}
