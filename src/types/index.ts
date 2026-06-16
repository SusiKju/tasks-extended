export type DateFormat = 'iso' | 'de' | 'us' | 'relative';

export type Theme = 'dark-mono' | 'dark-calm';

export interface Attachment {
  id: string;
  taskId: string;
  type: 'image' | 'document';
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  color: string;
  keywords: string[];
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  groupId: string | null;
  dueDate: string | null;
  dueTime?: string | null;   // "HH:MM" format
  important?: boolean;
  completed: boolean;
  attachments: Attachment[];
  googleEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Birthday {
  id: string;            // People API resourceName, e.g. "people/c123"
  name: string;
  day: number;           // 1-31
  month: number;         // 1-12
  year: number | null;   // null when the contact hid the birth year
  photoUrl?: string | null;
  updatedAt: string;
}

/**
 * Countdown bis zu einem motivierenden Ereignis, z. B. "Gemeinsamer Urlaub"
 * (TE-128). Wird als filigrane, quadratische Karte auf dem Dashboard gezeigt.
 */
export interface Countdown {
  id: string;
  title: string;
  /** Zieldatum als ISO-Datum (YYYY-MM-DD), ohne Uhrzeit. */
  targetDate: string;
  /** Optionaler Sticker, z. B. ✈️ für Urlaub, 🎂 für Geburtstag. */
  emoji?: string | null;
  createdAt: string;
}

export interface AppSettings {
  dateFormat: DateFormat;
  theme: Theme;
  googleCalendarEnabled: boolean;
  googleClientId: string | null;
  googleAccessToken: string | null;
  googleRefreshToken: string | null;
  /** Unix-ms-Zeitpunkt, an dem das Access-Token abläuft (für stillen Refresh). */
  googleTokenExpiry: number | null;
  googleCalendarId: string | null;
  googleCalendarName: string | null;
  autoGroupEnabled: boolean;
  autoGroupConfidenceThreshold: number;
  googleNotesEnabled: boolean;
  googleBirthdaysEnabled: boolean;
  selectedCalendarIds: string[];
  childEmails: Partial<Record<string, string>>;
  /** Anzeigename für die geteilte Notizliste (TE-121), z. B. "Matthias" oder "Sabine". */
  myName: string | null;
  /**
   * TE-10/TE-14: aktive Themen der Fokus-Kachel (Mehrfachauswahl). Pro Thema
   * erscheint ein Icon in der Geistesblitze-Zeile. Leeres Array = keine Kachel.
   */
  funTileThemes: FunTileTheme[];
  /**
   * TE-37/TE-43: Zeitfenster für den Mail-Tab in Tagen. Mails älter als N Tage
   * werden ausgeblendet. Default 7. Angepinnte Mails (TE-38) ignorieren dieses
   * Fenster. Erlaubte Werte: siehe MAIL_WINDOW_OPTIONS.
   */
  mailWindowDays: number;
  /** TE-60: PIN zum Verlassen des Kinder-Modus. null = Fallback '1234'. */
  parentPin: string | null;
  /**
   * TE-77: Sichtbarkeit der einzelnen Dashboard-Blöcke. Pro Block-Key ein
   * Boolean; fehlt ein Key (alter Stand / neuer Block), gilt er als sichtbar.
   * Siehe DASHBOARD_BLOCKS für Reihenfolge und Labels.
   */
  dashboardBlocks: Record<DashboardBlockKey, boolean>;
}

/**
 * TE-77: Konfigurierbares Dashboard – jeder Inhaltsblock kann in den Settings
 * einzeln ein-/ausgeschaltet werden. Die Keys sind stabil (werden persistiert),
 * die Reihenfolge im Katalog entspricht der Render-Reihenfolge im Dashboard.
 */
export type DashboardBlockKey =
  | 'birthdays'
  | 'weather'
  | 'feed'
  | 'tasks'
  | 'scratchpad'
  | 'links'
  | 'geistesblitze'
  | 'countdowns'
  | 'calendar'
  | 'sharedList'
  | 'kidsTasks'
  | 'allowance'
  | 'mail';

export const DASHBOARD_BLOCKS: { key: DashboardBlockKey; label: string; description: string }[] = [
  { key: 'birthdays',     label: 'Geburtstage',         description: 'Heutige Geburtstage ganz oben.' },
  { key: 'weather',       label: 'Wetter',              description: 'Wettervorhersage neben dem Sync-Button.' },
  { key: 'feed',          label: 'Mein Tag',            description: 'Alle anstehenden Dinge als eine Liste, mit dezentem Icon je Kategorie.' },
  { key: 'tasks',         label: 'Heutige Tasks',       description: 'Überfällige und heute fällige Aufgaben.' },
  { key: 'scratchpad',    label: 'Notizblock',          description: 'Persönlicher Notizblock.' },
  { key: 'links',         label: 'Links',               description: 'Schnellleiste mit deinen Links.' },
  { key: 'geistesblitze', label: 'Geistesblitze',       description: 'Persönliche Gedanken-Kacheln.' },
  { key: 'countdowns',    label: 'Countdowns',          description: 'Countdowns bis zu Ereignissen.' },
  { key: 'calendar',      label: 'Termine',             description: 'Heutige Kalender-Termine.' },
  { key: 'sharedList',    label: 'Geteilte Liste',      description: 'Gemeinsame Notiz-/Einkaufsliste.' },
  { key: 'kidsTasks',     label: 'Aufgaben der Kinder', description: 'Heutige Aufgaben aller Kinder.' },
  { key: 'allowance',     label: 'Taschengeld',         description: 'Kinder, deren Taschengeld für den laufenden Monat noch offen ist.' },
  { key: 'mail',          label: 'Posteingang',         description: 'Angepinnte und ungelesene Mails.' },
];

/** TE-77: Default-Sichtbarkeit – alle Dashboard-Blöcke aktiv, außer 'feed' (neu, Opt-in). */
export const DEFAULT_DASHBOARD_BLOCKS: Record<DashboardBlockKey, boolean> =
  DASHBOARD_BLOCKS.reduce(
    (acc, b) => { acc[b.key] = b.key !== 'feed'; return acc; },
    {} as Record<DashboardBlockKey, boolean>
  );

/** TE-37/TE-43: Auswählbare Zeitfenster (in Tagen) für den Mail-Tab. */
export const MAIL_WINDOW_OPTIONS = [3, 7, 14, 30, 75] as const;

/** Themen der Fokus-Kachel (TE-10). */
export type FunTileTheme = 'fussball' | 'yoga' | 'garten';

export interface NoteChecklistItem {
  text: string;
  checked: boolean;
}

export interface Note {
  id: string;
  title?: string;
  content: string;
  checklist?: NoteChecklistItem[];
  color: string;
  groupId: string | null;
  pinned?: boolean;
  labels?: string[];
  imageUris?: string[];
  createdAt: string;
  updatedAt: string;
}

export type RootStackParamList = {
  '(tabs)': undefined;
  'task/[id]': { id: string };
  'task/new': undefined;
};
