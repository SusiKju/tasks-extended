import { Note } from '../types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'Tasks-Extended';
const NOTES_FILENAME = 'notes.json';

export const DRIVE_NOTES_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Cache: Folder-ID und Notes-File-ID pro Session
let cachedFolderId: string | null = null;
let cachedNotesFileId: string | null = null;

export function clearDriveFolderCache() {
  cachedFolderId = null;
  cachedNotesFileId = null;
}

async function driveFetch(
  path: string,
  accessToken: string,
  method: string = 'GET',
  body?: object | string,
  contentType: string = 'application/json'
): Promise<Response> {
  return fetch(path.startsWith('http') ? path : `${DRIVE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType,
    },
    body: body
      ? typeof body === 'string' ? body : JSON.stringify(body)
      : undefined,
  });
}

async function findOrCreateFolder(accessToken: string): Promise<string | null> {
  if (cachedFolderId) return cachedFolderId;

  const query = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await driveFetch(`/files?q=${query}&fields=files(id)`, accessToken);
  if (res.status === 401) throw new Error('DRIVE_UNAUTHORIZED');
  if (res.status === 403) throw new Error('DRIVE_FORBIDDEN');
  if (!res.ok) {
    console.error('[Drive] folder lookup failed:', res.status);
    return null;
  }

  const data = await res.json();
  if (data.files?.length > 0) {
    cachedFolderId = data.files[0].id as string;
    return cachedFolderId;
  }

  const createRes = await driveFetch('/files', accessToken, 'POST', {
    name: FOLDER_NAME,
    mimeType: 'application/vnd.google-apps.folder',
  });
  if (!createRes.ok) return null;
  cachedFolderId = (await createRes.json()).id as string;
  return cachedFolderId;
}

async function findNotesFile(accessToken: string, folderId: string): Promise<string | null> {
  if (cachedNotesFileId) return cachedNotesFileId;

  const query = encodeURIComponent(
    `name='${NOTES_FILENAME}' and '${folderId}' in parents and trashed=false`
  );
  const res = await driveFetch(`/files?q=${query}&fields=files(id)`, accessToken);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.files?.length > 0) {
    cachedNotesFileId = data.files[0].id as string;
    return cachedNotesFileId;
  }
  return null;
}

// ── Haupt-API: alle Notizen als eine Datei ────────────────────────────────────

export async function downloadAllNotes(accessToken: string): Promise<Note[] | null> {
  const folderId = await findOrCreateFolder(accessToken);
  if (!folderId) return null;

  const fileId = await findNotesFile(accessToken, folderId);
  if (!fileId) return [];  // noch keine Datei → leere Liste

  const res = await driveFetch(`/files/${fileId}?alt=media`, accessToken);
  if (!res.ok) return null;

  try {
    return (await res.json()) as Note[];
  } catch {
    return null;
  }
}

// imageUris sind gerätespezifisch (IndexedDB-Keys) – nicht auf Drive speichern
function stripDeviceData(note: Note): Note {
  const { imageUris: _, ...rest } = note as any;
  return rest as Note;
}

export async function uploadAllNotes(
  accessToken: string,
  notes: Note[]
): Promise<boolean> {
  const folderId = await findOrCreateFolder(accessToken);
  if (!folderId) return false;

  const content = JSON.stringify(notes.map(stripDeviceData));
  const existingFileId = await findNotesFile(accessToken, folderId);

  if (existingFileId) {
    const res = await fetch(`${UPLOAD_API}/files/${existingFileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: content,
    });
    if (!res.ok) console.error('[Drive] update failed:', res.status, await res.text().catch(() => ''));
    return res.ok;
  }

  // Neu erstellen
  const metadata = JSON.stringify({ name: NOTES_FILENAME, parents: [folderId] });
  const boundary = 'notes_boundary';
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${content}\r\n--${boundary}--`;

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    console.error('[Drive] create failed:', res.status, await res.text().catch(() => ''));
    return false;
  }
  cachedNotesFileId = (await res.json()).id as string;
  return true;
}

// Legacy-Kompatibilität – wird vom Hook noch verwendet
export interface DriveNoteFile { fileId: string; note: Note; }

export async function listDriveNotes(accessToken: string): Promise<DriveNoteFile[]> {
  const notes = await downloadAllNotes(accessToken);
  if (!notes) return [];
  return notes.map((note) => ({ fileId: note.id, note }));
}

export async function uploadDriveNote(
  accessToken: string,
  note: Note,
  _existingFileId?: string
): Promise<string | null> {
  // Einzelne Notiz: bestehende Liste laden, aktualisieren, zurückschreiben
  const folderId = await findOrCreateFolder(accessToken);
  if (!folderId) return null;

  const existing = await downloadAllNotes(accessToken) ?? [];
  const idx = existing.findIndex((n) => n.id === note.id);
  if (idx >= 0) existing[idx] = note;
  else existing.push(note);

  const ok = await uploadAllNotes(accessToken, existing);
  return ok ? note.id : null;
}

export async function uploadDriveNotesBatch(
  accessToken: string,
  notes: Array<{ note: Note; existingFileId?: string }>,
  onUploaded: (noteId: string, fileId: string) => void
): Promise<void> {
  if (notes.length === 0) return;

  const existing = await downloadAllNotes(accessToken) ?? [];
  const map = new Map(existing.map((n) => [n.id, n]));

  for (const { note } of notes) {
    map.set(note.id, note);
  }

  const merged = Array.from(map.values());
  const ok = await uploadAllNotes(accessToken, merged);
  if (ok) {
    for (const { note } of notes) {
      onUploaded(note.id, note.id);
    }
  }
}

export async function deleteDriveNote(
  accessToken: string,
  fileId: string
): Promise<boolean> {
  const existing = await downloadAllNotes(accessToken) ?? [];
  const filtered = existing.filter((n) => n.id !== fileId);
  if (filtered.length === existing.length) return true; // nicht gefunden = ok
  return uploadAllNotes(accessToken, filtered);
}
