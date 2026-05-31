import { Note } from '../types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'Tasks-Extended';

export const DRIVE_NOTES_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Folder-ID im Speicher cachen – nur einmal pro Session nachschlagen
let cachedFolderId: string | null = null;

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
  if (res.status === 403) throw new Error('DRIVE_FORBIDDEN');
  if (!res.ok) return null;

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
  const folder = await createRes.json();
  cachedFolderId = folder.id as string;
  return cachedFolderId;
}

export function clearDriveFolderCache() {
  cachedFolderId = null;
}

// Parallele Requests mit Concurrency-Limit (verhindert Rate-Limit-Fehler)
async function parallel<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = 8
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, Math.max(queue.length, 1)) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export interface DriveNoteFile {
  fileId: string;
  note: Note;
}

export async function listDriveNotes(accessToken: string): Promise<DriveNoteFile[]> {
  const folderId = await findOrCreateFolder(accessToken);
  if (!folderId) return [];

  // Alle Datei-IDs in einem Request holen
  const query = encodeURIComponent(
    `'${folderId}' in parents and mimeType='application/json' and trashed=false`
  );
  const res = await driveFetch(
    `/files?q=${query}&fields=files(id,name)&pageSize=1000`,
    accessToken
  );
  if (!res.ok) return [];
  const data = await res.json();
  const files: Array<{ id: string; name: string }> = data.files ?? [];

  // Inhalte parallel herunterladen (8 gleichzeitig)
  const results: DriveNoteFile[] = [];
  await parallel(files, async (file) => {
    const dlRes = await driveFetch(`/files/${file.id}?alt=media`, accessToken);
    if (!dlRes.ok) return;
    try {
      const note: Note = await dlRes.json();
      results.push({ fileId: file.id, note });
    } catch {
      // ungültige Datei überspringen
    }
  });

  return results;
}

export async function uploadDriveNote(
  accessToken: string,
  note: Note,
  existingFileId?: string
): Promise<string | null> {
  const content = JSON.stringify(note);

  if (existingFileId) {
    const res = await fetch(`${UPLOAD_API}/files/${existingFileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: content,
    });
    return res.ok ? existingFileId : null;
  }

  const folderId = await findOrCreateFolder(accessToken);
  if (!folderId) return null;

  const metadata = JSON.stringify({ name: `${note.id}.json`, parents: [folderId] });
  const boundary = 'tasks_notes_boundary';
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
  if (!res.ok) return null;
  const created = await res.json();
  return created.id as string;
}

export async function uploadDriveNotesBatch(
  accessToken: string,
  notes: Array<{ note: Note; existingFileId?: string }>,
  onUploaded: (noteId: string, fileId: string) => void
): Promise<void> {
  await parallel(notes, async ({ note, existingFileId }) => {
    const fileId = await uploadDriveNote(accessToken, note, existingFileId);
    if (fileId) onUploaded(note.id, fileId);
  });
}

export async function deleteDriveNote(
  accessToken: string,
  fileId: string
): Promise<boolean> {
  const res = await driveFetch(`/files/${fileId}`, accessToken, 'DELETE');
  return res.ok || res.status === 404;
}
