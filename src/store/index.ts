import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Task, Group, AppSettings, Attachment, Note, Birthday, Countdown } from '../types';

interface TaskState {
  _hydrated?: boolean;
  tasks: Task[];
  groups: Group[];
  notes: Note[];
  birthdays: Birthday[];
  countdowns: Countdown[];
  settings: AppSettings;
  scratchpad: string;
  scratchpadUpdatedAt: string;
  deletedGoogleEventIds: string[];

  // Task actions
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  deleteTasks: (ids: string[]) => void;
  toggleTask: (id: string) => void;
  clearDeletedGoogleEventIds: () => void;
  removeDeletedGoogleEventIds: (ids: string[]) => void;

  // Attachment actions
  addAttachment: (taskId: string, attachment: Attachment) => void;
  removeAttachment: (taskId: string, attachmentId: string) => void;

  // Group actions
  addGroup: (group: Group) => void;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => void;

  // Note actions
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  clearNotes: () => void;

  // Birthday actions
  setBirthdays: (birthdays: Birthday[]) => void;

  // Countdown actions (TE-128)
  addCountdown: (countdown: Countdown) => void;
  updateCountdown: (id: string, updates: Partial<Countdown>) => void;
  deleteCountdown: (id: string) => void;

  // Scratchpad
  setScratchpad: (text: string) => void;

  // Settings actions
  updateSettings: (updates: Partial<AppSettings>) => void;
}

const DEFAULT_GROUPS: Group[] = [
  {
    id: 'group-work',
    name: 'Arbeit',
    color: '#4F86F7',
    keywords: ['meeting', 'projekt', 'report', 'präsentation', 'deadline', 'client', 'kunde', 'arbeit', 'büro', 'team', 'review'],
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'group-personal',
    name: 'Persönlich',
    color: '#34C759',
    keywords: ['einkauf', 'arzt', 'sport', 'freunde', 'familie', 'urlaub', 'hobby', 'persönlich', 'privat'],
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'group-home',
    name: 'Haushalt',
    color: '#FF9500',
    keywords: ['putzen', 'kochen', 'wäsche', 'reparatur', 'haushalt', 'reinigung', 'garten', 'küche'],
    createdAt: '2024-01-01T00:00:00.000Z',
  },
];

const DEFAULT_SETTINGS: AppSettings = {
  dateFormat: 'de',
  theme: 'dark-mono',
  googleCalendarEnabled: false,
  googleClientId: null,
  googleAccessToken: null,
  googleRefreshToken: null,
  googleTokenExpiry: null,
  googleCalendarId: null,
  googleCalendarName: null,
  autoGroupEnabled: true,
  autoGroupConfidenceThreshold: 0.4,
  googleNotesEnabled: false,
  googleBirthdaysEnabled: false,
  selectedCalendarIds: [],
  childEmails: {},
  myName: null,
  funTileEnabled: false,
  funTileTheme: 'fussball',
};

