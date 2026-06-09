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
  accentFg: string;
  dangerFg: string;
  warningFg: string;
  successFg: string;
}

// Schwarz-Weiß: Kopie des Neon-Themes (gleiche Glow-/Outline-Mechanik via isDark),
// aber alle Akzente monochrom. Statt farbiger Neons reines Weiß als „Neon" und
// abgestufte Graustufen für success/warning. Glow ist weiß.
const DARK_MONO: ThemeColors = {
  background:    '#000000',   // reines Schwarz
  surface:       '#0A0A0A',
  surfaceHigh:   '#181818',
  text:          '#FFFFFF',   // reines Weiß
  textSecondary: '#B4B4B4',
  textMuted:     '#858585',   // WCAG: 4.81:1 auf surfaceHigh (war #6A6A6A → 3.3:1)
  accent:        '#FFFFFF',
  accentNeon:    '#FFFFFF',   // weißer „Neon"-Akzent + Glow
  success:       '#DADADA',   // helles Grau
  warning:       '#A8A8A8',   // mittleres Grau
  danger:        '#FFFFFF',   // monochrom – Wichtig-Hinweis bleibt über C.important rot
  border:        '#2A2A2A',
  tabBar:        '#000000',
  tabBarBorder:  '#2A2A2A',
  header:        '#000000',
  inputBackground: '#181818',
  placeholder:   '#818181',   // WCAG: 4.56:1 auf inputBackground (war #555555 → 2.4:1)
  glowAccent:  'rgba(255, 255, 255, 0.55)',
  glowDanger:  'rgba(255, 255, 255, 0.45)',
  glowSuccess: 'rgba(255, 255, 255, 0.45)',
  accentFg: '#000000',
  dangerFg: '#000000',
  warningFg: '#000000',
  successFg: '#000000',
};

export const THEMES: Record<Theme, ThemeColors> = {
  'dark-mono': DARK_MONO,
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

/**
 * Wandelt eine beliebige Farbe in ihren Graustufen-Wert mit identischer
 * relativer Luminanz (WCAG). Damit bleiben unterschiedliche Inhaltsfarben
 * (Gruppen, Notizen) im Schwarz-Weiß-Theme als unterschiedlich helle Grautöne
 * unterscheidbar, ohne Farbe zu tragen.
 */
export function toGray(hex: string): string {
  const Y = luminance(hex);
  const s = Y <= 0.0031308 ? Y * 12.92 : 1.055 * Math.pow(Y, 1 / 2.4) - 0.055;
  const v = Math.max(0, Math.min(255, Math.round(s * 255)));
  const hh = v.toString(16).padStart(2, '0').toUpperCase();
  return `#${hh}${hh}${hh}`;
}

/**
 * Wie `toGray`, aber zusätzlich invertiert (255 - Wert) – das fotografische
 * Negativ eines Graustufenwerts. Damit bleiben Inhaltsfarben (Gruppen,
 * Notizen, Geburtstage) auch im Negativ-Theme `light-mono` unterscheidbar,
 * landen aber – passend zum hellen Hintergrund – auf der „richtigen" Seite
 * der Helligkeitsskala statt wie im dunklen Mono-Theme zu wirken.
 */
export function toGrayInverted(hex: string): string {
  const gray = toGray(hex).slice(1);
  const v = 255 - parseInt(gray.slice(0, 2), 16);
  const hh = v.toString(16).padStart(2, '0').toUpperCase();
  return `#${hh}${hh}${hh}`;
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

export function useTheme(): {
  colors: ThemeColors;
  theme: Theme;
  isDark: boolean;
  isMono: boolean;
  /** Wandelt Farbe zu Graustufe – dark-mono ist immer aktiv. */
  mono: (hex: string) => string;
} {
  // Nur noch dark-mono – für Re-render-Kompatibilität beibehalten.
  useStore((s) => s.settings.theme); // eslint-disable-line
  return {
    colors: DARK_MONO,
    theme: 'dark-mono',
    isDark: true,
    isMono: true,
    mono: toGray,
  };
}
