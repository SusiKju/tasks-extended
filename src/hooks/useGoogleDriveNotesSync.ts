import { useCallback } from 'react';
import { useStore } from '../store';
import { refreshGoogleToken } from '../services/googleCalendar';
import {
  listDriveNotes,
  uploadDriveNotesBatch,
  deleteDriveNote,
  downloadScratchpad,
  uploadScratchpad,
} from '../services/googleDriveNotes';
import { Note } from '../types';

export interface DriveNotesSyncResult {
  pulled: number;
  pushed: number;
  deleted: number;
  scopeError?: boolean;
}

// ── Scratchpad: eigenständige Sync-Logik ─────────────────────────────────────
// Läuft unabhängig von googleNotesEnabled — nur googleAccessToken wird benötigt.

async function runScratchpadSync(token: string): Promise<void> {
  const { scratchpad, scratchpadUpdatedAt } = useStore.getState();

  const drive = await downloadScratchpad(token);

  if (drive) {
    if (drive.updatedAt > scratchpadUpdatedAt) {
      // Drive ist neuer → lokal übernehmen (ohne setScratchpad, um updatedAt nicht zu überschreiben)
      useStore.setState({
        scratchpad: drive.text,
        scratchpadUpdatedAt: drive.updatedAt,
      });
    } else if (drive.updatedAt < scratchpadUpdatedAt) {
      // Lokal ist neuer → zu Drive hochladen
      await uploadScratchpad(token, scratchpad, scratchpadUpdatedAt);
    }
    // Gleicher Timestamp → kein Upload nötig
  } else if (scratchpad) {
    // Noch keine Datei in Drive → erstmals hochladen
    await uploadScratchpad(token, scratchpad, scratchpadUpdatedAt);
  }
}

async function getValidToken(): Promise<string | null> {
  const { settings, updateSettings } = useStore.getState();
  if (!settings.googleAccessToken) return null;

  let token = settings.googleAccessToken;
  if (settings.googleRefreshToken) {
    const refreshed = await refreshGoogleToken(settings.googleRefreshToken).catch(() => null);
    if (refreshed) {
      token = refreshed;
      updateSettings({ googleAccessToken: refreshed });
    }
  }
  return token;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGoogleDriveNotesSync() {

  // Scratchpad-only sync — wird vom Dashboard bei Mount aufgerufen
  const syncScratchpad = useCallback(async (): Promise<void> => {
    const token = await getValidToken();
    if (!token) return;
    await runScratchpadSync(token).catch(() => {});
  }, []);

  const syncDriveNotes = useCallback(async (overrideToken?: string): Promise<DriveNotesSyncResult | null> => {
    const {
      settings,
      notes,
      deletedDriveNoteFileIds,
      updateSettings,
      addNote,
      updateNote,
      removeDeletedDriveNoteFileIds,
    } = useStore.getState();

    if (!overrideToken && !settings.googleAccessToken) return null;

    let token = overrideToken ?? settings.googleAccessToken!;
    if (!overrideToken && settings.googleRefreshToken) {
      const refreshed = await refreshGoogleToken(settings.googleRefreshToken).catch(() => null);
      if (refreshed) {
        token = refreshed;
        updateSettings({ googleAccessToken: refreshed });
      }
    }

    // ── Scratchpad: immer zuerst, unabhängig vom Notes-Sync ──────────────────
    await runScratchpadSync(token).catch(() => {});

    // ── Notes-Sync: nur wenn aktiviert ───────────────────────────────────────
    if (!overrideToken && !settings.googleNotesEnabled) {
      return { pulled: 0, pushed: 0, deleted: 0 };
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

    const toUpload: Array<{ note: Note; existingFileId?: string }> = [];
    for (const note of notes) {
      const notInDrive = !driveNoteIdSet.has(note.id);
      if (notInDrive) {
        toUpload.push({ note });
      } else if (note.driveFileId && driveFileIdSet.has(note.driveFileId)) {
        const driveEntry = driveByFileId.get(note.driveFileId);
        if (driveEntry && note.updatedAt > driveEntry.note.updatedAt) {
          toUpload.push({ note, existingFileId: note.driveFileId });
        }
      }
    }

    await uploadDriveNotesBatch(token, toUpload, (noteId, fileId) => {
      updateNote(noteId, { driveFileId: fileId });
      pushed++;
    });

    return { pulled, pushed, deleted };
  }, []);

  return { syncDriveNotes, syncScratchpad };
}
