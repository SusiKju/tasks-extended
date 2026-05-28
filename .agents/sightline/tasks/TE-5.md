---
title: Google-Kalender-Synchronisation integrieren
task: TE-5
created: 2026-05-28T08:51
---

## Umgesetzt in

- `src/services/googleCalendar.ts` — OAuth2 PKCE Flow + Calendar API Wrapper
- `src/screens/SettingsScreen.tsx` — Connect/Disconnect UI
- `src/screens/CreateTaskScreen.tsx` — Auto-Sync beim Anlegen
- `src/screens/TaskDetailScreen.tsx` — Sync beim Bearbeiten, Löschen entfernt Event
- `src/store/index.ts` — `googleAccessToken`, `refreshToken`, `calendarId` in Settings

## Ablauf

1. Nutzer tippt "Mit Google anmelden" in den Einstellungen
2. PKCE-Auth via `expo-auth-session` + `expo-web-browser`
3. Code gegen Access/Refresh-Token austauschen
4. Kalender-Liste laden, primären Kalender vorauswählen
5. Nutzer kann bei mehreren Kalendern auswählen

## Kalender-Operationen

| Aktion | API-Call |
|---|---|
| Task mit Datum anlegen | `POST /calendars/{id}/events` |
| Task bearbeiten | `PUT /calendars/{id}/events/{eventId}` |
| Task löschen | `DELETE /calendars/{id}/events/{eventId}` |

## Konfiguration

Google OAuth Client-IDs müssen als Expo Public Env Vars gesetzt werden:
```
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=...
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=...
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=...
```
Und in der Google Cloud Console: Redirect URI `tasksextended://` eintragen.

## Hinweis

Calendar-Sync-Fehler sind nicht fatal — Task wird trotzdem lokal gespeichert.
