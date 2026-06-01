import { useCallback } from 'react';
import { useStore } from '../store';
import {
  refreshGoogleToken,
  listTaskLists,
  listGoogleTasksById,
  createGoogleTask,
  updateGoogleTask,
  deleteGoogleTask,
} from '../services/googleCalendar';
import { localDateStr, toGoogleDateISO, fromGoogleDate } from '../utils/dateFormat';

export interface SyncResult {
  imported: number;
  updated: number;
  pushed: number;
}

/**
 * Tries an async action with the current token. If it returns null/false (indicating
 * auth failure), refreshes the token once and retries. Returns the result of the
 * successful attempt, or null if both attempts fail.
 */
async function withTokenRefresh(
  token: string,
  refreshToken: string | null,
  onRefreshed: (newToken: string) => void,
  action: (t: string) => Promise<string | boolean | null>
): Promise<{ result: string | boolean | null; token: string }> {
  const result = await action(token).catch(() => null);
  if (result !== null && result !== false) return { result, token };

  // First attempt failed — try refreshing the token once
  if (!refreshToken) return { result: null, token };
  const newToken = await refreshGoogleToken(refreshToken).catch(() => null);
  if (!newToken) return { result: null, token };

  onRefreshed(newToken);
  const retried = await action(newToken).catch(() => null);
  return { result: retried, token: newToken };
}

export function useGoogleTasksSync() {
  const syncTasks = useCallback(async (): Promise<SyncResult | null> => {
    // Always read from store directly — avoids stale closure values.
    const {
      settings,
      tasks,
      updateSettings,
      addTask,
      updateTask,
      removeDeletedGoogleEventIds,
    } = useStore.getState();

    if (!settings.googleCalendarEnabled || !settings.googleAccessToken) return null;

    let token = settings.googleAccessToken;
    const onTokenRefreshed = (t: string) => {
      token = t;
      updateSettings({ googleAccessToken: t });
    };

    // ── 1. Get the first Google Tasks list ─────────────────────────────────────
    let taskLists = await listTaskLists(token).catch(() => [] as Array<{ id: string; title: string }>);
    if (taskLists.length === 0 && settings.googleRefreshToken) {
      // Could be an expired token — refresh and retry once
      const newToken = await refreshGoogleToken(settings.googleRefreshToken).catch(() => null);
      if (newToken) {
        onTokenRefreshed(newToken);
        taskLists = await listTaskLists(token).catch(() => []);
      }
    }
    if (taskLists.length === 0) return null;

    const taskListId = taskLists[0].id;

    // ── 2. Process pending deletions ───────────────────────────────────────────
    const deletedIds = useStore.getState().deletedGoogleEventIds;
    const successfullyDeleted: string[] = [];
    for (const googleId of deletedIds) {
      const { result } = await withTokenRefresh(
        token,
        settings.googleRefreshToken,
        onTokenRefreshed,
        (t) => deleteGoogleTask(t, taskListId, googleId)
      );
      if (result) successfullyDeleted.push(googleId);
    }
    if (successfullyDeleted.length > 0) {
      removeDeletedGoogleEventIds(successfullyDeleted);
    }

    // ── 3. Fetch all Google Tasks ───────────────────────────────────────────────
    const googleTasks = await listGoogleTasksById(token, taskListId).catch(() => [] as any[]);

    const result: SyncResult = { imported: 0, updated: 0, pushed: 0 };

    // Build a map for fast lookup: googleTaskId → googleTask
    const googleTaskMap = new Map<string, any>();
    for (const gt of googleTasks) {
      if (gt.id) googleTaskMap.set(gt.id, gt);
    }

    // ── 4. Google → Local ──────────────────────────────────────────────────────
    // Use fresh tasks snapshot for lookups
    const localTasksSnapshot = useStore.getState().tasks;

    for (const gt of googleTasks) {
      if (!gt.title) continue;
      if (deletedIds.includes(gt.id)) continue;

      const local = localTasksSnapshot.find((t) => t.googleEventId === gt.id);

      if (!local) {
        // New task from Google — import it
        addTask({
          id: `gtask-${gt.id}`,
          title: gt.title,
          description: gt.notes ?? '',
          groupId: null,
          dueDate: gt.due ? fromGoogleDate(gt.due) : null,
          completed: gt.status === 'completed',
          attachments: [],
          googleEventId: gt.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        result.imported++;
      } else {
        // Existing task — let Google be source of truth for completion status only.
        // Local wins for title/description/date (user edits locally → pushed in step 5).
        const googleCompleted = gt.status === 'completed';
        if (local.completed !== googleCompleted) {
          updateTask(local.id, { completed: googleCompleted });
          result.updated++;
        }
      }
    }

    // ── 5. Local → Google ──────────────────────────────────────────────────────
    // Re-read tasks so we see freshly imported ones (they already have googleEventId set).
    const freshTasks = useStore.getState().tasks;

    for (const local of freshTasks) {
      // Skip completed tasks — don't push them as new, they're done
      if (local.completed) continue;

      if (!local.googleEventId) {
        // New local task — push to Google Tasks
        const { result: newId } = await withTokenRefresh(
          token,
          settings.googleRefreshToken,
          onTokenRefreshed,
          (t) => createGoogleTask(
            t,
            taskListId,
            local.title,
            local.description || undefined,
            local.dueDate ? toGoogleDateISO(local.dueDate) : undefined
          )
        );
        if (typeof newId === 'string' && newId) {
          updateTask(local.id, { googleEventId: newId });
          result.pushed++;
        } else {
          console.warn('[TaskSync] createGoogleTask failed for:', local.title);
        }
      } else {
        // Existing Google Task — push local changes if title, description or date diverge
        const gt = googleTaskMap.get(local.googleEventId);
        if (!gt) continue; // Task not in Google list (deleted remotely, or wrong ID)

        const updates: Parameters<typeof updateGoogleTask>[3] = {};

        if (gt.title !== local.title) {
          updates.title = local.title;
        }
        if ((gt.notes ?? '') !== (local.description ?? '')) {
          updates.notes = local.description || '';
        }

        // Datum-Vergleich im lokalen Kontext — nicht als UTC-String (Timezone-Bug!)
        const gtDue   = gt.due        ? gt.due.split('T')[0]            : null;
        const localDue = local.dueDate ? localDateStr(local.dueDate)     : null;
        if (gtDue !== localDue) {
          updates.due = local.dueDate
            ? toGoogleDateISO(local.dueDate)   // Mitternacht UTC des lokalen Datums
            : undefined;
        }

        if (Object.keys(updates).length > 0) {
          await withTokenRefresh(
            token,
            settings.googleRefreshToken,
            onTokenRefreshed,
            (t) => updateGoogleTask(t, taskListId, local.googleEventId!, updates)
          ).catch(() => {});
        }
      }
    }

    return result;
  }, []);

  return { syncTasks };
}
