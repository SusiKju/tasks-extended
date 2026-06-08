# TasksExtended – Setup-Wissen & Entscheidungen

## Architektur

### App-Modi
- **Eltern-Modus** (Standard): alle Tabs + Tab "Kinder"
- **Kind-Modus**: nach Namensauswahl beim ersten Start → nur Aufgabenliste
- Umschaltung: PIN-Button (dezent, oben rechts) → Eltern-Modus
- Persistenz: `AsyncStorage` Key `kinder_child_id`

### Kinder
Lenny, Emil, Hannes, Liddy – IDs: `lenny`, `emil`, `hannes`, `liddy`

### Datenspeicher
- **Firebase Firestore** (Projekt: `tasks-extended-34507`)
- Struktur:
  ```
  children/{childId}/tasks/{taskId}   → ChildTask
  children/{childId}/pushToken        → string (expo-notifications Token)
  config/reminders                    → { times: string[] }
  pushTriggers/{childId}              → { triggeredAt: ISO-string, childName: string }
  ```
- Firestore-Regeln (Produktionsmodus, kein Ablauf):
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /children/{childId}/{document=**} {
        allow read, write: if true;
      }
      match /config/{document=**} {
        allow read, write: if true;
      }
      match /pushTriggers/{document=**} {
        allow read, write: if true;
      }
      match /shared/{document=**} {
        // Geteilte Notizliste der Eltern (TE-121), z. B. Einkaufsliste.
        allow read, write: if true;
      }
    }
  }
  ```

---

## Push-Nachrichten

### Web-App (GitHub Pages)
- Kein echter Hintergrund-Push möglich (Browser-Einschränkung)
- Implementierung: Firestore-Trigger → In-App-Toast im KindScreen
- Elternteil schreibt in `pushTriggers/{childId}` → Kind-Gerät reagiert per `onSnapshot`

### Native APK
- `expo-notifications` + Expo Push Service
- Push-Token wird beim ersten App-Start registriert und in Firestore gespeichert
- `Notifications.getExpoPushTokenAsync({ projectId })` – projectId aus `expo-constants`
- `setNotificationHandler` nur auf native (`Platform.OS !== 'web'`)

---

## Google OAuth (Eltern-Login)

### Wichtig: expo-auth-session braucht die WEB-Client-ID
Nicht die Android-Client-ID. Auch auf Android läuft der Flow über den Browser.

### Einrichtung Google Cloud Console
1. APIs & Dienste → Anmeldedaten → Web-Client-ID öffnen
2. Autorisierte Weiterleitungs-URIs müssen enthalten:
   - `http://localhost:8081`
   - `https://susikju.github.io/tasks-extended/`
   - `https://auth.expo.io/@susikju/tasks-extended`
3. Client-ID: `934256455571-posu4ic37t03v4krthiph71pik127ljn.apps.googleusercontent.com`

### Konfiguration
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID` = Web-Client-ID (nicht Android!)
- In `eas.json` unter `preview.env` eingetragen
- Als Fallback auch direkt in `googleCalendar.ts` hardcoded

---

## Build & Deployment

### Web-App (GitHub Pages)
```bash
git push  # GitHub Actions baut automatisch
```
URL: `https://susikju.github.io/tasks-extended/`

CI-Besonderheit: `.npmrc` mit `legacy-peer-deps=true` nötig (peer dependency Konflikte)

### Native APK (Android)
```bash
npx eas build --platform android --profile preview
```
- Dauert ~10 Minuten
- Download-Link kommt per E-Mail / EAS-Dashboard
- Installation: auf Family-Link-Geräten über Altersänderung + APK-Sideload

### OTA-Updates (nach erster APK-Installation)
```bash
npx eas update --channel preview --message "Beschreibung"
```
- Dauert ~1 Minute
- App lädt beim nächsten Start automatisch nach
- **Kein Neuinstall nötig** solange keine neuen nativen Pakete

### Wann neue APK nötig
- Neues natives npm-Paket installiert
- Änderungen an `app.json` (Berechtigungen, Plugins)
- Änderungen an `eas.json` Environment-Variablen

---

## Versionskonflikte (gelöste Probleme)

| Problem | Ursache | Fix |
|---|---|---|
| `NoClassDefFoundError: AnyTypeProvider` | `expo-splash-screen ^55` mit SDK 56 | `~56.0.0` |
| `Incompatible React versions` | `react 19.2.6` vs `react-native-renderer 19.2.3` | `react: 19.2.3` |
| `npm ci` schlägt fehl | peer dependency Konflikte | `.npmrc`: `legacy-peer-deps=true` |
| `expo-updates` Kotlin crash | falsche Version für SDK 56 | `npx expo install expo-updates` |

---

## Debugging

### ADB Wireless (Pixel 9)
```bash
# Einmalig koppeln
adb pair 192.168.x.x:PORT
# Verbinden
adb connect 192.168.x.x:5555
# Crash-Logs
adb -s adb-SERIAL._adb-tls-connect._tcp logcat | grep -E "AndroidRuntime|FATAL|tasksextended"
```

### Family Link & APK-Installation
- Family Link blockiert Sideloading auf Android 14+
- Lösung: Alter auf 21+ setzen → Kind bekommt E-Mail → bestätigen → Family Link deaktiviert
- Danach: APK über Browser-Download installieren

---

## Firebase Projekt
- Projekt-ID: `tasks-extended-34507`
- EAS Project-ID: `d2992d41-b8a8-42de-b1d9-f6848a6485b6`
- Expo Username: `susikju`
- App Package: `com.tasksextended.app`
