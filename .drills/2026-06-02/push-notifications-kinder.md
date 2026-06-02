# Push-Nachrichten für Kinder – Aufgaben-Erinnerungen

## Kontext
Nutzer möchte den Kindern (4 Kinder mit Smartphones) automatisch Aufgaben zuweisen
und sie 4x täglich daran erinnern lassen. App ist eine Expo/React-Native-App (tasks-extended).
Aktuell keine Push-Notification-Infrastruktur vorhanden.

----
Q: Wie synchronisieren die Kinder-Geräte die kinder-aufgaben.json – sie haben keinen Zugang zum Eltern-Drive-Account?
A: Firebase Firestore.

## Entscheidungen (Stand 2026-06-02)
- Android only → kein Apple Push Certificate nötig
- Expo Push Service als Relay → kein eigener Server für Push nötig
- Kinder-App: muss installiert und geöffnet/eingerichtet werden (einmalig)
- Aufgaben-Workflow: Elternteil definiert Aufgaben → Kinder-App zeigt sie → Kinder haken ab

## Offene Architektur-Fragen
→ Wie werden Aufgaben vom Elternteil zu den Kinder-Geräten übertragen?
→ Wer löst die 4x-täglich-Erinnerungen aus?

## Technische Ausgangslage
- Framework: Expo SDK ~56, React Native 0.85
- Kein `expo-notifications` im package.json
- Kein Backend/Server vorhanden
- App läuft aktuell nur auf einem Gerät (des Nutzers)

----
Q: Haben die Kinder die App bereits auf ihren Smartphones installiert, oder sollen sie sie erst bekommen?
A: Noch nicht – App muss erst für Kinder gebaut werden.

----
Q: Welche Betriebssysteme haben die Kindertelefone – Android, iOS, oder gemischt?
A: Android.

----
Q: Sollen die Kinder die App selbst bedienen (Aufgaben abhaken), oder soll nur eine Benachrichtigung kommen?
A: Aufgaben abhaken – Kinder sollen die App aktiv nutzen.

----
Q: Bist du bereit, einen kleinen Cloud-Dienst (z.B. Expo Push Service – kostenlos) zu nutzen, oder soll alles lokal im WLAN bleiben ohne Internet?
A: Expo Push Service ist ok.

----
Q: Wie sollen Aufgaben von deinem Gerät zu den Kinder-Geräten übertragen werden – über einen gemeinsamen Cloud-Speicher (z.B. Google Drive/Firestore), oder soll jedes Kindergerät manuell eingerichtet werden?
A: Google Drive.

----
Q: Wer löst die 4x-täglichen Erinnerungen aus – dein Eltern-Gerät (sendet aktiv Push an Kinder), oder soll jedes Kinder-Gerät selbst einen lokalen Timer haben?
A: Eltern-Gerät sendet aktiv.

----
Q: Sollen alle 4 Kinder dieselben Aufgaben bekommen, oder willst du pro Kind unterschiedliche Aufgaben definieren?
A: Pro Kind unterschiedlich. Kinder: Lenny, Emil, Hannes, Liddy.

----
Q: Zu welchen Uhrzeiten sollen die 4 täglichen Erinnerungen geschickt werden – z.B. 8:00, 12:00, 16:00, 20:00?
A: Default 15:00 und 17:00 (also 2x täglich, nicht 4x). Zeiten sollen konfigurierbar sein.

----
Q: Wie soll ein Kind die App "einmalig einrichten"? Soll es sich mit einem Kinderprofil (z.B. Name auswählen) anmelden, oder soll die App pro Gerät fest auf ein Kind konfiguriert sein?
A: Kindgerecht – Name auswählen beim ersten Start.

----
Q: Google Drive ist bereits verbunden (client_secret.json vorhanden). Sollen die Kinder-Aufgaben in eine eigene Drive-Datei (z.B. kinder-aufgaben.json) geschrieben werden, oder in den bestehenden Notes/Tasks-Sync integriert werden?
A: Eigene Datei kinder-aufgaben.json.

## Finale Architektur (beschlossen 2026-06-02)

### Datenfluss
1. Elternteil definiert Aufgaben pro Kind (Lenny/Emil/Hannes/Liddy) in der Eltern-App
2. App schreibt `kinder-aufgaben.json` in Google Drive
3. Kinder-App liest die Datei und zeigt nur die eigenen Aufgaben
4. Kinder haken Aufgaben ab → Status wird in kinder-aufgaben.json zurückgeschrieben

### Push-Nachrichten
- Eltern-App sendet aktiv Push via Expo Push Service
- Default: 15:00 und 17:00 täglich
- Zeiten sind in den Einstellungen konfigurierbar
- Expo Scheduled Tasks lösen den Send-Vorgang aus

### Kinder-App Onboarding
- Erster Start: kindgerechter "Wer bist du?"-Screen mit den 4 Namen
- Danach: App zeigt nur die Aufgaben des gewählten Kinds
- Expo Push Token wird beim ersten Start registriert und in kinder-aufgaben.json eingetragen

### Zu bauende Komponenten
- [ ] `kinder-aufgaben.json` Dateistruktur (Schema)
- [ ] Eltern-App: Screen "Kinderaufgaben" (pro Kind verwalten + Push-Zeiten konfigurieren)
- [ ] `expo-notifications` installieren und konfigurieren
- [ ] Google Drive Sync für kinder-aufgaben.json
- [ ] Kinder-App: Onboarding-Screen (Name wählen)
- [ ] Kinder-App: Aufgabenliste + Abhak-Funktion
- [ ] Kinder-App: Push-Token-Registrierung
- [ ] Eltern-App: Scheduled Push-Versand (2x täglich)

----
Q: Ist die Kinder-App dieselbe App wie die Eltern-App (nur in einem "Kind-Modus"), oder soll eine komplett separate App gebaut werden?
A: Gleiche App, Kind-Modus.

----
Q: Was sehen die Kinder auf ihrer App – nur ihre eigene Aufgabenliste, oder auch Fortschritt/Punkte/Belohnungen?
A: Simpel: nur Aufgabenliste zum Abhaken. Kein Gamification.

## App-Modi (beschlossen)
- **Eltern-Modus** (Standard): alle bestehenden Tabs + neuer Tab "Kinder"
- **Kind-Modus**: nach Namensauswahl beim ersten Start → nur ein Screen: eigene Aufgabenliste
- Umschaltung: Im Kind-Modus gibt es keinen Zugang zum Eltern-Bereich (kein Zurück-Button ohne PIN o.ä.)

## Kinder-Screen (Inhalt)
- Liste der heutigen Aufgaben für das gewählte Kind
- Jede Aufgabe: Text + Checkbox zum Abhaken
- Abgehakte Aufgaben werden in kinder-aufgaben.json gespeichert
- Dezenter PIN-Button → Eltern-Modus (PIN konfigurierbar in Einstellungen)

## Eltern-Tab "Kinder" (Inhalt)
- Pro Kind: Aufgaben definieren (hinzufügen, bearbeiten, löschen)
- Pro Kind: Erledigungsstatus einsehen (welche Aufgaben abgehakt, welche offen)
- Erinnerungszeiten konfigurieren (Default: 15:00 + 17:00)
- Push an alle / einzelne Kinder manuell auslösen (optional)
