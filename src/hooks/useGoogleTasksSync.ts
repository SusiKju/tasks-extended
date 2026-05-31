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
  const syncTasks = useCallback(async (): Promise<SyncResult | null> => {
    // Always read from store directly so we get the latest state even when called
    // right after a delete (before the component re-renders and the closure updates).
    const {
      settings,
      tasks,
      updateSettings,
      addTask,
      updateTask,
      removeDeletedGoogleEventIds,
    } = useStore.getState();

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

    // Snapshot deleted IDs before async work — used for the re-import guard below.
    const deletedIds = useStore.getState().deletedGoogleEventIds;

    // Fetch task list ID once – used for both deletions and import below
    const taskLists = await listTaskLists(token);
    const firstTaskListId = taskLists[0]?.id ?? null;

    const successfullyDeleted: string[] = [];
    for (const deletedId of deletedIds) {
      // null = network error (retry), true = gone (200 or 404), false = other HTTP error (retry)
      let calResult: boolean | null = true; // default: not attempted = OK
      let taskResult: boolean | null = true;

      // Delete from Calendar (for tasks originally pushed there)
      if (settings.googleCalendarId) {
        calResult = await deleteCalendarEvent(token, settings.googleCalendarId, deletedId).catch(() => null);
      }
      // Delete from Google Tasks (for tasks imported from the Tasks API)
      if (firstTaskListId) {
        taskResult = await deleteGoogleTask(token, firstTaskListId, deletedId).catch(() => null);
      }

      // Only mark as handled when both APIs confirmed the task is gone (200 or 404).
      // A false/null from either side means an error occurred — keep the ID for retry.
      if (calResult && taskResult) {
        successfullyDeleted.push(deletedId);
      }
    }
    // Remove only the IDs that were confirmed deleted; IDs added during this sync
    // run (concurrent deletes) are preserved by filtering the live store state.
    if (successfullyDeleted.length > 0) {
      removeDeletedGoogleEventIds(successfullyDeleted);
    }

    const googleTasks = firstTaskListId
      ? await listGoogleTasks(token, firstTaskListId)
      : await listGoogleTasks(token);

    let imported = 0;
    let updated = 0;
    let pushed = 0;

    for (const gt of googleTasks) {
      if (!gt.title) continue;
      if (deletedIds.includes(gt.id)) continue;
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
  }, []);

  return { syncTasks };
}
