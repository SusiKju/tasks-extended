import { useStore } from '../store';
import { ThemeName } from '../types';

/** TE-62: Verlauf für einen wichtigen Button – Farbstopps + lesbare Schriftfarbe. */
export interface ButtonGradient { colors: readonly [string, string, ...string[]]; fg: string }
export type GradientKind = 'task' | 'idea' | 'blitz' | 'remind';

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
  /** TE-61: Dashboard-Kartenfläche/-rand (vorher fest CARD_EDGE) und gedimmter Rand (vorher SOFT_BORDER). */
  card: string;
  cardBorder: string;
  softBorder: string;
  /** TE-62: Verlaufs-Buttons; fehlt ein Eintrag, nutzt der Button den Standard-Look. */
  gradients?: Partial<Record<GradientKind, ButtonGradient>>;
}

// „Ruhig": Schwarz-Weiß, ohne Glow & Animationen. Reines Schwarz, weißer Text
// (21:1 Kontrast). Der einzige Farbeinsatz ist gezielt und sparsam: die dünnen
// 1px-Rahmen tragen einen dezenten, kühlen Blauton. Alle Akzente (accentNeon,
// Buttons, Auswahl) bleiben monochrom weiß – das hält das Theme flach und
// vermeidet, dass farbige Button-Flächen die schwarze accentFg-Schrift
// unlesbar machen oder die isMono-Heuristik (accentNeon === '#FFFFFF') bricht.
//
// CALM_BORDER ist #4A9EFF (kühles Blau, vom User gewählt) auf ~55% gedimmt –
// Hue/Sättigung bleiben erhalten, aber dunkel genug, um auf nahezu schwarzem
// Grund ruhig statt grell zu wirken. Opak, damit der Wert auch dort sauber
// rendert, wo `border` als Füllung dient (Divider, Switch-Tracks).
const CALM_BORDER = '#2A578C'; // = #4A9EFF * ~0.55, kühles Blau, dezent

// Redesign (Dashboard-Kompakt-Grid): echtes neutrales Grau statt eines auf
// Alpha gedimmten CALM_BORDER – ein blaues Blau bleibt auch bei geringer
// Deckkraft auf Schwarz sichtbar blau, kein neutrales Grau. Entspricht
// --app-border aus dem Redesign-Artefakt. Bewusst nicht als globaler
// colors.border-Ersatz gedacht (das würde app-weit den kühlen Blauton
// kippen), sondern gezielt dort importiert, wo das Redesign es vorsieht.
const SOFT_BORDER = '#242429';
// TE-55: Dashboard-Karten im Look des Sendepause-Banners (FuerUnsReminderBanner,
// SAD/SAD_BORDER): Schiefergrau-Fläche, dünner grauer Rand, Radius 12.
/** TE-61: Karten-Look als Style-Objekt, jetzt aus den Theme-Farben statt fest verdrahtet. */
export const cardEdge = (c: ThemeColors) => ({ backgroundColor: c.card, borderColor: c.cardBorder, borderRadius: 12 });
const RUHIG: ThemeColors = {
  background:    '#000000',   // reines Schwarz
  surface:       '#0A0A0A',
  surfaceHigh:   '#181818',
  text:          '#FFFFFF',   // reines Weiß
  textSecondary: '#B4B4B4',
  textMuted:     '#858585',   // WCAG: 4.81:1 auf surfaceHigh (war #6A6A6A → 3.3:1)
  accent:        '#FFFFFF',
  accentNeon:    '#FFFFFF',
  success:       '#DADADA',   // helles Grau
  warning:       '#A8A8A8',   // mittleres Grau
  danger:        '#FFFFFF',   // monochrom – Wichtig-Hinweis bleibt über C.important rot
  border:        CALM_BORDER,
  tabBar:        '#000000',
  tabBarBorder:  CALM_BORDER,
  header:        '#000000',
  inputBackground: '#181818',
  placeholder:   '#818181',   // WCAG: 4.56:1 auf inputBackground (war #555555 → 2.4:1)
  glowAccent:  'transparent',
  glowDanger:  'transparent',
  glowSuccess: 'transparent',
  accentFg: '#000000',
  dangerFg: '#000000',
  warningFg: '#000000',
  successFg: '#000000',
  card: '#23262e',
  cardBorder: '#4a4f5c',
  softBorder: SOFT_BORDER,
};

