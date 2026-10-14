import { useCallback } from 'react';
import { useStore } from '../store';
import {
  getValidAccessToken,
  listTaskLists,
  listGoogleTasksById,
} from '../services/googleCalendar';
import { localDateStr, fromGoogleDate } from '../utils/dateFormat';

export interface SyncResult {
  imported: number;
  updated: number;
}

/**
 * Google Tasks → App, nur lesend (TE-27). Die App schreibt nie zu Google
 * Tasks: früher hat Schritt „Local → Google“ bei jedem Refresh den lokalen
 * (alten) Stand per PATCH zurückgeschrieben und damit Änderungen, die in
 * Google gemacht wurden, überschrieben. Jetzt gewinnt immer Google.
 */
export function useGoogleTasksSync() {
  const syncTasks = useCallback(async (): Promise<SyncResult | null> => {
    // Always read from store directly — avoids stale closure values.
    const { settings, updateSettings, addTask, updateTask } = useStore.getState();

    if (!settings.googleCalendarEnabled || !settings.googleAccessToken) return null;

    // Proaktiv ein gültiges Token holen (Web: GIS still, nativ: Refresh-Token).
    let token = (await getValidAccessToken()) ?? settings.googleAccessToken;

    // ── 1. Get the first Google Tasks list ─────────────────────────────────────
    let taskLists = await listTaskLists(token).catch(() => [] as Array<{ id: string; title: string }>);
    if (taskLists.length === 0) {
      // Could be an expired token — force refresh and retry once
      const newToken = await getValidAccessToken(true);
      if (newToken && newToken !== token) {
        token = newToken;
        updateSettings({ googleAccessToken: newToken });
        taskLists = await listTaskLists(newToken).catch(() => []);
      }
    }
    if (taskLists.length === 0) return null;

    // ── 2. Fetch all Google Tasks ───────────────────────────────────────────────
    const googleTasks = await listGoogleTasksById(token, taskLists[0].id).catch(() => null);
    // Fehler ≠ leere Liste: ohne vollständige Antwort lokal nichts entfernen.
    if (!googleTasks) return null;

    const result: SyncResult = { imported: 0, updated: 0 };

    // ── 3. Google → Local (Google ist Quelle der Wahrheit) ─────────────────────
    // Lokal gelöschte Google-Tasks bleiben ausgeblendet (nur lokal, Google bleibt unberührt).
    const { tasks: localTasks, deletedGoogleEventIds } = useStore.getState();

    for (const gt of googleTasks) {
      if (!gt.title) continue;
      if (deletedGoogleEventIds.includes(gt.id)) continue;

      const remote = {
        title: gt.title as string,
        description: (gt.notes ?? '') as string,
        dueDate: gt.due ? fromGoogleDate(gt.due) : null,
        completed: gt.status === 'completed',
      };
      const local = localTasks.find((t) => t.googleEventId === gt.id);

      if (!local) {
        if (remote.completed) continue; // erledigte nicht erst importieren
        addTask({
          id: `gtask-${gt.id}`,
          ...remote,
          groupId: null,
          attachments: [],
          googleEventId: gt.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        result.imported++;
        continue;
      }

      const changes: Partial<typeof remote> = {};
      if (local.title !== remote.title) changes.title = remote.title;
      if ((local.description ?? '') !== remote.description) changes.description = remote.description;
      // Nach Kalendertag vergleichen, nicht als ISO-String (Uhrzeit/Timezone weichen ab).
      const localDue = local.dueDate ? localDateStr(local.dueDate) : null;
      const remoteDue = remote.dueDate ? localDateStr(remote.dueDate) : null;
      if (localDue !== remoteDue) changes.dueDate = remote.dueDate;
      if (local.completed !== remote.completed) changes.completed = remote.completed;
      if (Object.keys(changes).length > 0) {
        updateTask(local.id, changes);
        result.updated++;
      }
    }

    // ── 4. In Google gelöschte Tasks und Doppel-Einträge lokal entfernen ───────
    // Nur lokal (setState, nicht deleteTask → kein Eintrag in deletedGoogleEventIds).
    const remoteIds = new Set(googleTasks.map((gt) => gt.id as string));
    const seen = new Set<string>();
    useStore.setState((state) => ({
      tasks: state.tasks.filter((t) => {
        if (!t.googleEventId) return true;
        if (!remoteIds.has(t.googleEventId) || seen.has(t.googleEventId)) return false;
        seen.add(t.googleEventId);
        return true;
      }),
    }));

    return result;
  }, []);

  return { syncTasks };
}
