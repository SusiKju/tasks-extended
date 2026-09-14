/**
 * useSchuleSyncStatus.ts
 * Winziger, bewusst nicht persistierter Store nur für den Fehlerstatus des
 * letzten beste.schule-Syncs. SchuleScreen meldet ihn, das Tab-Layout zeigt
 * ihn als Symbol am Schule-Tab an – auch wenn der Screen gerade nicht offen ist.
 */

import { create } from 'zustand';

interface SchuleSyncStatusState {
  hasError: boolean;
  setHasError: (hasError: boolean) => void;
}

export const useSchuleSyncStatus = create<SchuleSyncStatusState>((set) => ({
  hasError: false,
  setHasError: (hasError) => set({ hasError }),
}));
