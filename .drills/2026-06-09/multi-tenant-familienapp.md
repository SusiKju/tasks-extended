# Multi-Tenant Familienapp – Architektur

## Kontext
Die App soll von mehreren Familien nutzbar sein, jede mit eigenen, isolierten Daten.
Aktuell: Kinder hartkodiert (`lenny`, `emil`, `hannes`, `liddy`), alle Firestore-Pfade flat ohne Familien-Namespace, keine Authentifizierung.

Bestehende Firestore-Pfade (müssen alle umgebaut werden):
- `children/{childId}/tasks/{taskId}`
- `shared/notepad/items/{itemId}`
- `shared/countdowns/items/{itemId}`
- `children/{childId}/pushToken`

----
Q: Wie soll eine neue Familie die App "betreten"? Selbst registrieren (z. B. mit Google-Login), oder gibt es einen Admin, der Familien anlegt?
A: ?

----
Q: Wie kommen weitere Familienmitglieder (z. B. der andere Elternteil) in dieselbe Familie – über einen Einladungslink, einen gemeinsamen Code, oder muss man das manuell konfigurieren?
A: ?

----
Q: Die Kinder sind aktuell mit festen IDs hartkodiert. Sollen Familien ihre eigenen Kinder selbst anlegen (Name, Avatar-Farbe wählbar), oder soll das weiterhin fix sein?
A: ?

----
Q: Soll ein Familienmitglied nur zu genau einer Familie gehören können, oder ist "Familie wechseln" oder "mehreren Familien angehören" ein Szenario?
A: ?

----
Q: Wie soll die Eltern-/Kind-Rolle funktionieren – gibt es innerhalb einer Familie Rollen (Elternteil vs. Kind), und was darf ein Kind sehen/tun im Vergleich zu einem Elternteil?
A: ?

----
Q: Der bestehende Google-Login (für Tasks/Kalender/Mail) ist pro Gerät. Firebase Auth wäre ein separater Login. Mein Vorschlag: Google Sign-In auch für Firebase nutzen (gleicher Button, kein zweites Passwort). Passt das, oder soll die Familien-Authentifizierung völlig unabhängig von Google sein?
A: ?
