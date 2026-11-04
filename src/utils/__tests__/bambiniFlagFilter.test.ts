import { describe, expect, it } from 'vitest';
import { matchesFlagFilter, nextFlagFilterMode, parseFlagFilterMode } from '../bambiniFlagFilter';

describe('bambiniFlagFilter', () => {
  it('wechselt alle → nur → ohne → alle', () => {
    expect(nextFlagFilterMode('alle')).toBe('nur');
    expect(nextFlagFilterMode('nur')).toBe('ohne');
    expect(nextFlagFilterMode('ohne')).toBe('alle');
  });

  it('filtert nach Flag', () => {
    expect(matchesFlagFilter('alle', true)).toBe(true);
    expect(matchesFlagFilter('alle', false)).toBe(true);
    expect(matchesFlagFilter('nur', true)).toBe(true);
    expect(matchesFlagFilter('nur', false)).toBe(false);
    expect(matchesFlagFilter('ohne', true)).toBe(false);
    expect(matchesFlagFilter('ohne', false)).toBe(true);
  });

  it('liest unbekannte Werte als alle', () => {
    expect(parseFlagFilterMode('nur')).toBe('nur');
    expect(parseFlagFilterMode('ohne')).toBe('ohne');
    expect(parseFlagFilterMode(true)).toBe('alle');
    expect(parseFlagFilterMode(undefined)).toBe('alle');
  });
});
