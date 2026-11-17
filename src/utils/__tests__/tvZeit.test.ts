import { describe, expect, it } from 'vitest';
import { DEFAULT_REGELN, KinderWoche, TV_SCHRITTE, tvProzent, tvRest, tvRestText, tvStatus, tvText } from '../kinderPlanLogic';

const kind = { id: 'k1', name: 'Testkind' };
const regeln = { ...DEFAULT_REGELN, tvMinuten: { k1: 30 } };
const woche = (...min: number[]): KinderWoche => ({
  punkte: {}, marks: {},
  tv: Object.fromEntries(min.map((m, i) => [`e${i}`, { childId: 'k1', min: m, at: '2026-11-17T10:00:00Z' }])),
});

describe('Fernsehzeit', () => {
  it('bietet einen 5-Minuten-Schritt an', () => {
    expect(TV_SCHRITTE).toContain(5);
  });

  it('erlaubt negative Restzeit', () => {
    expect(tvRest(regeln, woche(20, 20), kind)).toBe(-10);
    expect(tvRest(regeln, woche(5), kind)).toBe(25);
  });

  it('Status: ok, leer, überzogen', () => {
    expect(tvStatus(5)).toBe('ok');
    expect(tvStatus(0)).toBe('leer');
    expect(tvStatus(-5)).toBe('ueberzogen');
  });

  it('formatiert negative Werte mit Minus', () => {
    expect(tvRestText(-15)).toBe('−15 min');
    expect(tvRestText(-90)).toBe('−1½ h');
    expect(tvText(-5)).toBe('−5 min');
    expect(tvRestText(40)).toBe('40 min');
  });

  it('Balken zeigt die genommene Zeit, 0–100 %', () => {
    expect(tvProzent(30, 30)).toBe(0);
    expect(tvProzent(20, 30)).toBe(33);
    expect(tvProzent(15, 30)).toBe(50);
    expect(tvProzent(0, 30)).toBe(100);
    expect(tvProzent(-10, 30)).toBe(100);
    expect(tvProzent(40, 30)).toBe(0);
    expect(tvProzent(10, 0)).toBe(0);
  });
});
