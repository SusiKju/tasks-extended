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
}

export function useGoogleDriveNotesSync() {
  const {
    settings,
    notes,
    deletedDriveNoteFileIds,
    updateSettings,
    addNote,
    updateNote,
    clearDeletedDriveNoteFileIds,
  } = useStore();

  const syncDriveNotes = useCallback(async (): Promise<DriveNotesSyncResult | null> => {
    if (!settings.googleNotesEnabled || !settings.googleAccessToken) {
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

    let pulled = 0;
    let pushed = 0;
    let deleted = 0;

    // Delete notes that were removed locally
    for (const fileId of deletedDriveNoteFileIds) {
      await deleteDriveNote(token, fileId).catch(() => {});
      deleted++;
    }
    if (deletedDriveNoteFileIds.length > 0) {
      clearDeletedDriveNoteFileIds();
    }

    // Fetch all notes from Drive
    const driveFiles = await listDriveNotes(token);

    // Build lookup: noteId → local note
    const localById = new Map<string, Note>(notes.map((n) => [n.id, n]));
    // Build lookup: fileId → local note (for update path)
    const localByFileId = new Map<string, Note>(
      notes.filter((n) => n.driveFileId).map((n) => [n.driveFileId as string, n])
    );

    for (const { fileId, note: driveNote } of driveFiles) {
      const byId = localById.get(driveNote.id);
      const byFileId = localByFileId.get(fileId);
      const local = byId ?? byFileId;

      if (!local) {
        // Not on device — pull from Drive
        addNote({ ...driveNote, driveFileId: fileId });
        pulled++;
      } else if (driveNote.updatedAt > local.updatedAt) {
        // Drive version is newer — update local
        updateNote(local.id, { ...driveNote, driveFileId: fileId });
        pulled++;
      }
      // else: local is same age or newer — handled in push step below
    }

    // Re-read notes after potential pulls (use latest store snapshot via closure won't reflect
    // the addNote calls above, so we combine the original list with what we just pulled)
    const driveFileIdSet = new Set(driveFiles.map((f) => f.fileId));
    const driveNoteIdSet = new Set(driveFiles.map((f) => f.note.id));

    for (const note of notes) {
      if (!note.driveFileId && !driveNoteIdSet.has(note.id)) {
        // New local note — upload to Drive
        const fileId = await uploadDriveNote(token, note);
        if (fileId) {
          updateNote(note.id, { driveFileId: fileId });
          pushed++;
        }
      } else if (note.driveFileId && driveFileIdSet.has(note.driveFileId)) {
        // Existing Drive note — push if local is newer
        const driveEntry = driveFiles.find((f) => f.fileId === note.driveFileId);
        if (driveEntry && note.updatedAt > driveEntry.note.updatedAt) {
          await uploadDriveNote(token, note, note.driveFileId);
          pushed++;
        }
      }
    }

    return { pulled, pushed, deleted };
  }, [
    settings,
    notes,
    deletedDriveNoteFileIds,
    updateSettings,
    addNote,
    updateNote,
    clearDeletedDriveNoteFileIds,
  ]);

  return { syncDriveNotes };
}
