export type DateFormat = 'iso' | 'de' | 'us' | 'relative';

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
  googleCalendarEnabled: boolean;
  googleAccessToken: string | null;
  googleRefreshToken: string | null;
  googleCalendarId: string | null;
  autoGroupEnabled: boolean;
  autoGroupConfidenceThreshold: number;
}

export type RootStackParamList = {
  '(tabs)': undefined;
  'task/[id]': { id: string };
  'task/new': undefined;
};