export const useStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: [],
      groups: DEFAULT_GROUPS,
      notes: [],
      birthdays: [],
      countdowns: [],
      settings: DEFAULT_SETTINGS,
      scratchpad: '',
      scratchpadUpdatedAt: new Date(0).toISOString(),
      deletedGoogleEventIds: [],

      addTask: (task) =>
        set((state) => ({ tasks: [task, ...state.tasks] })),

      updateTask: (id, updates) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
          ),
        })),

      deleteTask: (id) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id);
          return {
            tasks: state.tasks.filter((t) => t.id !== id),
            deletedGoogleEventIds: task?.googleEventId
              ? [...state.deletedGoogleEventIds, task.googleEventId]
              : state.deletedGoogleEventIds,
          };
        }),

      deleteTasks: (ids) =>
        set((state) => {
          const googleEventIds = state.tasks
            .filter((t) => ids.includes(t.id) && t.googleEventId)
            .map((t) => t.googleEventId as string);
          return {
            tasks: state.tasks.filter((t) => !ids.includes(t.id)),
            deletedGoogleEventIds: [...state.deletedGoogleEventIds, ...googleEventIds],
          };
        }),

      clearDeletedGoogleEventIds: () =>
        set({ deletedGoogleEventIds: [] }),

      removeDeletedGoogleEventIds: (ids) =>
        set((state) => ({
          deletedGoogleEventIds: state.deletedGoogleEventIds.filter((id) => !ids.includes(id)),
        })),

      toggleTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, completed: !t.completed, updatedAt: new Date().toISOString() }
              : t
          ),
        })),

      addAttachment: (taskId, attachment) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? { ...t, attachments: [...(t.attachments ?? []), attachment], updatedAt: new Date().toISOString() }
              : t
          ),
        })),

      removeAttachment: (taskId, attachmentId) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  attachments: (t.attachments ?? []).filter((a) => a.id !== attachmentId),
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        })),

      addGroup: (group) =>
        set((state) => ({ groups: [...state.groups, group] })),

      updateGroup: (id, updates) =>
        set((state) => ({
          groups: state.groups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        })),

      deleteGroup: (id) =>
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== id),
          tasks: state.tasks.map((t) =>
            t.groupId === id ? { ...t, groupId: null, updatedAt: new Date().toISOString() } : t
          ),
        })),

      addNote: (note) =>
        set((state) => ({ notes: [note, ...state.notes] })),

      updateNote: (id, updates) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n
          ),
        })),

      deleteNote: (id) =>
        set((state) => ({ notes: state.notes.filter((n) => n.id !== id) })),

      clearNotes: () => set({ notes: [] }),

      setBirthdays: (birthdays) => set({ birthdays }),

      addCountdown: (countdown) =>
        set((state) => ({ countdowns: [...state.countdowns, countdown] })),

      updateCountdown: (id, updates) =>
        set((state) => ({
          countdowns: state.countdowns.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),

      deleteCountdown: (id) =>
        set((state) => ({ countdowns: state.countdowns.filter((c) => c.id !== id) })),

      setScratchpad: (text) => set({ scratchpad: text, scratchpadUpdatedAt: new Date().toISOString() }),

      updateSettings: (updates) =>
        set((state) => ({ settings: { ...state.settings, ...updates } })),
    }),
    {
      name: 'tasks-extended-store',
      version: 16,
      migrate: (persistedState: any, version: number) => {
        if (version < 1 && persistedState?.tasks) {
          persistedState.tasks = persistedState.tasks.map((t: any) => ({
            ...t,
            attachments: t.attachments ?? [],
          }));
        }
        if (version < 4) {
          persistedState.deletedGoogleEventIds = persistedState.deletedGoogleEventIds ?? [];
        }
        if (version < 7 && persistedState?.settings) {
          persistedState.settings.googleNotesEnabled =
            persistedState.settings.googleNotesEnabled ??
            persistedState.settings.googleKeepEnabled ??
            false;
          delete persistedState.settings.googleKeepEnabled;
          delete persistedState.settings.googleNotesDriveFileIds;
        }
        if (version < 8 && persistedState?.notes) {
          const colorMap: Record<string, string> = {
            '#FFE566': '#F0C040',
            '#A8E6A3': '#52B87A',
            '#FFB3BA': '#E8607A',
            '#AED9E0': '#4A94C8',
            '#C9B1FF': '#A878E0',
            '#FFD4A3': '#E87C3E',
          };
          persistedState.notes = persistedState.notes.map((n: any) => ({
            ...n,
            color: colorMap[n.color] ?? n.color,
          }));
        }
        if (version < 9) {
          persistedState.deletedDriveNoteFileIds = persistedState.deletedDriveNoteFileIds ?? [];
        }
        if (version < 10) {
          persistedState.scratchpad = persistedState.scratchpad ?? '';
          persistedState.scratchpadUpdatedAt = persistedState.scratchpadUpdatedAt ?? new Date(0).toISOString();
        }
        if (version < 11) {
          persistedState.birthdays = persistedState.birthdays ?? [];
          if (persistedState?.settings) {
            persistedState.settings.googleBirthdaysEnabled =
              persistedState.settings.googleBirthdaysEnabled ?? false;
          }
        }
        if (version < 12 && persistedState?.settings) {
          // Altes Web-Token kennt keine Ablaufzeit → als abgelaufen markieren,
          // damit der erste Sync sofort einen stillen GIS-Refresh auslöst.
          persistedState.settings.googleTokenExpiry =
            persistedState.settings.googleTokenExpiry ?? null;
        }
        if (version < 13 && persistedState?.settings) {
          // Anzeigename für die geteilte Notizliste (TE-121) – neu, Default leer.
          persistedState.settings.myName = persistedState.settings.myName ?? null;
        }
        if (version < 14) {
          // Countdown-Karten fürs Dashboard (TE-128) – neu, Default leer.
          persistedState.countdowns = persistedState.countdowns ?? [];
        }
        if (version < 15) {
          // Nur noch dark-mono – alle anderen Themes entfernt.
          persistedState.settings.theme = 'dark-mono';
          // Persönliche Notizen wandern zu Firestore – alten Store leeren.
          persistedState.notes = [];
          persistedState.deletedDriveNoteFileIds = [];
        }
        if (version < 16) {
          // TE-5: Google-Drive-Anbindung entfernt – Restfelder bereinigen.
          delete persistedState.deletedDriveNoteFileIds;
          if (Array.isArray(persistedState.notes)) {
            persistedState.notes = persistedState.notes.map((n: any) => {
              const { driveFileId: _drop, ...rest } = n;
              return rest;
            });
          }
        }
        return persistedState;
      },
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) state._hydrated = true;
      },
    }
  )
);
