# Wertschätzungs-/Erinnerungsfeature für Elternteile

Ziel: Erinnert beide Elternteile täglich daran, dem Partner etwas mitzuteilen
(Liebevolles, Erotisches oder Gedanken) – gegen den Alltagsstress mit Kindern.

Relevante bestehende Bausteine:
- `src/services/sharedNotes.ts` – geteilte Liste zwischen Eltern, hat bereits
  `reaction`-Konzept (❤️😘🤗👍) und `emoji`-Tags. Nächstliegendes Vorbild.
- `src/services/scheduledPush.ts` + `src/services/pushNotifications.ts` –
  tägliche Erinnerungs-Push an Kinder, Zeiten aus Firestore, Minuten-Poll.
  Aktuell nur Push-Tokens für Kinder gespeichert (`kinderTasks.ts`), nicht für
  Eltern-Mitglieder.
- `src/services/family.ts` – beide Eltern haben `role: 'parent'`, kein
  Unterschied zwischen ihnen im Datenmodell (kein "Partner-Zuordnung" nötig,
  da nur 2 Personen pro Familie erwartet).
- Kind-Modus läuft über `KindScreen.tsx` mit `?child=` – Feature darf dort
  nicht sichtbar/erreichbar sein.

----
Q: Wo lebt das Feature in der App – eigener neuer Screen/Tab, oder Erweiterung eines bestehenden Screens (z. B. NotesScreen)?
A: Eigener neuer Screen.

----
Q: Ist der Inhalt im Kind-Modus (KindScreen `?child=`) komplett ausgeblendet, oder soll dort gar keine Route dafür existieren?
A: Komplett ausgeblendet, keine Route im Kind-Modus.

----
Q: Läuft die tägliche Erinnerung als echte Push-Notification (analog `scheduledPush.ts`, braucht Push-Token auch fürs Elternteil-Gerät), oder reicht ein In-App-Hinweis beim Öffnen der App?
A: Nur In-App-Hinweis (kein Push, kein Push-Token-Infra fürs Elternteil-Gerät nötig).

----
Q: Eine gemeinsame feste Erinnerungszeit für beide Eltern, oder individuell pro Elternteil einstellbar?
A: Eine gemeinsame Zeit für beide. [ÜBERHOLT – siehe Dashboard-Banner-Frage
unten: es gibt gar keine Uhrzeit-Schwelle mehr, der Banner gilt tagesweise
("heute schon etwas geschickt?"), nicht uhrzeitbasiert. Diese Frage war auf
Basis der ursprünglichen Push-Idee gestellt und durch die spätere Antwort
überholt.]

----
Q: Werden geschickte Nachrichten dauerhaft gespeichert (Verlauf/Historie wie bei `sharedNotes.ts`), oder sind sie flüchtig (nur als Push, verschwinden danach)?
A: Mit Verlauf/Historie.

----
Q: Wie äußert sich der In-App-Hinweis konkret (kein Push)? [KORRIGIERT – siehe unten, ursprüngliche Antwort "Badge/Punkt im Tab" bezog sich auf den falschen Mechanismus]
A: Es sind zwei getrennte Mechanismen, kein einzelner Hinweis:
  1. Dashboard-Banner ("Erinnerung"): prominent oben auf dem Dashboard,
     analog zur Geburtstags-Card (`todayBirthdays.length > 0` → pulsierende
     Card, DashboardScreen.tsx ~Z.892). Erscheint sofort am Tagesanfang und
     bleibt sichtbar, bis man selbst heute etwas geschickt hat ("erledigt").
     Kein Uhrzeit-Trigger, kein Warten bis 18 Uhr – gilt den ganzen Tag.
  2. Tab-Badge ("ungelesene Nachricht"): kleiner Punkt auf dem
     Wertschätzungs-Tab, erscheint wenn der Partner eine Nachricht geschickt
     hat, die man selbst noch nicht gelesen/geöffnet hat. Unabhängig vom
     Dashboard-Banner – reine Unread-Anzeige, kein Tages-Reminder.

----
Q: Wie soll der Inspirationstext ("Möchtest du... Erotisches... Lob... Kritikpunkt") konkret platziert werden – als Platzhalter-Text/Placeholder im leeren Eingabefeld, oder als kleiner Hinweistext/Chip-Vorschläge unterhalb des Eingabefelds?
A: Placeholder im leeren Eingabefeld.

----
Q: Soll "sanfte konstruktive Kritik" wirklich als gleichwertige Option neben Liebevolles/Erotisches/Lob stehen, oder eher vorsichtiger formuliert/optisch zurückhaltender, damit das Feature nicht ungewollt zum Kritik-Kanal wird?
A: Bewusst zurückhaltender formuliert (als letzte, vorsichtig formulierte Idee im Placeholder-Text).

----
Q: Sollen eigene, bereits abgeschickte Nachrichten im Verlauf noch nachträglich bearbeitet oder gelöscht werden können (wie bei `updateSharedNote`/Soft-Delete), oder sind sie nach dem Absenden endgültig?
A: Ja, wie bei sharedNotes (Soft-Delete).

----
Q: Sollen ungelesene Nachrichten optisch hervorgehoben werden (gelesen/ungelesen-Status wie ein Postfach), oder reicht schlicht chronologische Liste ohne Lesestatus?
A: Ja, fett/Punkt in der Liste selbst zusätzlich zum Tab-Badge.

