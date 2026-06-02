import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Task } from '../types';
import { formatDate, localDateStr } from '../utils/dateFormat';
import { useStore } from '../store';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '934256455571-posu4ic37t03v4krthiph71pik127ljn.apps.googleusercontent.com';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/contacts.readonly',
];

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';

export interface CalendarAuthResult {
  accessToken: string;
  refreshToken: string | null;
  /** Token lifetime in seconds, used to compute googleTokenExpiry. */
  expiresIn: number;
}

interface TokenRefreshResult {
  accessToken: string;
  expiresIn: number;
}

// ── Google Identity Services (GIS) — Web token flow ──────────────────────────
// Der Browser bekommt by design nie ein Refresh-Token. GIS löst das über den
// Token-Client: er fordert kurzlebige (1 h) Access-Tokens an und kann sie mit
// prompt:'' still im Hintergrund erneuern, solange die Google-Session lebt.

let gisScriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.reject(new Error('GIS ist nur im Web verfügbar'));
  }
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisScriptPromise = null;
      reject(new Error('GIS-Script konnte nicht geladen werden'));
    };
    document.head.appendChild(script);
  });
  return gisScriptPromise;
}

let webTokenClient: any = null;

async function getWebTokenClient(): Promise<any> {
  await loadGisScript();
  const oauth2 = (window as any).google?.accounts?.oauth2;
  if (!oauth2) throw new Error('GIS oauth2 nicht verfügbar');
  if (!webTokenClient) {
    webTokenClient = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES.join(' '),
      callback: () => {}, // wird pro Anfrage gesetzt
    });
  }
  return webTokenClient;
}

/**
 * Fordert via GIS ein Access-Token an.
 * - prompt: 'consent' → expliziter Login (Popup, alle Scopes neu bestätigen).
 * - prompt: ''        → stiller Refresh ohne UI, sofern Session & Consent leben.
 */
async function requestWebToken(prompt: '' | 'consent'): Promise<TokenRefreshResult | null> {
  let client: any;
  try {
    client = await getWebTokenClient();
  } catch (e) {
    console.warn('[GoogleLogin] GIS nicht verfügbar:', e);
    return null;
  }

  return new Promise<TokenRefreshResult | null>((resolve) => {
    client.callback = (resp: any) => {
      if (resp?.error || !resp?.access_token) {
        resolve(null);
        return;
      }
      resolve({ accessToken: resp.access_token, expiresIn: Number(resp.expires_in) || 3600 });
    };
    client.error_callback = () => resolve(null);
    try {
      client.requestAccessToken({ prompt });
    } catch {
      resolve(null);
    }
  });
}

export async function signInWithGoogle(): Promise<CalendarAuthResult | null> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('EXPO_PUBLIC_GOOGLE_CLIENT_ID ist nicht konfiguriert. Siehe .env.example.');
  }

  // ── Web: GIS Token-Client (still erneuerbar, kein Refresh-Token nötig) ──────
  if (Platform.OS === 'web') {
    const res = await requestWebToken('consent');
    if (!res) {
      console.warn('[GoogleLogin] kein Web-Token erhalten');
      return null;
    }
    return { accessToken: res.accessToken, refreshToken: null, expiresIn: res.expiresIn };
  }

  // ── Native: PKCE code flow mit serverseitigem Exchange ──────────────────────
  try {
    const discovery = await AuthSession.fetchDiscoveryAsync('https://accounts.google.com');
    if (!discovery) {
      console.warn('[GoogleLogin] discovery null');
      return null;
    }

    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'tasksextended' });

    const request = new AuthSession.AuthRequest({
      clientId: GOOGLE_CLIENT_ID,
      scopes: SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      // Force consent so Google always issues a token with ALL requested scopes
      // and returns a refresh_token (access_type=offline).
      extraParams: { prompt: 'consent', access_type: 'offline' },
    });

    const result = await request.promptAsync(discovery);
    if (result.type !== 'success') return null;

    return await exchangeCodeForTokens(
      result.params.code,
      request.codeVerifier ?? '',
      redirectUri,
      GOOGLE_CLIENT_ID
    );
  } catch (e) {
    console.error('[GoogleLogin] signInWithGoogle error:', e);
    throw e;
  }
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string
): Promise<CalendarAuthResult | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });

    const data = await response.json();
    if (!data.access_token) return null;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresIn: Number(data.expires_in) || 3600,
    };
  } catch {
    return null;
  }
}

