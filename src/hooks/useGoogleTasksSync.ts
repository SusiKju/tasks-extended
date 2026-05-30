import { useCallback } from 'react';
import { useStore } from '../store';
import {
  refreshGoogleToken,
  listGoogleTasks,
  listTaskLists,
  createCalendarEvent,
  deleteCalendarEvent,
  deleteGoogleTask,
} from '../services/googleCalendar';

export interface SyncResult {
  imported: number;
  updated: number;
  pushed: number;
}

export function useGoogleTasksSync() {
  const {
    settings,
    tasks,
    deletedGoogleEventIds,
    updateSettings,
    addTask,
    updateTask,
    clearDeletedGoogleEventIds,
  } = useStore();

  const syncTasks = useCallback(async (): Promise<SyncResult | null> => {
    if (!settings.googleCalendarEnabled || !settings.googleAccessToken || !settings.googleCalendarId) {
      return null;
    }

    let token = settings.googleAccessToken;
    if (settings.googleRefreshToken) {
      const refreshed = await refreshGoogleToken(settings.googleRefreshToken);
      if (refreshed) {
        token = refreshed;
        updateSettings({ googleAccessToken: refreshed });
      }
    }

    // Fetch task list ID once – used for both deletions and import below
    const taskLists = await listTaskLists(token);
    const firstTaskListId = taskLists[0]?.id ?? null;

    for (const deletedId of deletedGoogleEventIds) {
      // Delete from Calendar (for tasks originally pushed there)
      if (settings.googleCalendarId) {
        await deleteCalendarEvent(token, settings.googleCalendarId, deletedId).catch(() => {});
      }
      // Delete from Google Tasks (for tasks imported from the Tasks API)
      if (firstTaskListId) {
        await deleteGoogleTask(token, firstTaskListId, deletedId).catch(() => {});
      }
    }
    clearDeletedGoogleEventIds();

    const googleTasks = firstTaskListId
      ? await listGoogleTasks(token, firstTaskListId)
      : await listGoogleTasks(token);

    let imported = 0;
    let updated = 0;
    let pushed = 0;

    for (const gt of googleTasks) {
      if (!gt.title) continue;
      if (deletedGoogleEventIds.includes(gt.id)) continue;
      const exists = tasks.find((t) => t.googleEventId === gt.id);
      if (!exists) {
        const dueDate = gt.due ? new Date(gt.due).toISOString() : null;
        addTask({
          id: `gtask-${gt.id}`,
          title: gt.title,
          description: gt.notes ?? '',
          groupId: null,
          dueDate,
          completed: gt.status === 'completed',
          attachments: [],
          googleEventId: gt.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        imported++;
      } else {
        const googleCompleted = gt.status === 'completed';
        if (exists.completed !== googleCompleted) {
          updateTask(exists.id, { completed: googleCompleted });
          updated++;
        }
      }
    }

    const localOnly = tasks.filter((t) => !t.googleEventId && t.dueDate);
    for (const t of localOnly) {
      const eventId = await createCalendarEvent(t, token, settings.googleCalendarId!);
      if (eventId) {
        updateTask(t.id, { googleEventId: eventId });
        pushed++;
      }
    }

    return { imported, updated, pushed };
  }, [settings, tasks, deletedGoogleEventIds, updateSettings, addTask, updateTask, clearDeletedGoogleEventIds]);

  return { syncTasks };
}
