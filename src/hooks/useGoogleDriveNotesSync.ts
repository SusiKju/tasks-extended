import { useCallback } from 'react';
import { useStore } from '../store';
import { refreshGoogleToken } from '../services/googleCalendar';
import {
  listDriveNotes,
  uploadDriveNote,
  deleteDriveNote,
} from '../services/googleDriveNotes';
import { Note } from '../types';

export interface DriveNotesSyncResult {
  pulled: number;
  pushed: number;
  deleted: number;
  scopeError?: boolean;
}

export function useGoogleDriveNotesSync() {
  const syncDriveNotes = useCallback(async (overrideToken?: string): Promise<DriveNotesSyncResult | null> => {
    // Always read from store directly so we get the latest state even if called
    // right after updateSettings (before the component re-renders).
    const {
      settings,
      notes,
      deletedDriveNoteFileIds,
      updateSettings,
      addNote,
      updateNote,
      removeDeletedDriveNoteFileIds,
    } = useStore.getState();

    if (!overrideToken && (!settings.googleNotesEnabled || !settings.googleAccessToken)) {
      return null;
    }

    let token = overrideToken ?? settings.googleAccessToken!;
    if (!overrideToken && settings.googleRefreshToken) {
      const refreshed = await refreshGoogleToken(settings.googleRefreshToken);
      if (refreshed) {
        token = refreshed;
        updateSettings({ googleAccessToken: refreshed });
      }
    }

    let pulled = 0;
    let pushed = 0;
    let deleted = 0;

    const successfullyDeleted: string[] = [];
    for (const fileId of deletedDriveNoteFileIds) {
      const ok = await deleteDriveNote(token, fileId).then(() => true).catch(() => false);
      if (ok) {
        successfullyDeleted.push(fileId);
        deleted++;
      }
    }
    if (successfullyDeleted.length > 0) {
      removeDeletedDriveNoteFileIds(successfullyDeleted);
    }

    let driveFiles;
    try {
      driveFiles = await listDriveNotes(token);
    } catch (e: any) {
      if (e?.message === 'DRIVE_FORBIDDEN') {
        return { pulled: 0, pushed: 0, deleted, scopeError: true };
      }
      throw e;
    }

    const localById = new Map<string, Note>(notes.map((n) => [n.id, n]));
    const localByFileId = new Map<string, Note>(
      notes.filter((n) => n.driveFileId).map((n) => [n.driveFileId as string, n])
    );

    for (const { fileId, note: driveNote } of driveFiles) {
      const byId = localById.get(driveNote.id);
      const byFileId = localByFileId.get(fileId);
      const local = byId ?? byFileId;

      if (!local) {
        addNote({ ...driveNote, driveFileId: fileId });
        pulled++;
      } else if (driveNote.updatedAt > local.updatedAt) {
        updateNote(local.id, { ...driveNote, driveFileId: fileId });
        pulled++;
      }
    }

    const driveFileIdSet = new Set(driveFiles.map((f) => f.fileId));
    const driveNoteIdSet = new Set(driveFiles.map((f) => f.note.id));

    for (const note of notes) {
      if (!note.driveFileId && !driveNoteIdSet.has(note.id)) {
        const fileId = await uploadDriveNote(token, note);
        if (fileId) {
          updateNote(note.id, { driveFileId: fileId });
          pushed++;
        }
      } else if (note.driveFileId && driveFileIdSet.has(note.driveFileId)) {
        const driveEntry = driveFiles.find((f) => f.fileId === note.driveFileId);
        if (driveEntry && note.updatedAt > driveEntry.note.updatedAt) {
          await uploadDriveNote(token, note, note.driveFileId);
          pushed++;
        }
      }
    }

    return { pulled, pushed, deleted };
  }, []);

  return { syncDriveNotes };
}
