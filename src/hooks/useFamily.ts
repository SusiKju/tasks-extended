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
  findFamilyForUser,
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

  // familyId laden sobald User bekannt ist
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
    findFamilyForUser(user.uid)
      .then(async (id) => {
        setFamilyId(id);
        if (id) {
          const m = await getFamilyMeta(id);
          setMeta(m);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
 * Wirft einen Fehler wenn keine Familie vorhanden (sollte durch Auth-Guard nie passieren).
 */
export function useFamilyId(): string {
  const { familyId } = useFamily();
  if (!familyId) throw new Error('useFamilyId: kein Familienkontext vorhanden');
  return familyId;
}
