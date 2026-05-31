import { useCallback } from 'react';
import { useStore } from '../store';
import { refreshGoogleToken } from '../services/googleCalendar';
import {
  listDriveNotes,
  uploadDriveNotesBatch,
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
      console.log('[DriveSync] aborted: notesEnabled=', settings.googleNotesEnabled, 'hasToken=', !!settings.googleAccessToken);
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

    console.log('[DriveSync] start – localNotes:', notes.length, 'token:', token.slice(0, 20) + '…');
    let driveFiles;
    try {
      driveFiles = await listDriveNotes(token);
      console.log('[DriveSync] driveFiles fetched:', driveFiles.length);
    } catch (e: any) {
      if (e?.message === 'DRIVE_FORBIDDEN' || e?.message === 'DRIVE_UNAUTHORIZED') {
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
    const driveByFileId = new Map(driveFiles.map((f) => [f.fileId, f]));

    // Alle zu uploadenden Notizen sammeln und parallel hochladen
    const toUpload: Array<{ note: Note; existingFileId?: string }> = [];
    for (const note of notes) {
      const notInDrive = !driveNoteIdSet.has(note.id);
      if (notInDrive) {
        // Neu hochladen – egal ob driveFileId gesetzt ist oder nicht
        toUpload.push({ note });
      } else if (note.driveFileId && driveFileIdSet.has(note.driveFileId)) {
        const driveEntry = driveByFileId.get(note.driveFileId);
        if (driveEntry && note.updatedAt > driveEntry.note.updatedAt) {
          toUpload.push({ note, existingFileId: note.driveFileId });
        }
      }
    }

    console.log('[DriveSync] toUpload:', toUpload.length);
    await uploadDriveNotesBatch(token, toUpload, (noteId, fileId) => {
      updateNote(noteId, { driveFileId: fileId });
      pushed++;
    });
    console.log('[DriveSync] done – pulled:', pulled, 'pushed:', pushed, 'deleted:', deleted);

    return { pulled, pushed, deleted };
  }, []);

  return { syncDriveNotes };
}