----
Q: Sollen künftig geschickte Nachrichten dieselbe Firestore-Struktur wie `sharedNotes.ts` teilen (eigene Sub-Collection `shared/wertschaetzung/items` in derselben Familie), oder komplett getrennt, z. B. mit eigener Sichtbarkeits-Regel pro Absender/Empfänger?
A: Eigene Sub-Collection, gleiches Pattern wie SharedNoteItem (text, addedBy,
createdAt, reaction) plus readBy/readAt fürs Unread-Tracking (Tab-Badge +
Fett-Markierung in der Liste).

----
Q: Verschwindet der Dashboard-Banner individuell pro Person, oder gemeinsam sobald irgendeiner von beiden heute geschrieben hat?
A: Individuell pro Person – jeder sieht den Banner, bis er/sie SELBST heute
etwas geschickt hat.

----
Q: Wie auffällig soll der Dashboard-Banner optisch sein (z. B. genauso wie die pulsierende Geburtstags-Card)?
A: Ruhiger, ohne Pulsieren – gleiche Position/Prominenz oben auf dem
Dashboard, aber ohne Animation.

----
Q: Sollen die drei Kategorien (Liebevolles / Erotisches / Gedanken) als sichtbare Auswahl/Tag im UI erscheinen, oder nur freier Text ohne Pflichtkategorie?
A: Explizite Pflichtauswahl ist zu aggressiv. Freier Text, aber mit einem Hinweis/Inspirationstext daneben: "Möchtest du deinem Partner etwas mitteilen, wenn dir hier konkret nichts einfällt? Vielleicht etwas Erotisches, oder etwas aus dem Alltag, was er gut gemeistert hat, oder auch mal einen kleinen Kritikpunkt, den man zusammen verbessern möchte." → Kategorien-Idee erweitert sich damit um "Lob für Alltags-Gemeistertes" und "sanfte konstruktive Kritik", zusätzlich zu Liebevolles/Erotisches/Gedanken.

----
Q: Kann der Partner auf eine erhaltene Nachricht reagieren (z. B. Emoji-Reaction analog `sharedNotes.ts`), oder ist es eine reine Einbahnstraße?
A: Ja, Emoji-Reaction.

----
Q: Wie soll der neue Tab/Screen heißen (Label + Titel)?
A: "Für uns" – bewusst diskret, kein Hinweis auf den intimen Inhalt im
Tab-Label, falls Kinder kurz aufs Handy schauen.

----
Q: Erscheinen gesendete und empfangene Nachrichten in einer gemeinsamen chronologischen Liste, oder getrennt (Gesendet/Empfangen)?
A: Eine gemeinsame Liste – wie ein Chat-Verlauf, Absender erkennbar.

----
Q: Sortierung der Liste?
A: Neueste zuerst.

----
Ergebnis der Navigations-Recherche (app/(tabs)/_layout.tsx):
Es gibt bereits einen `visibleTabs`/`TabKey`/`DEFAULT_VISIBLE_TABS`-Mechanismus
(TE-49), mit dem jedes Elternteil einzelne Tabs ein-/ausblenden kann. Der neue
Tab "Für uns" reiht sich einfach dort ein (`href: hrefFor('fuerUns')` analog
zu den anderen) – kein neuer eigener Ausblenden-Mechanismus nötig. Unread-Zahl
kann über `tabBarBadge` (von expo-router/Tabs bereits unterstützt) gelöst
werden, kein Custom-Badge-Code nötig.

## Zusammenfassung – bereit für Umsetzung

- Neuer Screen/Tab **"Für uns"** (app/(tabs)/fuer-uns.tsx + FuerUnsScreen.tsx),
  eingehängt in bestehenden `visibleTabs`-Mechanismus. Nicht erreichbar im
  Kind-Modus (KindScreen `?child=` bleibt unangetastet).
- Firestore: `families/{familyId}/shared/fuerUns/items`, gleiches Pattern wie
  `SharedNoteItem` (text, addedBy/senderUid, createdAt, reaction, soft-delete)
  plus `readBy`/`readAt` fürs Unread-Tracking.
- Kein Push, keine Push-Token-Infra für Eltern nötig.
- Zwei getrennte Signale:
  1. Dashboard-Banner (ruhig, ohne Pulsieren, Position wie Geburtstags-Card):
     sichtbar den ganzen Tag, individuell pro Person, bis diese Person SELBST
     heute etwas geschickt hat.
  2. Tab-Badge (`tabBarBadge`, expo-router-nativ): Anzahl ungelesener
     Nachrichten vom Partner. Ungelesene Einträge zusätzlich fett/mit Punkt
     in der Liste selbst markiert.
- Eingabefeld: freier Text, kein Pflicht-Kategorie-Picker. Placeholder-Text
  als Inspiration, letzter Punkt (Kritik) bewusst zurückhaltend formuliert,
  z. B.: "Was möchtest du deinem Partner heute sagen? Etwas Liebes, etwas
  Erotisches, ein Gedanke – oder vielleicht auch mal ganz sanft etwas, das
  ihr zusammen noch besser machen könntet."
- Nachrichten: dauerhafter Verlauf, eine gemeinsame chronologische Liste
  (neueste zuerst), bearbeitbar/löschbar per Soft-Delete (wie sharedNotes),
  Emoji-Reaction analog `SHARED_NOTE_REACTIONS`.
- Versionierung (CLAUDE.md): MINOR-Bump in package.json + app.json bei Merge,
  da neues Feature/neue Ansicht.
