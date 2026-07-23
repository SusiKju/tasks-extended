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
export const SOFT_BORDER = '#242429';
const COLORS: ThemeColors = {
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
  return {
    colors: COLORS,
    isDark: true,
    isMono: true,
    reduceMotion: true,
    mono: toGray,
  };
}
