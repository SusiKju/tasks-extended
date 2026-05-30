import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Note, NoteChecklistItem, Group } from '../types';
import { saveImage } from './imageStore';

// Keep-Farbe → App-Farbe
const COLOR_MAP: Record<string, string> = {
  DEFAULT: '#F0C040',
  RED:     '#FF6B6B',
  PINK:    '#FF8FAB',
  PURPLE:  '#CE93D8',
  BLUE:    '#4FC3F7',
  TEAL:    '#4DB6AC',
  GREEN:   '#81C784',
  YELLOW:  '#FFF176',
  ORANGE:  '#FFB74D',
  GRAY:    '#B0BEC5',
  BROWN:   '#A1887F',
  WHITE:   '#F5F5F5',
};

function generateId(): string {
  return `keep-import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function usecToISO(usec?: number): string {
  if (!usec) return new Date().toISOString();
  return new Date(usec / 1000).toISOString();
}

// Labels → Gruppe zuordnen (nach Name, case-insensitive)
function resolveGroupId(labels: string[], groups: Group[]): string | null {
  for (const label of labels) {
    const match = groups.find(
      (g) => g.name.toLowerCase() === label.toLowerCase()
    );
    if (match) return match.id;
  }
  return null;
}

interface KeepJson {
  title?: string;
  textContent?: string;
  listContent?: Array<{ text: string; isChecked: boolean }>;
  color?: string;
  isPinned?: boolean;
  isTrashed?: boolean;
  isArchived?: boolean;
  labels?: Array<{ name: string }>;
  attachments?: Array<{ filePath: string; mimetype: string }>;
  userEditedTimestampUsec?: number;
  createdTimestampUsec?: number;
}

function parseKeepJson(data: KeepJson, groups: Group[]): Note | null {
  if (data.isTrashed) return null;

  const labels = (data.labels ?? []).map((l) => l.name);
  const checklist: NoteChecklistItem[] | undefined = data.listContent
    ? data.listContent.map((i) => ({ text: i.text, checked: i.isChecked }))
    : undefined;

  return {
    id: generateId(),
    title: data.title || undefined,
    content: data.textContent ?? (checklist ? checklist.map((i) => `${i.checked ? '☑' : '☐'} ${i.text}`).join('\n') : ''),
    checklist,
    color: COLOR_MAP[data.color ?? 'DEFAULT'] ?? COLOR_MAP.DEFAULT,
    pinned: data.isPinned ?? false,
    labels: labels.length > 0 ? labels : undefined,
    groupId: resolveGroupId(labels, groups),
    createdAt: usecToISO(data.createdTimestampUsec),
    updatedAt: usecToISO(data.userEditedTimestampUsec),
  };
}

// HTML-Parsing als Fallback (für Dateien ohne JSON-Pendant)
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#9746;|&#9744;/g, '').trim();
}

function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n').replace(/<[^>]+>/g, '')
  ).replace(/\n{3,}/g, '\n\n').trim();
}

function parseKeepHtml(html: string, groups: Group[]): Note | null {
  if (/class="[^"]*\btrashed\b[^"]*"/.test(html)) return null;

  let title: string | undefined;
  const headingMatch = html.match(/class="[^"]*\bheading\b[^"]*"[^>]*>([\s\S]*?)<\/\w+>/i);
  if (headingMatch) title = stripTags(headingMatch[1]) || undefined;
  if (!title) {
    const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleTag) title = decodeHtmlEntities(titleTag[1]) || undefined;
  }

  let checklist: NoteChecklistItem[] | undefined;
  const ulMatch = html.match(/<ul[^>]*class="[^"]*\bchecklist\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
  if (ulMatch) {
    const items: NoteChecklistItem[] = [];
    const liRegex = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = liRegex.exec(ulMatch[1])) !== null) {
      const checked = /class="[^"]*\bchecked\b[^"]*"/.test(m[1]);
      const text = stripTags(m[2]);
      if (text) items.push({ text, checked });
    }
    if (items.length > 0) checklist = items;
  }

  let content = '';
  const contentMatch = html.match(/class="[^"]*\bcontent\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (contentMatch) content = stripTags(contentMatch[1]);
  if (!content && !checklist) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      content = stripTags(bodyMatch[1]);
      if (title && content.startsWith(title)) content = content.slice(title.length).trim();
    }
  }

  if (!title && !content && !checklist) return null;

  // Labels aus HTML extrahieren
  const labels: string[] = [];
  const labelRegex = /class="[^"]*\blabel\b[^"]*"[^>]*>([\s\S]*?)<\/\w+>/gi;
  let lm;
  while ((lm = labelRegex.exec(html)) !== null) {
    const l = stripTags(lm[1]);
    if (l) labels.push(l);
  }

  // Farbe aus Note-Klasse extrahieren (z.B. class="note yellow")
  const noteClassMatch = html.match(/class="note\s+([^"]+)"/i);
  const colorClass = noteClassMatch?.[1]?.trim().toUpperCase() ?? 'DEFAULT';
  const color = COLOR_MAP[colorClass] ?? COLOR_MAP.DEFAULT;

  return {
    id: generateId(),
    title,
    content: content || (checklist ? checklist.map((i) => `${i.checked ? '☑' : '☐'} ${i.text}`).join('\n') : ''),
    checklist,
    color,
    pinned: /class="[^"]*\bpinned\b[^"]*"/.test(html),
    groupId: resolveGroupId(labels, groups),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
}

async function readFile(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    return fetch(uri).then((r) => r.text());
  }
  return FileSystem.readAsStringAsync(uri);
}

async function readImageAsBase64(uri: string, mimeType: string): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = await fetch(uri).then((r) => r.blob());
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:${mimeType};base64,${base64}`;
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic']);

function isImageFile(name: string): boolean {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return IMAGE_EXTENSIONS.has(ext);
}

export async function importKeepTakeout(
  existingNoteIds: Set<string>,
  groups: Group[],
  onNote: (note: Note) => void
): Promise<ImportResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/html', 'application/json', 'text/plain', 'image/*', '*/*'],
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled || result.assets.length === 0) return null;

  // Bild-Assets nach Name indexieren
  const imagesByName = new Map<string, { uri: string; mimeType: string }>();
  for (const asset of result.assets) {
    if (isImageFile(asset.name)) {
      imagesByName.set(asset.name, {
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
    }
  }

  // JSON-Dateien haben Vorrang – HTML mit gleichem Basisnamen überspringen
  const jsonBaseNames = new Set(
    result.assets
      .filter((a) => a.name.endsWith('.json'))
      .map((a) => a.name.replace(/\.json$/, ''))
  );

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const asset of result.assets) {
    try {
      if (isImageFile(asset.name)) { skipped++; continue; } // separat verarbeitet

      const isJson = asset.name.endsWith('.json');
      const isHtml = asset.name.endsWith('.html') || asset.name.endsWith('.htm');

      // HTML überspringen wenn JSON-Pendant vorhanden
      if (isHtml && jsonBaseNames.has(asset.name.replace(/\.html?$/, ''))) {
        skipped++;
        continue;
      }

      const raw = await readFile(asset.uri);
      let note: Note | null = null;

      if (isJson) {
        try {
          const data: KeepJson = JSON.parse(raw);
          note = parseKeepJson(data, groups);

          // Bilder aus Attachments in IndexedDB speichern
          if (note && data.attachments?.length) {
            const imageKeys: string[] = [];
            for (let i = 0; i < data.attachments.length; i++) {
              const att = data.attachments[i];
              const imgName = att.filePath?.split('/').pop() ?? att.filePath;
              const imgAsset = imgName ? imagesByName.get(imgName) : undefined;
              if (imgAsset) {
                try {
                  const dataUri = await readImageAsBase64(imgAsset.uri, imgAsset.mimeType);
                  const key = `${note.id}_${i}`;
                  await saveImage(key, dataUri);
                  imageKeys.push(key);
                } catch {
                  // Bild konnte nicht geladen werden – überspringen
                }
              }
            }
            if (imageKeys.length > 0) note.imageUris = imageKeys;
          }
        } catch {
          skipped++;
          continue;
        }
      } else if (isHtml) {
        note = parseKeepHtml(raw, groups);
      } else {
        skipped++;
        continue;
      }

      if (!note) { skipped++; continue; }

      onNote(note);
      imported++;
    } catch (e) {
      console.warn('[KeepImport] Fehler:', asset.name, e);
      errors++;
    }
  }

  return { imported, skipped, errors };
}
