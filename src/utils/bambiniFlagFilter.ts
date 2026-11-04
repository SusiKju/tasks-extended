/**
 * Dreistufiger Filter für Kinder-Flags (Schnupper, Wackelkandidat) im Bambini-Tab.
 * 'alle' = Flag egal, 'nur' = nur Kinder mit Flag, 'ohne' = nur Kinder ohne Flag.
 */
export type FlagFilterMode = 'alle' | 'nur' | 'ohne';

/** Reihenfolge beim Antippen der Filterkachel: alle → nur → ohne → alle. */
export function nextFlagFilterMode(mode: FlagFilterMode): FlagFilterMode {
  return mode === 'alle' ? 'nur' : mode === 'nur' ? 'ohne' : 'alle';
}

export function matchesFlagFilter(mode: FlagFilterMode, hasFlag: boolean): boolean {
  if (mode === 'nur') return hasFlag;
  if (mode === 'ohne') return !hasFlag;
  return true;
}

/** Defensiv aus Firestore lesen; unbekannte Werte → 'alle'. */
export function parseFlagFilterMode(raw: unknown): FlagFilterMode {
  return raw === 'nur' || raw === 'ohne' ? raw : 'alle';
}
