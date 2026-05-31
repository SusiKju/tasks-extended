import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Task, Group, AppSettings, Attachment, Note } from '../types';

interface TaskState {
  tasks: Task[];
  groups: Group[];
  notes: Note[];
  settings: AppSettings;
  deletedGoogleEventIds: string[];
  deletedDriveNoteFileIds: string[];

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
  clearDeletedDriveNoteFileIds: () => void;
  removeDeletedDriveNoteFileIds: (fileIds: string[]) => void;

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
  theme: 'light',
  googleCalendarEnabled: false,
  googleClientId: null,
  googleAccessToken: null,
  googleRefreshToken: null,
  googleCalendarId: null,
  googleCalendarName: null,
  autoGroupEnabled: true,
  autoGroupConfidenceThreshold: 0.4,
  googleNotesEnabled: false,
};

export const useStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: [],
      groups: DEFAULT_GROUPS,
      notes: [],
      settings: DEFAULT_SETTINGS,
      deletedGoogleEventIds: [],
      deletedDriveNoteFileIds: [],

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
        set((state) => {
          const note = state.notes.find((n) => n.id === id);
          return {
            notes: state.notes.filter((n) => n.id !== id),
            deletedDriveNoteFileIds: note?.driveFileId
              ? [...state.deletedDriveNoteFileIds, note.driveFileId]
              : state.deletedDriveNoteFileIds,
          };
        }),

      clearNotes: () => set({ notes: [] }),

      clearDeletedDriveNoteFileIds: () => set({ deletedDriveNoteFileIds: [] }),

      removeDeletedDriveNoteFileIds: (fileIds) =>
        set((state) => ({
          deletedDriveNoteFileIds: state.deletedDriveNoteFileIds.filter((id) => !fileIds.includes(id)),
        })),

      updateSettings: (updates) =>
        set((state) => ({ settings: { ...state.settings, ...updates } })),
    }),
    {
      name: 'tasks-extended-store',
      version: 9,
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
        return persistedState;
      },
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
