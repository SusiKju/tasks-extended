# APK-Build, Push im Hintergrund & Updates

## Kontext
Web-App Push funktioniert nicht wenn Browser geschlossen ist.
Nutzer möchte echten Hintergrund-Push (auch wenn Handy gesperrt).
Fragt auch nach automatischen APK-Updates und lokaler WLAN-Lösung.

----
Q: Haben die Kinder-Handys die Möglichkeit, APKs aus unbekannten Quellen zu installieren (Android "Unbekannte Quellen" erlauben)?
A: Ja — APK-Build mit Expo OTA-Updates gewählt.

## Entscheidung
- Native Android APK via EAS Build
- Expo OTA-Updates: Code-Änderungen werden automatisch nachgeladen, keine manuelle APK-Neuinstallation nötig
- FCM (Firebase Cloud Messaging) für echten Hintergrund-Push
