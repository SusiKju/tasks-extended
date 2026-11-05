import { describe, expect, it } from 'vitest';
import { formatWeckTime, isInWeckWindow, sanitizeWeckWindow, WECK_DEFAULT_END, WECK_DEFAULT_START } from '../weckmodusWindow';

const at = (iso: string) => new Date(iso); // lokale Zeit (ohne Z)

describe('weckmodusWindow', () => {
  it('nutzt 5:00–8:00 als Default und bei ungültigen Werten', () => {
    expect(sanitizeWeckWindow(undefined, undefined)).toEqual({ start: WECK_DEFAULT_START, end: WECK_DEFAULT_END });
    expect(sanitizeWeckWindow(480, 300)).toEqual({ start: 300, end: 480 });
    expect(sanitizeWeckWindow('x', 420)).toEqual({ start: 300, end: 420 });
  });

  it('rastet auf 30 Minuten ein', () => {
    expect(sanitizeWeckWindow(310, 455)).toEqual({ start: 300, end: 450 });
  });

  it('zeigt nur an Schultagen im Fenster', () => {
    // Do 05.11.2026, normaler Schultag
    expect(isInWeckWindow(at('2026-11-05T04:59:00'), 300, 480)).toBe(false);
    expect(isInWeckWindow(at('2026-11-05T05:00:00'), 300, 480)).toBe(true);
    expect(isInWeckWindow(at('2026-11-05T07:59:00'), 300, 480)).toBe(true);
    expect(isInWeckWindow(at('2026-11-05T08:00:00'), 300, 480)).toBe(false);
    // Sa 07.11.2026
    expect(isInWeckWindow(at('2026-11-07T06:00:00'), 300, 480)).toBe(false);
  });

  it('bleibt in sächsischen Ferien und an Feiertagen aus', () => {
    // Herbstferien Sachsen: Mi 14.10.2026
    expect(isInWeckWindow(at('2026-10-14T06:00:00'), 300, 480)).toBe(false);
    // Buß- und Bettag Sachsen: Mi 18.11.2026
    expect(isInWeckWindow(at('2026-11-18T06:00:00'), 300, 480)).toBe(false);
  });

  it('formatiert Uhrzeiten', () => {
    expect(formatWeckTime(300)).toBe('5:00');
    expect(formatWeckTime(450)).toBe('7:30');
  });
});
