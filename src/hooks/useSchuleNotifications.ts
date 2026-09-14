/**
 * useSchuleNotifications.ts
 * Tab-Badge für ungelesene beste.schule-Noten (Pendant zu useFuerUns).
 * beste.schule liefert den Lese-Status pro Note bereits mit (`read`), der
 * Sync speichert ihn unverändert in `GradeEntry.raw` – kein eigenes
 * Read/Unread-Tracking nötig, die Zahl spiegelt einfach den Stand von
 * beste.schule selbst wider und verschwindet nach dem nächsten Sync, sobald
 * dort gelesen wurde.
 */

import { useEffect, useState } from 'react';
import { useFamily } from './useFamily';
import { useStore } from '../store';
import { GradesMap, subscribeToGrades } from '../services/grades';

function countUnread(map: GradesMap): number {
  let n = 0;
  for (const entries of Object.values(map)) {
    for (const entry of entries) {
      if ((entry.raw as { read?: boolean } | null)?.read === false) n++;
    }
  }
  return n;
}

export function useSchuleNotifications() {
  const { familyId, children } = useFamily();
  const studentIds = useStore((s) => s.settings.besteSchuleStudentIds ?? {});
  const linkedChildIds = children.map((c) => c.id).filter((id) => !!studentIds[id]).join(',');
  const [unreadByChild, setUnreadByChild] = useState<Record<string, number>>({});

  useEffect(() => {
    const ids = linkedChildIds ? linkedChildIds.split(',') : [];
    if (!familyId || ids.length === 0) {
      setUnreadByChild({});
      return;
    }
    const unsubs = ids.map((childId) =>
      subscribeToGrades(familyId, childId, (map) =>
        setUnreadByChild((prev) => ({ ...prev, [childId]: countUnread(map) })),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [familyId, linkedChildIds]);

  return { unreadCount: Object.values(unreadByChild).reduce((a, b) => a + b, 0) };
}
