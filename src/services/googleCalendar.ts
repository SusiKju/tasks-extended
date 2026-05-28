import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Task } from '../types';
import { formatDate } from '../utils/dateFormat';

WebBrowser.maybeCompleteAuthSession();

// Configure these in your Google Cloud Console
const CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? '';
const CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? '';
const CLIENT_ID_WEB = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ?? '';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export interface CalendarAuthResult {
  accessToken: string;
  refreshToken: string | null;
}

export async function signInWithGoogle(): Promise<CalendarAuthResult | null> {
  const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');
  if (!discovery) return null;

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'tasksextended' });

  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID_WEB || CLIENT_ID_IOS,
    scopes: SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });

  const result = await request.promptAsync(discovery);

  if (result.type !== 'success') return null;

  const tokenResponse = await exchangeCodeForTokens(
    result.params.code,
    request.codeVerifier ?? '',
    redirectUri
  );
  return tokenResponse;
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<CalendarAuthResult | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID_WEB || CLIENT_ID_IOS,
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

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: CLIENT_ID_WEB || CLIENT_ID_IOS,
        grant_type: 'refresh_token',
      }).toString(),
    });

    const data = await response.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
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

export async function listCalendars(accessToken: string): Promise<Array<{ id: string; summary: string }>> {
  const res = await calendarFetch('/users/me/calendarList', accessToken);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((c: { id: string; summary: string }) => ({
    id: c.id,
    summary: c.summary,
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
