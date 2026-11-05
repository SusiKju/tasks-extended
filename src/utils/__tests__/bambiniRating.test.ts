import { describe, expect, it } from 'vitest';
import { RATING_COLORS, RATING_MAX, sanitizeRating, toggleRating } from '../bambiniRating';

describe('bambiniRating', () => {
  it('hat eine Farbe pro Stufe', () => {
    expect(RATING_COLORS).toHaveLength(RATING_MAX);
  });

  it('liest nur ganze Zahlen 1–5, sonst 0', () => {
    expect(sanitizeRating(3)).toBe(3);
    expect(sanitizeRating('4')).toBe(4);
    expect(sanitizeRating(2.7)).toBe(2);
    expect(sanitizeRating(0)).toBe(0);
    expect(sanitizeRating(6)).toBe(0);
    expect(sanitizeRating(-1)).toBe(0);
    expect(sanitizeRating(undefined)).toBe(0);
    expect(sanitizeRating('abc')).toBe(0);
  });

  it('setzt beim erneuten Antippen derselben Stufe zurück', () => {
    expect(toggleRating(0, 3)).toBe(3);
    expect(toggleRating(3, 5)).toBe(5);
    expect(toggleRating(3, 3)).toBe(0);
  });
});
