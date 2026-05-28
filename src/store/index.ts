import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Task, Group, AppSettings, Attachment } from '../types';

interface TaskState {
  tasks: Task[];
  groups: Group[];
  settings: AppSettings;

  // Task actions
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;

  // Attachment actions
  addAttachment: (taskId: string, attachment: Attachment) => void;
  removeAttachment: (taskId: string, attachmentId: string) => void;

  // Group actions
  addGroup: (group: Group) => void;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => void;

  // Settings actions
  updateSettings: (updates: Partial<AppSettings>) => void;
}

const DEFAULT_GROUPS: Group[] = [
  {
    id: 'group-work',
    name: 'Arbeit',
    color: '#4F86F7',
    keywords: ['meeting', 'projekt', 'report', 'präsentation', 'deadline', 'client', 'kunde', 'arbeit', 'büro', 'team', 'review'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'group-personal',
    name: 'Persönlich',
    color: '#34C759',
    keywords: ['einkauf', 'arzt', 'sport', 'freunde', 'familie', 'urlaub', 'hobby', 'persönlich', 'privat'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'group-home',
    name: 'Haushalt',
    color: '#FF9500',
    keywords: ['putzen', 'kochen', 'wäsche', 'reparatur', 'haushalt', 'reinigung', 'garten', 'küche'],
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_SETTINGS: AppSettings = {
  dateFormat: 'de',
  googleCalendarEnabled: false,
  googleAccessToken: null,
  googleRefreshToken: null,
  googleCalendarId: null,
  autoGroupEnabled: true,
  autoGroupConfidenceThreshold: 0.4,
};

export const useStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: [],
      groups: DEFAULT_GROUPS,
      settings: DEFAULT_SETTINGS,

      addTask: (task) =>
        set((state) => ({ tasks: [task, ...state.tasks] })),

      updateTask: (id, updates) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
          ),
        })),

      deleteTask: (id) =>
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

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
              ? { ...t, attachments: [...t.attachments, attachment], updatedAt: new Date().toISOString() }
              : t
          ),
        })),

      removeAttachment: (taskId, attachmentId) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  attachments: t.attachments.filter((a) => a.id !== attachmentId),
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

      updateSettings: (updates) =>
        set((state) => ({ settings: { ...state.settings, ...updates } })),
    }),
    {
      name: 'tasks-extended-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
