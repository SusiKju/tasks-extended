/**
 * useFamily.ts
 *
 * Stellt die aktuelle familyId und FamilyMeta für die eingeloggte Familie bereit.
 * Wird app-weit als zentraler Kontext genutzt.
 *
 * Ablauf:
 * 1. Firebase Auth User ist bekannt (aus useFirebaseAuth)
 * 2. userFamilies/{uid} wird geladen → familyId
 * 3. families/{familyId}/meta wird geladen → FamilyMeta (Code etc.)
 */

import { useState, useEffect } from 'react';
import { useFirebaseAuth } from './useFirebaseAuth';
import {
  subscribeToUserFamily,
  getFamilyMeta,
  FamilyMeta,
  ChildConfig,
  subscribeToChildren,
} from '../services/family';

export interface FamilyState {
  familyId: string | null;
  meta: FamilyMeta | null;
  children: ChildConfig[];
  loading: boolean;
}

export function useFamily(): FamilyState {
  const { user, loading: authLoading } = useFirebaseAuth();
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [meta, setMeta] = useState<FamilyMeta | null>(null);
  const [children, setChildren] = useState<ChildConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Echtzeit-Listener auf userFamilies/{uid} – reagiert sofort auf Beitreten/Verlassen
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setFamilyId(null);
      setMeta(null);
      setChildren([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeToUserFamily(user.uid, async (id) => {
      setFamilyId(id);
      if (id) {
        const m = await getFamilyMeta(id);
        setMeta(m);
      } else {
        setMeta(null);
      }
      setLoading(false);
    });
    return unsub;
  }, [user, authLoading]);

  // Kinder-Listener sobald familyId bekannt
  useEffect(() => {
    if (!familyId) { setChildren([]); return; }
    const unsub = subscribeToChildren(familyId, setChildren);
    return unsub;
  }, [familyId]);

  return { familyId, meta, children, loading };
}

/**
 * Vereinfachter Hook der nur die familyId zurückgibt.
 * Gibt null zurück solange noch geladen wird (kein Throw mehr).
 */
export function useFamilyId(): string | null {
  const { familyId } = useFamily();
  return familyId;
}