// TE-61 „Bento Dark": Apple-Dunkelmodus – reines Schwarz, Kacheln in
// iOS-Systemgrau, Systemblau als Akzent. Text-Kontraste ≥ 4.5:1 auf surfaceHigh.
const BENTO_NIGHT: ThemeColors = {
  background:    '#000000',
  surface:       '#1C1C1E',
  surfaceHigh:   '#2C2C2E',
  text:          '#F5F5F7',
  textSecondary: '#C7C7CC',
  textMuted:     '#A1A1A6',   // 5.4:1 auf #2C2C2E
  accent:        '#0A84FF',
  accentNeon:    '#0A84FF',
  success:       '#30D158',
  warning:       '#FFD60A',
  danger:        '#FF453A',
  border:        '#38383A',
  tabBar:        '#1C1C1E',
  tabBarBorder:  '#38383A',
  header:        '#000000',
  inputBackground: '#2C2C2E',
  placeholder:   '#9A9AA0',   // 5.0:1 auf #2C2C2E
  glowAccent:  'transparent',
  glowDanger:  'transparent',
  glowSuccess: 'transparent',
  accentFg: '#FFFFFF',   // 3.7:1 – wie iOS; reicht nur für fette/große Button-Schrift
  dangerFg: '#000000',
  warningFg: '#000000',
  successFg: '#000000',
  card: '#1C1C1E',
  cardBorder: '#2C2C2E',
  softBorder: '#2C2C2E',
  // TE-62: Farbe folgt der Bedeutung – Aufgabe blau, Idee gelb, Geistesblitz
  // grell (Orange→Pink→Violett), Erinnern im Violett→Pink vom Aurora-Entwurf.
  gradients: {
    // Farbabstand groß genug, dass der Verlauf auch auf schmalen Pills sichtbar ist.
    task:   { colors: ['#0A5CFF', '#00B8D9'], fg: '#FFFFFF' },   // Blau → Türkis
    idea:   { colors: ['#FFE600', '#FF7A00'], fg: '#1C1C1E' },   // Gelb → Orange
    blitz:  { colors: ['#FF6B00', '#FF0080', '#7928CA'], fg: '#FFFFFF' },
    remind: { colors: ['#7B2FF7', '#F72585'], fg: '#FFFFFF' },
  },
};

// TE-61 „Aurora": tiefes Nachtviolett, Akzente aus dem Nordlicht-Verlauf
// (Mint, Violett, Pink). Flächen bleiben deckend – RN-Screens setzen ihren
// Hintergrund selbst, ein App-weiter Verlauf würde überdeckt.
const AURORA: ThemeColors = {
  background:    '#120B26',
  surface:       '#1C1436',
  surfaceHigh:   '#2A2050',
  text:          '#FFFFFF',
  textSecondary: '#D4CCF0',
  textMuted:     '#A99FCB',   // 6.0:1 auf #2A2050
  accent:        '#B388FF',
  accentNeon:    '#00F5A0',
  success:       '#00E59A',
  warning:       '#F5C26B',
  danger:        '#FF6FA8',
  border:        '#3A2E66',
  tabBar:        '#140D2B',
  tabBarBorder:  '#3A2E66',
  header:        '#120B26',
  inputBackground: '#241B45',
  placeholder:   '#A39AC8',   // 6.1:1 auf #241B45
  glowAccent:  'rgba(123, 47, 247, 0.35)',
  glowDanger:  'rgba(247, 37, 133, 0.30)',
  glowSuccess: 'rgba(0, 245, 160, 0.30)',
  accentFg: '#120B26',
  dangerFg: '#120B26',
  warningFg: '#120B26',
  successFg: '#120B26',
  card: '#1E1640',
  cardBorder: '#3A2E66',
  softBorder: '#33295C',
};

export const THEMES: Record<ThemeName, { label: string; description: string; colors: ThemeColors }> = {
  'ruhig':       { label: 'Ruhig', description: 'Schwarz-Weiß, Inhaltsfarben als Graustufen', colors: RUHIG },
  'bento-night': { label: 'Bento Dark', description: 'Apple-Dunkelmodus mit Systemblau', colors: BENTO_NIGHT },
  'aurora':      { label: 'Aurora', description: 'Nachtviolett mit Nordlicht-Akzenten', colors: AURORA },
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

/** Ruhiges Theme glüht bewusst nicht – no-op, bleibt als Aufrufstelle stehen. */
export function neonGlow(_color: string, _intensity: 'soft' | 'medium' | 'hard' = 'medium') {
  return {};
}

/** Schlichter Rahmen ohne Glow. */
export function neonBorder(color: string) {
  return { borderColor: color + '55', borderWidth: 1 };
}

export function useTheme(): {
  colors: ThemeColors;
  isDark: boolean;
  isMono: boolean;
  /** Ambiente Animationen (Blink, Flammen-Glow, Sweep) sind grundsätzlich aus. */
  reduceMotion: boolean;
  /** Schwarz-Weiß-Theme wandelt Inhaltsfarben zu Graustufe. */
  mono: (hex: string) => string;
} {
  const name = useStore((s) => s.settings.theme);
  const resolved: ThemeName = THEMES[name] ? name : 'ruhig';
  // Nur „Ruhig" ist schwarz-weiß; die anderen Themes zeigen Inhaltsfarben echt.
  const isMono = resolved === 'ruhig';
  return {
    colors: THEMES[resolved].colors,
    isDark: true,
    isMono,
    reduceMotion: true,
    mono: isMono ? toGray : (hex: string) => hex,
  };
}
