const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export interface DriveFile {
  id: string;
  name: string;
  iconLink: string | null;
  webViewLink: string | null;
  mimeType: string;
}

interface DriveFilesListResponse {
  files?: Array<{
    id?: string;
    name?: string;
    iconLink?: string;
    webViewLink?: string;
    mimeType?: string;
  }>;
}

/**
 * Fetches the user's Google Drive files marked as starred (favorite) via the
 * Drive API. Metadata only (name/icon/link) – no file content is requested.
 *
 * Returns:
 *   - DriveFile[]  on success (possibly empty)
 *   - null         on auth failure (401/403) – caller should refresh the token
 *                   and retry once, mirroring the other Google sync services.
 */
export async function listStarredDriveFiles(accessToken: string): Promise<DriveFile[] | null> {
  const params = new URLSearchParams({
    q: 'starred = true and trashed = false',
    orderBy: 'modifiedTime desc',
    pageSize: '20',
    fields: 'files(id,name,iconLink,webViewLink,mimeType)',
  });

  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // 401 = Token abgelaufen → Caller refresht & retryt.
  // 403 = fehlender Scope (Neuanmeldung nötig) oder Drive API im GCP-Projekt
  // nicht aktiviert. Ein Refresh bringt keine neuen Scopes.
  if (res.status === 403) {
    const body = await res.text().catch(() => '');
    const scopeMissing = /scope/i.test(body);
    console.warn(
      `[GoogleDrive] 403 von Drive API. ${
        scopeMissing
          ? 'Fehlender drive.metadata.readonly-Scope → Google-Verbindung trennen und neu anmelden.'
          : 'Vermutlich Drive API im GCP-Projekt nicht aktiviert → in der Google Cloud Console aktivieren.'
      } Antwort: ${body.slice(0, 300)}`
    );
    return null;
  }
  if (res.status === 401) return null;
  if (!res.ok) return [];

  const data: DriveFilesListResponse = await res.json();

  return (data.files ?? [])
    .filter((f): f is Required<Pick<typeof f, 'id' | 'name'>> & typeof f => !!f.id && !!f.name)
    .map((f) => ({
      id: f.id,
      name: f.name,
      iconLink: f.iconLink ?? null,
      webViewLink: f.webViewLink ?? null,
      mimeType: f.mimeType ?? '',
    }));
}
