const KEEP_API = 'https://keep.googleapis.com/v1';

export const KEEP_SCOPE = 'https://www.googleapis.com/auth/keep';

interface KeepTextContent {
  text: string;
}

interface KeepListItem {
  text: KeepTextContent;
  checked: boolean;
  childListItems?: KeepListItem[];
}

interface KeepBody {
  text?: KeepTextContent;
  list?: { listItems: KeepListItem[] };
}

interface KeepAttachment {
  name: string;
  mimeType: string[];
}

export interface KeepNote {
  name: string;
  title?: string;
  body?: KeepBody;
  labels?: Array<{ name: string }>;
  attachments?: KeepAttachment[];
  trashed?: boolean;
  createTime: string;
  updateTime: string;
}

export interface KeepLabel {
  name: string;
  value: string;
}

async function keepFetch(
  path: string,
  accessToken: string,
  method: string = 'GET',
  body?: object
): Promise<Response> {
  return fetch(`${KEEP_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function listKeepLabels(accessToken: string): Promise<KeepLabel[]> {
  try {
    const res = await keepFetch('/labels', accessToken);
    if (!res.ok) {
      console.warn('[Keep] listLabels failed:', res.status);
      return [];
    }
    const data = await res.json();
    return (data.labels ?? []).map((l: any) => ({
      name: l.name as string,
      value: (l.value ?? '') as string,
    }));
  } catch (e) {
    console.error('[Keep] listLabels error:', e);
    return [];
  }
}

export async function listKeepNotes(accessToken: string): Promise<KeepNote[]> {
  const notes: KeepNote[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const params = new URLSearchParams({
        pageSize: '100',
        filter: 'NOT trashed=true',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await keepFetch(`/notes?${params}`, accessToken);
      if (!res.ok) {
        console.warn('[Keep] listNotes failed:', res.status, await res.text().catch(() => ''));
        break;
      }

      const data = await res.json();
      notes.push(...(data.notes ?? []));
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (e) {
    console.error('[Keep] listNotes error:', e);
  }

  return notes;
}

export async function createKeepNote(
  accessToken: string,
  title: string,
  content: string,
  labelNames: string[] = []
): Promise<string | null> {
  try {
    const payload: any = {
      body: { text: { text: content } },
    };
    if (title) payload.title = title;
    if (labelNames.length > 0) {
      payload.labels = labelNames.map((n) => ({ name: n }));
    }

    const res = await keepFetch('/notes', accessToken, 'POST', payload);
    if (!res.ok) {
      console.error('[Keep] createNote failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    return (data.name as string) ?? null;
  } catch (e) {
    console.error('[Keep] createNote error:', e);
    return null;
  }
}

export async function deleteKeepNote(accessToken: string, noteName: string): Promise<boolean> {
  try {
    const res = await keepFetch(`/${noteName}`, accessToken, 'DELETE');
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

export function keepNoteToContent(note: KeepNote): {
  content: string;
  checklist?: Array<{ text: string; checked: boolean }>;
  imageCount: number;
} {
  const imageCount = (note.attachments ?? []).filter((a) =>
    a.mimeType.some((m) => m.startsWith('image/'))
  ).length;

  if (note.body?.list) {
    const items = (note.body.list.listItems ?? []).map((item) => ({
      text: item.text.text,
      checked: item.checked,
    }));
    const content = items
      .map((i) => `${i.checked ? '☑' : '☐'} ${i.text}`)
      .join('\n');
    return { content, checklist: items, imageCount };
  }

  return {
    content: note.body?.text?.text ?? '',
    imageCount,
  };
}
