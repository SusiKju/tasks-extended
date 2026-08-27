/**
 * useFuerUns.ts (TE-55)
 * Zentraler Zustand für "Für uns" – von Dashboard-Banner, Tab-Badge und
 * FuerUnsScreen gemeinsam genutzt, damit die Subscribe-/Ableitungslogik nicht
 * dreimal existiert.
 */

import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useFamilyId } from './useFamily';
import {
  FuerUnsItem,
  subscribeToFuerUns,
  unreadFromPartner,
  sentTodayByMe,
} from '../services/fuerUns';

export function useFuerUns() {
  const familyId = useFamilyId();
  const myName = useStore((s) => s.settings.myName?.trim() || null);
  const [items, setItems] = useState<FuerUnsItem[]>([]);
  const [deletedItems, setDeletedItems] = useState<FuerUnsItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);

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

  const unread = myName ? unreadFromPartner(items, myName) : [];

  return {
    familyId,
    myName,
    items,
    deletedItems,
    loadError,
    loaded,
    unreadIds: unread.map((i) => i.id),
    unreadCount: unread.length,
    sentToday: myName ? sentTodayByMe(items, myName) : true,
  };
}
