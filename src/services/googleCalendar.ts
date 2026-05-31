import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Task } from '../types';
import { formatDate } from '../utils/dateFormat';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive.file',
];

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';

export interface CalendarAuthResult {
  accessToken: string;
  refreshToken: string | null;
}

export async function signInWithGoogle(): Promise<CalendarAuthResult | null> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('EXPO_PUBLIC_GOOGLE_CLIENT_ID ist nicht konfiguriert. Siehe .env.example.');
  }

  const isWeb = Platform.OS === 'web';

  try {
    console.log('[GoogleLogin] fetchDiscovery start, platform:', Platform.OS);
    const discovery = await AuthSession.fetchDiscoveryAsync('https://accounts.google.com');
    if (!discovery) {
      console.warn('[GoogleLogin] discovery null');
      return null;
    }

    const redirectUri = Platform.OS === 'web'
      ? 'https://susikju.github.io/tasks-extended/'
      : AuthSession.makeRedirectUri({ scheme: 'tasksextended' });
    console.log('[GoogleLogin] redirectUri:', redirectUri);

    const request = new AuthSession.AuthRequest({
      clientId: GOOGLE_CLIENT_ID,
      scopes: SCOPES,
      redirectUri,
      // Web: implicit flow (Token) — CORS blockiert direkten Token-Exchange vom Browser
      // Native: PKCE code flow mit serverseitigem Exchange
      responseType: isWeb ? AuthSession.ResponseType.Token : AuthSession.ResponseType.Code,
      usePKCE: !isWeb,
      // Force consent screen so Google always issues a token with ALL requested scopes.
      // Without this, Google may silently reuse a prior session consented before
      // drive.file was added, producing a 403 on Drive API calls.
      // access_type=offline is only valid for the code flow (native), not implicit (web).
      extraParams: isWeb ? { prompt: 'consent' } : { prompt: 'consent', access_type: 'offline' },
    });

    console.log('[GoogleLogin] promptAsync start');
    const result = await request.promptAsync(discovery);
    console.log('[GoogleLogin] promptAsync result type:', result.type);

    if (result.type !== 'success') return null;

    if (isWeb) {
      const accessToken = result.params.access_token;
      if (!accessToken) {
        console.warn('[GoogleLogin] kein access_token im Web-Result');
        return null;
      }
      return { accessToken, refreshToken: null };
    }

    const tokenResponse = await exchangeCodeForTokens(
      result.params.code,
      request.codeVerifier ?? '',
      redirectUri,
      GOOGLE_CLIENT_ID
    );
    return tokenResponse;
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
    };
  } catch {
    return null;
  }
}

export async function refreshAccessToken(refreshToken: string, clientId: string): Promise<string | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        grant_type: 'refresh_token',
      }).toString(),
    });

    const data = await response.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  return refreshAccessToken(refreshToken, GOOGLE_CLIENT_ID);
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

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;   // ISO datetime or date
  end: string;
  allDay: boolean;
  location?: string;
  calendarName?: string;
}

export async function listUpcomingEvents(
  accessToken: string,
  calendarId: string,
  days = 2
): Promise<CalendarEvent[]> {
  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + days);
  until.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
    orderBy: 'startTime',
    singleEvents: 'true',
    maxResults: '20',
  });

  const res = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    accessToken
  );
  if (!res.ok) return [];
  const data = await res.json();

  return (data.items ?? []).map((e: any) => {
    const allDay = !!e.start?.date;
    return {
      id: e.id,
      summary: e.summary ?? '(Kein Titel)',
      start: e.start?.dateTime ?? e.start?.date ?? '',
      end: e.end?.dateTime ?? e.end?.date ?? '',
      allDay,
      location: e.location,
    };
  });
}

export async function listCalendars(accessToken: string): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
  const res = await calendarFetch('/users/me/calendarList', accessToken);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((c: { id: string; summary: string; primary?: boolean }) => ({
    id: c.id,
    summary: c.summary,
    primary: c.primary,
  }));
}

export async function createCalendarEvent(
  task: Task,
  accessToken: string,
  calendarId: string
): Promise<string | null> {
  if (!task.dueDate) return null;

  const event = {
    summary: task.title,
    description: task.description || undefined,
    start: { date: task.dueDate.split('T')[0] },
    end: { date: task.dueDate.split('T')[0] },
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

  const event = {
    summary: task.title,
    description: task.description || undefined,
    start: { date: task.dueDate.split('T')[0] },
    end: { date: task.dueDate.split('T')[0] },
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

async function listGoogleTasksById(accessToken: string, taskListId: string): Promise<Array<any>> {
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
  return res.ok || res.status === 404;
}
