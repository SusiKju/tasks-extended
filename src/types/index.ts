export type DateFormat = 'iso' | 'de' | 'us' | 'relative';

export type Theme = 'light' | 'dark-neon' | 'dark-soft';

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
  completed: boolean;
  attachments: Attachment[];
  googleEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  dateFormat: DateFormat;
  theme: Theme;
  googleCalendarEnabled: boolean;
  googleClientId: string | null;
  googleAccessToken: string | null;
  googleRefreshToken: string | null;
  googleCalendarId: string | null;
  googleCalendarName: string | null;
  autoGroupEnabled: boolean;
  autoGroupConfidenceThreshold: number;
  googleNotesEnabled: boolean;
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
