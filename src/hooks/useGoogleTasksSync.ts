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
    const googleTasks = await listGoogleTasksById(token, taskLists[0].id).catch(() => [] as any[]);

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

    // ── 4. Diagnose: bereits bestehende Duplikate sichtbar machen ───────────────
    // Nicht-destruktiv (kein Auto-Löschen) – nur Hinweis, falls zwei offene
    // Tasks mit gleichem Titel unterschiedliche googleEventId haben.
    const finalTasks = useStore.getState().tasks.filter((t) => !t.completed && t.googleEventId);
    const byTitle = new Map<string, typeof finalTasks>();
    for (const t of finalTasks) {
      const key = t.title.trim().toLowerCase();
      byTitle.set(key, [...(byTitle.get(key) ?? []), t]);
    }
    for (const [title, group] of byTitle) {
      const distinctGoogleIds = new Set(group.map((t) => t.googleEventId));
      if (distinctGoogleIds.size > 1) {
        console.warn(
          `[TaskSync] Mögliches Duplikat erkannt: "${title}" existiert ${distinctGoogleIds.size}× mit unterschiedlicher googleEventId`,
          group.map((t) => ({ id: t.id, googleEventId: t.googleEventId })),
        );
      }
    }

    return result;
  }, []);

  return { syncTasks };
}