// Native-Refresh über das gespeicherte Refresh-Token.
async function refreshNativeToken(refreshToken: string): Promise<TokenRefreshResult | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID,
        grant_type: 'refresh_token',
      }).toString(),
    });

    const data = await response.json();
    if (!data.access_token) return null;
    return { accessToken: data.access_token, expiresIn: Number(data.expires_in) || 3600 };
  } catch {
    return null;
  }
}

/**
 * Zentrale Token-Beschaffung. Gibt ein gültiges Access-Token zurück und erneuert
 * es bei Bedarf transparent — im Web still via GIS, nativ via Refresh-Token.
 * Schreibt das frische Token + Ablaufzeit zurück in den Store.
 *
 * @param force  true erzwingt einen Refresh (z. B. nach einem 401).
 */
export async function getValidAccessToken(force = false): Promise<string | null> {
  const { settings, updateSettings } = useStore.getState();
  const current = settings.googleAccessToken;
  if (!current) return null;

  const expiry = settings.googleTokenExpiry ?? 0;
  // 5 min Puffer, damit das Token nicht mitten in einem Request abläuft.
  const needsRefresh = force || Date.now() > expiry - 5 * 60 * 1000;
  if (!needsRefresh) return current;

  let refreshed: TokenRefreshResult | null = null;
  if (Platform.OS === 'web') {
    refreshed = await requestWebToken('').catch(() => null);
  } else if (settings.googleRefreshToken) {
    refreshed = await refreshNativeToken(settings.googleRefreshToken).catch(() => null);
  }

  if (!refreshed) return current; // Refresh fehlgeschlagen → altes Token behalten
  updateSettings({
    googleAccessToken: refreshed.accessToken,
    googleTokenExpiry: Date.now() + refreshed.expiresIn * 1000,
  });
  return refreshed.accessToken;
}

