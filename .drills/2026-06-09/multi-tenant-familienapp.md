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
A: Google Login – beim ersten Login wird automatisch eine neue Familie angelegt.

----
Q: Wie kommen weitere Familienmitglieder (z. B. der andere Elternteil) in dieselbe Familie – über einen Einladungslink, einen gemeinsamen Code, oder muss man das manuell konfigurieren?
A: Familiencode – ein gemeinsamer Code, mit dem weitere Mitglieder der Familie beitreten.

----
Q: Die Kinder sind aktuell mit festen IDs hartkodiert. Sollen Familien ihre eigenen Kinder selbst anlegen (Name, Avatar-Farbe wählbar), oder soll das weiterhin fix sein?
A: Konfigurierbar – jede Familie legt ihre eigenen Kinder an.

----
Q: Soll ein Familienmitglied nur zu genau einer Familie gehören können, oder ist "Familie wechseln" oder "mehreren Familien angehören" ein Szenario?
A: Ja – ein Mitglied gehört zu genau einer Familie.

----
Q: Wie soll die Eltern-/Kind-Rolle funktionieren – gibt es innerhalb einer Familie Rollen (Elternteil vs. Kind), und was darf ein Kind sehen/tun im Vergleich zu einem Elternteil?
A: Nur Eltern bedienen die App. Kinder sind Datensätze ohne eigenen Login. Kinder-Login ist Zukunftsthema.

----
Q: Der bestehende Google-Login (für Tasks/Kalender/Mail) ist pro Gerät. Firebase Auth wäre ein separater Login. Mein Vorschlag: Google Sign-In auch für Firebase nutzen (gleicher Button, kein zweites Passwort). Passt das, oder soll die Familien-Authentifizierung völlig unabhängig von Google sein?
A: Denselben Login wie Firebase und Google Kalender verwenden – ein einziger Google-Login für alles.

----
Q: Wer ist der "Eigentümer" einer Familie – die Person, die sie zuerst angelegt hat? Und darf nur der Eigentümer den Familiencode sehen/teilen, oder alle eingeloggten Elternteile?
A: Alle Elternteile dürfen den Familiencode sehen und teilen.

----
Q: Wie soll der Familiencode aussehen? Mein Vorschlag: 6 Zeichen, alphanumerisch, Großbuchstaben (z. B. "X7K2MQ") – einfach abzutippen, schwer zu raten. Oder lieber ein Wort-Paar ("blauer-apfel") für bessere Merkbarkeit?
A: Wort-Paar (z. B. "blauer-apfel").

----
Q: Was passiert mit deinen bestehenden Daten (Familie Redmann)? Mein Vorschlag: Migration – beim nächsten Login wird automatisch eine familyId für dich erzeugt und die alten Firestore-Pfade bleiben parallel erhalten, bis die Migration abgeschlossen ist. Oder lieber sauberer Schnitt und Neustart?
A: Automatisch migrieren.

----
Q: Google Kalender/Tasks/Mail-Sync ist persönlich (pro Google-Account). Bleibt das so – also jeder Elternteil sieht seinen eigenen Kalender – oder soll es einen "Familien-Kalender" geben, den alle Elternteile teilen?
A: Ja, persönlich pro Elternteil – jeder sieht seinen eigenen Kalender/Mail.

----
Q: Die geteilte Notizliste und Countdowns (shared/notepad, shared/countdowns) sollen für alle Elternteile einer Familie sichtbar sein. Sollen Kinder-Tasks (children/{childId}/tasks) ebenfalls für alle Elternteile verwaltbar sein, oder gibt es da eine Zuständigkeit pro Elternteil?
A: Alle Elternteile dürfen alle Kinder verwalten. Geteilte Liste und Countdowns bleiben zwischen den Elternteilen geteilt und müssen erhalten bleiben.

----
Q: Neuer Nutzer-Flow: Beim ersten Google-Login existiert noch keine Familie. Soll die App dann direkt einen Screen zeigen mit zwei Optionen – "Neue Familie erstellen" vs. "Mit Familiencode beitreten"? Oder soll "Erstellen" der Default sein und "Beitreten" irgendwo in den Einstellungen versteckt?
A: Zwei Buttons – "Neue Familie erstellen" und "Mit Familiencode beitreten".

----
Q: Die Kinder sind aktuell mit festen IDs und fest verdrahteten Namen hartkodiert. Beim Umbau legt jede Familie ihre Kinder selbst an. Ein Kind braucht mindestens: Name, Avatar-Farbe. Soll auch ein Emoji/Foto als Avatar möglich sein, oder reicht Farbe + Anfangsbuchstabe wie jetzt?
A: Auch Emojis als Avatar möglich.

----
Q: Wo in der App soll die Familienverwaltung sitzen? Mein Vorschlag: neuer Abschnitt im Settings-Tab ("Familie") mit: Familiencode anzeigen/kopieren, Mitgliederliste, Kinder verwalten (hinzufügen/umbenennen/löschen). Passt das?
A: Ja, passt.

----
Q: Firestore-Struktur nach dem Umbau – mein Vorschlag für den neuen Namespace:
  families/{familyId}/children/{childId}/tasks/{taskId}
  families/{familyId}/shared/notepad/items/{itemId}
  families/{familyId}/shared/countdowns/items/{itemId}
  families/{familyId}/members/{uid} → { role: "parent", displayName, email }
  familyCodes/{wort-paar} → { familyId }   ← Lookup-Tabelle für Beitritt
Passt diese Struktur, oder fehlt etwas?
A: Passt.

----
Q: Der Kinder-Kiosk-Modus (Kind-Gerät) erkennt sich aktuell über "kinder_child_id" in AsyncStorage und liest dann flat aus Firestore. Nach dem Umbau müsste das Kind-Gerät auch die familyId kennen. Mein Vorschlag: beim Einrichten des Kiosk-Modus wird die familyId automatisch mitgespeichert (der Elternteil richtet das einmalig ein). Passt das?
A: Ja.

----
Q: Wort-Paar-Codes: Sollen die Wörter deutsch sein (z. B. "blauer-apfel"), und reichen zwei Wörter oder lieber drei für mehr Sicherheit?
A: Deutsch, zwei Wörter.

----
Q: Migration der bestehenden Daten: Die alten Pfade (children/lenny/tasks/...) müssen in families/{neueFamilyId}/children/lenny/tasks/... kopiert werden. Soll das eine einmalige Cloud Function erledigen, oder ein lokales Node-Script, das du einmal ausführst?
A: Lokales Node-Script.

----
Q: Die App hat aktuell keinen Pflicht-Login-Screen – Google ist nur für Kalender/Tasks optional. Nach dem Umbau muss Firebase Auth zwingend vor der App stehen: App startet → Google-Login (Firebase) → Familie auswählen/erstellen → Dashboard. Das ist eine spürbare UX-Änderung. Ist das so gewollt, oder soll ein Gast-Modus (ohne Login, nur lokale Daten) erhalten bleiben?
A: Login ist Pflicht. Kein Gast-Modus.

----
Q: Kann ein Elternteil eine Familie verlassen oder ein anderes Mitglied entfernen? Mein Vorschlag: Austreten ja, Rauswerfen nein.
A: Vorschlag angenommen – Austreten möglich, kein Rauswerfen.
