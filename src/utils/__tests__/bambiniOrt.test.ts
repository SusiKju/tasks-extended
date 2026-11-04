import { describe, expect, it } from 'vitest';
import { ortPasst, saisonOrt } from '../bambiniSeason';

describe('saisonOrt (TE-114)', () => {
  it('Oktober bis März ist Halle, April bis September draußen', () => {
    expect(saisonOrt(new Date(2026, 9, 1))).toBe('halle'); // 1. Oktober
    expect(saisonOrt(new Date(2027, 2, 31))).toBe('halle'); // 31. März
    expect(saisonOrt(new Date(2027, 3, 1))).toBe('draussen'); // 1. April
    expect(saisonOrt(new Date(2026, 8, 30))).toBe('draussen'); // 30. September
  });
});

describe('ortPasst (TE-114)', () => {
  it('Ideen ohne Ort oder mit „beides“ passen immer', () => {
    expect(ortPasst(undefined, 'halle')).toBe(true);
    expect(ortPasst('beides', 'draussen')).toBe(true);
  });
  it('filtert nach Ort, „alle“ zeigt alles', () => {
    expect(ortPasst('halle', 'halle')).toBe(true);
    expect(ortPasst('draussen', 'halle')).toBe(false);
    expect(ortPasst('halle', 'alle')).toBe(true);
  });
});
