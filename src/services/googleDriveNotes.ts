import { Note } from '../types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'Tasks-Extended';

export const DRIVE_NOTES_SCOPE = 'https://www.googleapis.com/auth/drive.file';

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
      ? typeof body === 'string'
        ? body
        : JSON.stringify(body)
      : undefined,
  });
}

async function findOrCreateFolder(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await driveFetch(`/files?q=${query}&fields=files(id,name)`, accessToken);
  if (res.status === 403) {
    throw new Error('DRIVE_FORBIDDEN');
  }
  if (!res.ok) return null;
  const data = await res.json();

  if (data.files && data.files.length > 0) {
    return data.files[0].id as string;
  }

  const createRes = await driveFetch('/files', accessToken, 'POST', {
    name: FOLDER_NAME,
    mimeType: 'application/vnd.google-apps.folder',
  });
  if (!createRes.ok) return null;
  const folder = await createRes.json();
  return folder.id as string;
}

export interface DriveNoteFile {
  fileId: string;
  note: Note;
}

export async function listDriveNotes(accessToken: string): Promise<DriveNoteFile[]> {
  const folderId = await findOrCreateFolder(accessToken);
  if (!folderId) return [];

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

  const results: DriveNoteFile[] = [];
  for (const file of files) {
    const dlRes = await driveFetch(
      `/files/${file.id}?alt=media`,
      accessToken
    );
    if (!dlRes.ok) continue;
    try {
      const note: Note = await dlRes.json();
      results.push({ fileId: file.id, note });
    } catch {
      // skip malformed file
    }
  }
  return results;
}

export async function uploadDriveNote(
  accessToken: string,
  note: Note,
  existingFileId?: string
): Promise<string | null> {
  const folderId = await findOrCreateFolder(accessToken);
  if (!folderId) return null;

  const content = JSON.stringify(note);
  const filename = `${note.id}.json`;

  if (existingFileId) {
    const res = await fetch(
      `${UPLOAD_API}/files/${existingFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: content,
      }
    );
    return res.ok ? existingFileId : null;
  }

  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const boundary = 'drives_notes_boundary';
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.id as string;
}

export async function deleteDriveNote(
  accessToken: string,
  fileId: string
): Promise<boolean> {
  const res = await driveFetch(`/files/${fileId}`, accessToken, 'DELETE');
  return res.ok || res.status === 404;
}
