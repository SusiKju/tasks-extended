/**
 * useSchuleNotifications.ts
 * Tab-Badge für ungelesene beste.schule-Noten (Pendant zu useFuerUns).
 * Zählt über alle verknüpften Kinder die von unreadGradeIds gemeldeten,
 * noch nicht per ackGrades bestätigten Noten (siehe grades.ts).
 */

import { useEffect, useState } from 'react';
import { useFamily } from './useFamily';
import { useStore } from '../store';
import { GradesMap, subscribeToGrades, subscribeToGradesAck, unreadGradeIds } from '../services/grades';

export function useSchuleNotifications() {
  const { familyId, children } = useFamily();
  const studentIds = useStore((s) => s.settings.besteSchuleStudentIds ?? {});
  const linkedChildIds = children.map((c) => c.id).filter((id) => !!studentIds[id]).join(',');
  const [gradesByChild, setGradesByChild] = useState<Record<string, GradesMap>>({});
  const [ackByChild, setAckByChild] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const ids = linkedChildIds ? linkedChildIds.split(',') : [];
    if (!familyId || ids.length === 0) {
      setGradesByChild({});
      setAckByChild({});
      return;
    }
    const unsubs = ids.flatMap((childId) => [
      subscribeToGrades(familyId, childId, (map) =>
        setGradesByChild((prev) => ({ ...prev, [childId]: map })),
      ),
      subscribeToGradesAck(familyId, childId, (ackIds) =>
        setAckByChild((prev) => ({ ...prev, [childId]: ackIds })),
      ),
    ]);
    return () => unsubs.forEach((u) => u());
  }, [familyId, linkedChildIds]);

  const unreadCount = Object.entries(gradesByChild).reduce(
    (sum, [childId, map]) => sum + unreadGradeIds(map, ackByChild[childId] ?? []).length,
    0,
  );
  return { unreadCount };
}
