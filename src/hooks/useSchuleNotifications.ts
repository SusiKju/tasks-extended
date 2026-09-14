/**
 * useSchuleNotifications.ts
 * Tab-Badge für ungelesene beste.schule-Noten + Klassenbuch-Einträge
 * (Pendant zu useFuerUns). Zählt über alle verknüpften Kinder, was
 * unreadGradeIds/unreadJournalKeys als noch nicht bestätigt melden.
 */

import { useEffect, useState } from 'react';
import { useFamily } from './useFamily';
import { useStore } from '../store';
import { GradesMap, subscribeToGrades, subscribeToGradesAck, unreadGradeIds } from '../services/grades';
import { JournalData, subscribeToJournal, subscribeToJournalAck, unreadJournalKeys } from '../services/journal';

export function useSchuleNotifications() {
  const { familyId, children } = useFamily();
  const studentIds = useStore((s) => s.settings.besteSchuleStudentIds ?? {});
  const linkedChildIds = children.map((c) => c.id).filter((id) => !!studentIds[id]).join(',');
  const [gradesByChild, setGradesByChild] = useState<Record<string, GradesMap>>({});
  const [gradesAckByChild, setGradesAckByChild] = useState<Record<string, string[]>>({});
  const [journalByChild, setJournalByChild] = useState<Record<string, JournalData>>({});
  const [journalAckByChild, setJournalAckByChild] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const ids = linkedChildIds ? linkedChildIds.split(',') : [];
    if (!familyId || ids.length === 0) {
      setGradesByChild({});
      setGradesAckByChild({});
      setJournalByChild({});
      setJournalAckByChild({});
      return;
    }
    const unsubs = ids.flatMap((childId) => [
      subscribeToGrades(familyId, childId, (map) =>
        setGradesByChild((prev) => ({ ...prev, [childId]: map })),
      ),
      subscribeToGradesAck(familyId, childId, (ackIds) =>
        setGradesAckByChild((prev) => ({ ...prev, [childId]: ackIds })),
      ),
      subscribeToJournal(familyId, childId, (data) =>
        setJournalByChild((prev) => ({ ...prev, [childId]: data })),
      ),
      subscribeToJournalAck(familyId, childId, (ackKeys) =>
        setJournalAckByChild((prev) => ({ ...prev, [childId]: ackKeys })),
      ),
    ]);
    return () => unsubs.forEach((u) => u());
  }, [familyId, linkedChildIds]);

  const gradesUnread = Object.entries(gradesByChild).reduce(
    (sum, [childId, map]) => sum + unreadGradeIds(map, gradesAckByChild[childId] ?? []).length,
    0,
  );
  const journalUnread = Object.entries(journalByChild).reduce(
    (sum, [childId, data]) => sum + unreadJournalKeys(data, journalAckByChild[childId] ?? []).length,
    0,
  );

  return { unreadCount: gradesUnread + journalUnread };
}
