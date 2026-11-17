/**
 * Gelesen-Status pro Benutzer (Noten, Klassenbuch).
 *
 * Früher lag der Status familienweit in einer Liste auf dem Kind-Dokument
 * (`gradesAckIds`, `journalAckKeys`) – hakte ein Elternteil ab, war es auch
 * beim anderen weg. Jetzt: Map `{ [uid]: string[] }` (`gradesAckByUser`,
 * `journalAckByUser`), jede Person entscheidet selbst.
 *
 * Die alte familienweite Liste zählt weiter für alle als gelesen, damit nach
 * dem Update nicht alle alten Einträge erneut als „neu“ auftauchen.
 */

export function ackListForUser(
  data: Record<string, unknown> | undefined,
  legacyField: string,
  perUserField: string,
  uid: string | null | undefined,
): string[] {
  const legacy = data?.[legacyField];
  const legacyList = Array.isArray(legacy) ? (legacy as string[]) : [];
  if (!uid) return legacyList;
  const byUser = data?.[perUserField] as Record<string, unknown> | undefined;
  const own = byUser?.[uid];
  const ownList = Array.isArray(own) ? (own as string[]) : [];
  return [...new Set([...legacyList, ...ownList])];
}