async function calendarFetch(
  path: string,
  accessToken: string,
  method: string = 'GET',
  body?: object
): Promise<Response> {
  return fetch(`${CALENDAR_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Google Calendar colorId → hex (https://developers.google.com/calendar/api/v3/reference/colors)
const GOOGLE_COLOR_MAP: Record<string, string> = {
  '1':  '#7986CB', // Lavender
  '2':  '#33B679', // Sage
  '3':  '#8E24AA', // Grape
  '4':  '#E67C73', // Flamingo
  '5':  '#F6BF26', // Banana
  '6':  '#F4511E', // Tangerine
  '7':  '#039BE5', // Peacock
  '8':  '#616161', // Graphite
  '9':  '#3F51B5', // Blueberry
  '10': '#0B8043', // Basil
  '11': '#D50000', // Tomato
};

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;   // ISO datetime or date
  end: string;
  allDay: boolean;
  location?: string;
  calendarName?: string;
  color?: string;  // resolved hex color for this event
}

async function fetchEventsFromCalendar(
  accessToken: string,
  calendarId: string,
  calendarName: string,
  calendarColor: string | undefined,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    orderBy: 'startTime',
    singleEvents: 'true',
    maxResults: '50',
  });

  const res = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    accessToken
  );
  if (!res.ok) return [];
  const data = await res.json();

  return (data.items ?? []).map((e: any) => {
    // Priority: event-level backgroundColor > event colorId > calendar color > undefined
    const color =
      e.backgroundColor ??
      (e.colorId ? GOOGLE_COLOR_MAP[e.colorId] : undefined) ??
      calendarColor;

    return {
      id: `${calendarId}::${e.id}`,
      summary: e.summary ?? '(Kein Titel)',
      start: e.start?.dateTime ?? e.start?.date ?? '',
      end: e.end?.dateTime ?? e.end?.date ?? '',
      allDay: !!e.start?.date,
      location: e.location,
      calendarName,
      color,
    };
  });
}

export async function listUpcomingEvents(
  accessToken: string,
  selectedCalendarIds: string[],
  days = 2
): Promise<CalendarEvent[]> {
  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + days);
  until.setHours(23, 59, 59, 999);
  const timeMin = now.toISOString();
  const timeMax = until.toISOString();

  // Alle verfügbaren Kalender laden
  const allCalendars = await listCalendars(accessToken);
  if (allCalendars.length === 0) return [];

  // Nur ausgewählte – wenn keine Auswahl, alle nehmen
  const filtered = selectedCalendarIds.length > 0
    ? allCalendars.filter((c) => selectedCalendarIds.includes(c.id))
    : allCalendars;

  const results = await Promise.all(
    filtered.map((cal) =>
      fetchEventsFromCalendar(accessToken, cal.id, cal.summary, cal.backgroundColor, timeMin, timeMax)
    )
  );

  return results.flat().sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export async function listCalendars(accessToken: string): Promise<Array<{ id: string; summary: string; primary?: boolean; backgroundColor?: string }>> {
  const res = await calendarFetch('/users/me/calendarList', accessToken);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((c: any) => ({
    id: c.id,
    summary: c.summary,
    primary: c.primary,
    backgroundColor: c.backgroundColor ?? undefined,
  }));
}

export async function createCalendarEvent(
  task: Task,
  accessToken: string,
  calendarId: string
): Promise<string | null> {
  if (!task.dueDate) return null;

  const dateStr = localDateStr(task.dueDate);
  const event = {
    summary: task.title,
    description: task.description || undefined,
    start: { date: dateStr },
    end: { date: dateStr },
  };

  const res = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    accessToken,
    'POST',
    event
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.id ?? null;
}

export async function updateCalendarEvent(
  task: Task,
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<boolean> {
  if (!task.dueDate) return false;

  const dateStr = localDateStr(task.dueDate);
  const event = {
    summary: task.title,
    description: task.description || undefined,
    start: { date: dateStr },
    end: { date: dateStr },
  };

  const res = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    accessToken,
    'PUT',
    event
  );

  return res.ok;
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<boolean> {
  const res = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    accessToken,
    'DELETE'
  );
  return res.ok || res.status === 404;
}

async function tasksFetch(
  path: string,
  accessToken: string,
  method: string = 'GET',
  body?: object
): Promise<Response> {
  return fetch(`${TASKS_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function listTaskLists(accessToken: string): Promise<Array<{ id: string; title: string }>> {
  const res = await tasksFetch('/users/@me/lists', accessToken);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((l: { id: string; title: string }) => ({ id: l.id, title: l.title }));
}

export async function listGoogleTasks(accessToken: string, taskListId?: string): Promise<Array<any>> {
  // Ohne taskListId: erste Taskliste laden
  if (!taskListId) {
    const lists = await listTaskLists(accessToken);
    if (lists.length === 0) return [];
    taskListId = lists[0].id;
  }
  return listGoogleTasksById(accessToken, taskListId);
}

export async function listGoogleTasksById(accessToken: string, taskListId: string): Promise<Array<any>> {
  const res = await tasksFetch(
    `/lists/${encodeURIComponent(taskListId)}/tasks?showCompleted=true&maxResults=100`,
    accessToken
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
}

export async function createGoogleTask(
  accessToken: string,
  taskListId: string,
  title: string,
  notes?: string,
  due?: string
): Promise<string | null> {
  const body: any = { title };
  if (notes) body.notes = notes;
  if (due) body.due = due;

  const res = await tasksFetch(`/lists/${encodeURIComponent(taskListId)}/tasks`, accessToken, 'POST', body);
  if (!res.ok) return null;
  const data = await res.json();
  return data.id ?? null;
}

export async function updateGoogleTask(
  accessToken: string,
  taskListId: string,
  taskId: string,
  updates: { title?: string; notes?: string; due?: string; status?: 'needsAction' | 'completed' }
): Promise<boolean> {
  const res = await tasksFetch(
    `/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    accessToken,
    'PATCH',
    updates
  );
  return res.ok;
}

export async function deleteGoogleTask(
  accessToken: string,
  taskListId: string,
  taskId: string
): Promise<boolean> {
  const res = await tasksFetch(
    `/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    accessToken,
    'DELETE'
  );
  // 200/204 = gelöscht, 404 = nicht gefunden, 400 = ungültige ID, 410 = bereits gelöscht
  // Alle davon bedeuten: lokal aus der Warteschlange entfernen
  return res.ok || res.status === 404 || res.status === 400 || res.status === 410;
}
