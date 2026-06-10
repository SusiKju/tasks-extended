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
}

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
  driveFileId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RootStackParamList = {
  '(tabs)': undefined;
  'task/[id]': { id: string };
  'task/new': undefined;
};
