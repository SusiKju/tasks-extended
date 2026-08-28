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
} from '../services/fuerUns';

export function useFuerUns() {
  const familyId = useFamilyId();
  const { user } = useFirebaseAuth();
  const myUid = user?.uid ?? null;
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [items, setItems] = useState<FuerUnsItem[]>([]);
  const [deletedItems, setDeletedItems] = useState<FuerUnsItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
      setLoaded(false);
      return;
    }
    return subscribeToFuerUns(
      familyId,
      (active, deleted) => { setLoadError(false); setItems(active); setDeletedItems(deleted); setLoaded(true); },
      () => { setLoadError(true); setItems([]); setDeletedItems([]); setLoaded(true); }
    );
  }, [familyId]);

  const myName = members.find((m) => m.uid === myUid)?.displayName ?? null;
  const unread = myUid ? unreadFromPartner(items, myUid) : [];

  return {
    familyId,
    myUid,
    myName,
    items,
    deletedItems,
    loadError,
    loaded,
    unreadIds: unread.map((i) => i.id),
    unreadCount: unread.length,
    sentToday: myUid ? sentTodayByMe(items, myUid) : true,
  };
}
