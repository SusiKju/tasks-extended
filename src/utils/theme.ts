import { useMemo } from 'react';
import { useStore } from '../store';
import { Theme } from '../types';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceHigh: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentNeon: string;
  success: string;
  warning: string;
  danger: string;
  border: string;
  tabBar: string;
  tabBarBorder: string;
  header: string;
  inputBackground: string;
  placeholder: string;
  glowAccent: string;
  glowDanger: string;
  glowSuccess: string;
}

const LIGHT: ThemeColors = {
  background: '#F0F0F5',
  surface: '#FFFFFF',
  surfaceHigh: '#F0F0F5',
  text: '#1C1C1E',
  textSecondary: '#8E8E93',
  textMuted: '#C7C7CC',
  accent: '#4F7EF5',
  accentNeon: '#4F7EF5',
  success: '#30B955',
  warning: '#F59500',
  danger: '#FF3B30',
  border: '#E0E0E8',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E0E0E8',
  header: '#F0F0F5',
  inputBackground: '#FFFFFF',
  placeholder: '#BBBBC4',
  glowAccent: 'transparent',
  glowDanger: 'transparent',
  glowSuccess: 'transparent',
};

const DARK_NEON: ThemeColors = {
  background:    '#02020A',   // tiefstes Schwarz-Blau
  surface:       '#07071A',   // klarer Kontrast zum BG
  surfaceHigh:   '#0E0E28',   // deutlich heller als surface
  text:          '#DCDCEE',   // gedämpftes kühles Weiß (weniger Blendung auf Schwarz)
  textSecondary: '#9090CC',   // lesbares Blau-Lila (war viel zu dunkel)
  textMuted:     '#383858',   // sichtbar, aber zurückgezogen
  accent:        '#2299FF',   // elektrisches Blau
  accentNeon:    '#00EEFF',   // volles Cyan-Neon
  success:       '#00FF88',   // Neon-Grün
  warning:       '#FFE600',   // elektrisches Gelb
  danger:        '#FF1177',   // Neon-Magenta-Pink
  border:        '#16163A',   // klare Trennlinie
  tabBar:        '#02020A',
  tabBarBorder:  '#16163A',
  header:        '#02020A',
  inputBackground: '#0E0E28',
  placeholder:   '#2A2A50',
  glowAccent:  'rgba(0, 238, 255, 0.65)',
  glowDanger:  'rgba(255, 17, 119, 0.65)',
  glowSuccess: 'rgba(0, 255, 136, 0.55)',
};

const DARK_SOFT: ThemeColors = {
  background: '#141414',
  surface: '#202020',
  surfaceHigh: '#2C2C2C',
  text: '#F5F5F5',
  textSecondary: '#B0B0B0',  // war #888 – deutlich heller
  textMuted: '#787878',      // war #505 – besser lesbar
  accent: '#5BA8FF',
  accentNeon: '#5BA8FF',
  success: '#4CC98A',
  warning: '#F5A623',
  danger: '#FF5F57',
  border: '#3A3A3A',         // war #2E2E – klarer sichtbar
  tabBar: '#141414',
  tabBarBorder: '#3A3A3A',
  header: '#141414',
  inputBackground: '#202020',
  placeholder: '#686868',
  glowAccent: 'transparent',
  glowDanger: 'transparent',
  glowSuccess: 'transparent',
};

export const THEMES: Record<Theme, ThemeColors> = {
  light: LIGHT,
  'dark-neon': DARK_NEON,
  'dark-soft': DARK_SOFT,
};

/** Relative Luminanz (WCAG) einer Hex-Farbe (#RGB / #RRGGBB), 0..1. */
function luminance(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Liefert eine auf `bg` gut lesbare Vordergrundfarbe – dunkel auf hellen
 * Hintergründen, hell auf dunklen. Ersetzt manuelle Farb-Allowlists, damit
 * Badges/Bubbles mit beliebigen Vollfarben (Cyan, Gelb, Magenta …) lesbar
 * bleiben.
 */
export function readableTextOn(
  bg: string,
  light = '#F2F2FF',
  dark = '#0A0A14',
): string {
  const lb = luminance(bg);
  return contrast(luminance(dark), lb) >= contrast(luminance(light), lb) ? dark : light;
}

export function neonGlow(color: string, intensity: 'soft' | 'medium' | 'hard' = 'medium') {
  const cfg = {
    soft:   { opacity: 0.55, radius: 12 },
    medium: { opacity: 0.80, radius: 20 },
    hard:   { opacity: 1.00, radius: 32 },
  }[intensity];
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: cfg.opacity,
    shadowRadius: cfg.radius,
    elevation: 12,
  };
}

/** Subtiler Neon-Rahmen für Cards im Neon-Theme */
export function neonBorder(color: string) {
  return {
    borderColor: color + '55',
    borderWidth: 1,
    ...neonGlow(color, 'soft'),
  };
}

export function useTheme(): { colors: ThemeColors; theme: Theme; isDark: boolean } {
  const theme = useStore((s) => s.settings.theme ?? 'light');
  const colors = useMemo(() => THEMES[theme] ?? LIGHT, [theme]);
  return { colors, theme, isDark: theme === 'dark-neon' || theme === 'dark-soft' };
}
