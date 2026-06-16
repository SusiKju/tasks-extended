# Unified Feed Block (Dashboard)

Kontext: Dashboard ist über `settings.dashboardBlocks` konfigurierbar (TE-77, einzelne
Blöcke ein/ausblendbar in den Settings). Neuer Wunsch: ein Block, der alle
"zu erledigenden" Items (Tasks, Mails, Geburtstage, ...) als einheitliche Liste
zeigt, mit nur einem dezenten Icon zur Kategorie-Kennzeichnung. Frage: soll dieser
Block die bestehenden Blöcke ersetzen oder zusätzlich wählbar sein.

----
Q: Soll der neue Block die bestehenden Blöcke (Tasks, Posteingang, Termine,
Aufgaben der Kinder, Geburtstage, ...) komplett ersetzen (aus dem Dashboard
entfernen), oder als zusätzlicher, alternativ aktivierbarer Block neben den
bestehenden in den Settings auftauchen?
Empfehlung: Als neuer Block-Typ `feed` zusätzlich einführen, einzeln in den
Settings aktivierbar – nicht hart ersetzen. So bleibt die bisherige Ansicht
als Fallback erhalten und nichts geht beim Rollout kaputt. Begründung: "soll
eventuell alle anderen ersetzen" klingt nach Testwunsch, nicht nach fixer
Entscheidung.
A: Zusätzlich, beide wählbar (neuer Block `feed`, alte Blöcke bleiben einzeln abschaltbar).

----
Q: Welche Kategorien sollen als Items im Feed erscheinen? (Mehrfachauswahl)
Kandidaten: Eigene Tasks (überfällig/heute), Kinder-Aufgaben (heute),
Posteingang (angepinnt/ungelesen), Kalender-Termine (heute/morgen),
Geburtstage (heute), Geteilte Liste (offene Einträge), Countdowns,
Geistesblitze.
Empfehlung: Eigene Tasks, Kinder-Aufgaben, Mail, Kalender-Termine und
Geburtstage – das sind die Dinge mit echtem Handlungsbedarf oder Termincharakter.
Geteilte Liste, Countdowns und Geistesblitze bleiben außen vor, da sie eher
Notiz-/Inspirationscharakter haben als "zu erledigen".
A: Alles: Tasks, Kinder-Aufgaben, Mail, Kalender-Termine, Geburtstage, Geteilte Liste,
Countdowns, Geistesblitze. Wetter und Links bleiben außen vor (keine diskreten Items).

----
Q: Sollen Wetter, Links, Geistesblitze und Geteilte Liste als separate Blöcke
unverändert weiter existieren (auch wenn der Feed-Block aktiv ist), da sie
keine "Erledigungs-Items" sind?
Empfehlung: Ja, unverändert weiter als eigene Blöcke bestehen lassen.
A: Ja, Wetter/Links/Geistesblitze/Geteilte Liste bleiben zusätzlich als eigene Blöcke
bestehen (additiv – Geistesblitze und Geteilte Liste tauchen also sowohl als eigener
Block als auch als Items im Feed auf, wenn beide aktiv sind).

----
Q: Wie sollen die Items im Feed sortiert/gruppiert werden? Quellen haben sehr
unterschiedliche "Fälligkeits"-Semantik (Task: Datum+Uhrzeit oder gar keins,
Kind-Aufgabe: nur heute, Mail: kein Termin nur Eingangsdatum, Termin: Uhrzeit
heute/morgen, Geburtstag: nur heute, Geteilte Liste/Geistesblitze: kein Termin).
Empfehlung: Zeitlich gruppiert wie der bestehende Tasks-Block (Überfällig /
Heute / Morgen / Ohne Termin), innerhalb jeder Gruppe nach Kategorie-Priorität
(Geburtstag, Termin, Task, Kind-Aufgabe, Mail) und dann wichtig-zuerst sortiert.
Mail/Geteilte Liste/Geistesblitze ohne eigenes Datum landen immer in "Ohne Termin".
A: Zeitlich gruppiert: Überfällig / Heute / Morgen / Ohne Termin; innerhalb der
Gruppe Kategorie-Priorität dann wichtig-zuerst.

----
Q: Wie soll das Kategorie-Icon aussehen – farblich neutral/dezent (z. B. immer
grau/textMuted, nur die Icon-Form unterscheidet die Kategorie) oder in der
bisherigen Kategorie-Farbe (Task=Blau, Termin=Google-Blau, wichtig=Rot, ...)?
Empfehlung: Neutral/dezent (immer `colors.textMuted`), nur die Form des Icons
(Checkbox, Mail, Kalender, Kuchen, Personen-Icon, Glühbirne, Liste) zeigt die
Kategorie. Passt zu "ganz dezent per Icon" – Farbe bleibt der Wichtig-/
Überfällig-Markierung vorbehalten (z. B. roter Text statt rotem Icon).
A: Neutral/dezent (immer colors.textMuted), nur die Icon-Form unterscheidet die
Kategorie. Wichtig/Überfällig wird über Textfarbe markiert.

----
Q: Soll der neue Feed-Block standardmäßig aktiv (an) oder inaktiv (aus) sein,
wenn er ausgeliefert wird? Da er additiv neben den bestehenden Blöcken existiert,
würden bei "an" ggf. Inhalte doppelt erscheinen (z. B. Tasks im Tasks-Block UND im Feed).
Empfehlung: Standardmäßig AUS – du aktivierst ihn bewusst in den Settings und
kannst dann in Ruhe die anderen Blöcke einzeln abschalten, um Duplikate zu vermeiden.
A: Standardmäßig AUS.

----
Q: Reicht Tippen auf ein Item zur Navigation zum jeweiligen Screen (Task-Detail,
Kids-Tab, Mail-Tab, ...), oder soll man Tasks direkt im Feed abhaken können
(z. B. Swipe oder Checkbox-Tap), ohne zu navigieren?
Empfehlung: Für die erste Version nur Tippen → Navigation (wie die anderen
Dashboard-Blöcke aktuell auch funktionieren). Direktes Abhaken im Feed wäre ein
sinnvolles Folge-Feature, aber zusätzlicher Scope (Erledigen-Mutation pro Kategorie).
A: Nur Tippen → Navigation (v1).

----
Q: Wie soll der neue Block in den Settings heißen (Label + Beschreibung) und
welchen Internal Key bekommt er als `DashboardBlockKey`?
Empfehlung: Key `feed`, Label "Alles", Beschreibung "Alle anstehenden Dinge als
eine Liste, mit Icon je Kategorie." Kurzer, neutraler Name statt z. B. "To-Do"
(da auch Termine/Geburtstage drin sind, die kein "To-Do" im engeren Sinn sind).
A: "Mein Tag" (key: feed).

----
Q: Wo im Dashboard soll der Feed-Block angezeigt werden, wenn aktiv – ganz oben
(vor Wetter/Sync-Zeile), oder an der Stelle, an der heute "Heutige Tasks +
Notizblock" steht (also nach Geburtstage/Wetter, vor Links/Geistesblitze/Termine)?
Empfehlung: An der Stelle des aktuellen Tasks+Notizblock-Bereichs (nach
Geburtstage/Wetter/Sync-Zeile) – dort ist heute schon der "was ist als nächstes
dran"-Bereich, das passt inhaltlich am besten.
A: Anstelle des Tasks+Notizblock-Bereichs (nach Geburtstage/Wetter/Sync-Zeile).

----
Q: Sollen Mail-Items im Feed wie bisher auf max. 5 (angepinnt+ungelesen)
begrenzt bleiben, damit ein voller Posteingang den Feed nicht sprengt? Gleiche
Frage für Geteilte-Liste-Einträge und Geistesblitze (falls dort viele offene
Einträge/Notizen existieren).
Empfehlung: Ja – pro Kategorie ein Limit (Mail: 5 wie bisher, Geteilte Liste/
Geistesblitze: z. B. 5), mit einem dezenten "+N weitere" Hinweis statt die
Liste zu sprengen. Tasks/Kind-Aufgaben/Termine/Geburtstage bleiben ungekappt,
da die heute schon klein/überschaubar sind.
A: Nein, keine Limits – alle Items werden angezeigt.

----
Q: Soll der bestehende "Scratchpad"-Block (Notizblock) weiterhin direkt neben dem
Feed stehen (analog zur heutigen Tasks+Notizblock-Zweispaltigkeit), oder soll der
Feed die volle Breite einnehmen und der Notizblock als eigener, unabhängiger
Block irgendwo anders im Dashboard erscheinen?
Empfehlung: Feed nimmt volle Breite ein (eine Liste lässt sich schlecht in eine
schmale Spalte zwängen); Notizblock bleibt eigener Block mit eigenem Settings-
Toggle und rutscht – falls aktiv – direkt unter den Feed.
A: Feed volle Breite, Notizblock eigener Block direkt darunter.

----
Q: Für Mail/Geteilte-Liste/Geistesblitze-Items ohne festes Datum: Sollen diese
in der Gruppe "Ohne Termin" ganz am Ende der Liste stehen, oder gibt es eine
eigene "Diese Woche zu beachten"-Zwischengruppe?
Empfehlung: Einfach "Ohne Termin" als letzte Gruppe – keine künstliche
Zwischengruppe, das hält die Struktur (Überfällig/Heute/Morgen/Ohne Termin)
einfach und konsistent mit der bestehenden Tasks-Gruppierung.
A: Erst mal als letzte Gruppe unten, ABER: die Reihenfolge innerhalb dieser Gruppe
soll manuell per Drag & Drop änderbar sein, und diese Reihenfolge muss persistiert
werden (Firestore) – neue Anforderung, siehe Folgefragen unten.

----
Q: Reicht ein einfaches Tap-Highlight (kein Hover/Press-State-Sonderfall) auf
jedem Feed-Item, oder soll es wie die TaskChips ein "wichtig + heute fällig"
Blink-Verhalten übernehmen?
Empfehlung: Kein Blinken im Feed – die Liste soll bewusst ruhig/dezent wirken
(passt zum Wunsch "ganz dezent"). Wichtige+heute-fällige Tasks werden stattdessen
nur durch fetten/roten Text hervorgehoben, ohne Animation.
A: Kein Blinken, nur fetter/roter Text.

----
Q: Die manuelle Reihenfolge soll persistiert werden – auf welcher Ebene? Items
in "Ohne Termin" sind heterogen (Mail-IDs, Geteilte-Liste-Einträge, Geistesblitze-
Notizen) und teils flüchtig (eine Mail kann gelesen werden und aus der Liste
fallen, eine Geteilte-Liste-Karte kann gelöscht werden).
Empfehlung: Eine Sortierreihenfolge pro stabilem Item-Schlüssel
(`category:id`, z. B. `mail:18f2a...`, `sharedList:item-3`) in
`settings`/Firestore unter dem Familien-Account ablegen (ähnlich wie
`pinnedMailIds`) – familienweit eine gemeinsame Liste, analog zum Scratchpad.
Items ohne gespeicherte Position landen ans Ende, in ihrer ursprünglichen
Reihenfolge.
A: Pro Nutzer (nicht familienweit) – analog zum bereits per-user persistierten
Scratchpad (subscribeToScratchpad(fid, user.uid, ...)).

----
Q: Soll die manuelle Sortierung NUR für die "Ohne Termin"-Gruppe gelten (Mail/
Geteilte Liste/Geistesblitze), oder soll man später auch Tasks/Termine/Kind-
Aufgaben innerhalb ihrer Zeitgruppe (Überfällig/Heute/Morgen) manuell umsortieren
können?
Empfehlung: Für v1 nur "Ohne Termin" – Überfällig/Heute/Morgen bleiben
automatisch sortiert (Kategorie-Priorität + wichtig-zuerst), da dort Datum/
Uhrzeit schon eine sinnvolle natürliche Ordnung vorgibt.
A: Überall manuell sortierbar (auch Überfällig/Heute/Morgen), nicht nur "Ohne Termin".

----
Q: Wie wird die Reihenfolge bedient – per Drag-Handle (Long-Press + Ziehen) wie
man es von Listen-Apps kennt, oder über einfache Auf/Ab-Pfeile pro Item (einfacher
auf Touch/Web, aber weniger "natürlich")?
Empfehlung: Drag-Handle (Long-Press), da React Native mit `react-native-draggable-flatlist`
o. ä. das stabil unterstützt und es sich am natürlichsten anfühlt; Auf/Ab-Pfeile
nur als Fallback für Web, falls Drag dort hakt.
A: Drag-Handle / Long-Press-Ziehen.

----
Q: Wenn überall (auch in Überfällig/Heute/Morgen) manuell sortiert werden darf:
darf man ein Item per Drag in eine ANDERE Zeitgruppe ziehen (z. B. von "Heute"
nach "Ohne Termin"), wodurch es implizit "entschärft" würde ohne das Fälligkeits-
datum zu ändern – oder bleibt Drag nur INNERHALB der eigenen Zeitgruppe (Reihen-
folge innerhalb von Überfällig/Heute/Morgen/Ohne Termin je separat sortierbar)?
Empfehlung: Nur innerhalb der eigenen Zeitgruppe ziehen lassen. Cross-Gruppen-Drag
würde verwirren, da es so aussieht als hätte sich das Fälligkeitsdatum geändert,
obwohl nur die Anzeige-Position sich ändert – Datenmodell und UI würden auseinanderlaufen.
A: Nur innerhalb der eigenen Zeitgruppe.

----
Q: Wie wird die pro-Nutzer-Reihenfolge technisch abgelegt? Vorschlag: ein neues
Firestore-Dokument/Feld analog zum Scratchpad, z. B.
`users/{uid}/feedOrder` mit `{ [groupKey]: string[] }` (Liste von
`category:id`-Schlüsseln je Zeitgruppe), live synchronisiert wie der Notizblock
(`subscribeToScratchpad`-Pattern) inkl. Debounced-Save nach Drag-Ende.
Passt das, oder soll die Reihenfolge lokal (nur auf dem Gerät, kein Firestore-
Sync zwischen Geräten) gespeichert werden?
Empfehlung: Firestore pro Nutzer wie vorgeschlagen – synct zwischen den Geräten
des gleichen Nutzers, analog zum bestehenden Scratchpad-Pattern.
A: Firestore pro Nutzer, live-sync (analog Scratchpad-Pattern), debounced Save
nach Drag-Ende.

----

## Zusammenfassung (Stand 2026-06-16)

Neuer Dashboard-Block `feed` ("Mein Tag"), additiv neben den bestehenden Blöcken,
standardmäßig AUS, einzeln togglebar in Settings (DASHBOARD_BLOCKS).

Inhalt: Tasks, Kinder-Aufgaben, Mail (angepinnt/ungelesen), Kalender-Termine,
Geburtstage, Geteilte-Liste-Einträge, Countdowns, Geistesblitze, offenes
Taschengeld pro Kind (Icon `cash-outline`, Gruppe "Ohne Termin") – alle als
einheitliche Item-Liste, je mit einem dezenten, grauen (textMuted) Icon zur
Kategorie-Kennzeichnung (Checkbox/Mail/Kalender/Kuchen/Personen/Glühbirne/Liste),
keine Farbcodierung außer Text-Hervorhebung für wichtig/überfällig.

Gruppierung: Überfällig / Heute / Morgen / Ohne Termin (wie bestehender
Tasks-Block), darin automatisch nach Kategorie-Priorität + wichtig-zuerst,
ZUSÄTZLICH manuell per Drag-Handle (Long-Press) umsortierbar – innerhalb der
jeweiligen Zeitgruppe, kein Cross-Gruppen-Drag. Reihenfolge wird pro Nutzer in
Firestore persistiert (live-sync, analog Scratchpad), debounced Save nach
Drag-Ende; Items ohne gespeicherte Position landen ans Ende in automatischer
Reihenfolge.

Kein Limit pro Kategorie (auch volle Mail-Listen etc. werden ganz angezeigt).
Kein Direkt-Abhaken in v1 – nur Tippen → Navigation zum jeweiligen Screen.
Kein Blink-Verhalten – bewusst ruhige/dezente Optik.

Layout: Feed nimmt volle Breite ein, ersetzt den heutigen Tasks+Notizblock-
Bereich an dieser Stelle (nach Geburtstage/Wetter/Sync-Zeile). Notizblock bleibt
als eigener, unabhängiger Block mit eigenem Toggle und erscheint – falls aktiv –
direkt unterhalb des Feeds. Wetter/Links bleiben unverändert eigene Blöcke ohne
Feed-Items (keine diskreten Items). Geistesblitze und Geteilte Liste bleiben
zusätzlich als eigene Blöcke bestehen, auch wenn ihre Inhalte zugleich im Feed
auftauchen.

Offene Punkte für die Umsetzung (nicht mehr Design-Fragen, sondern Implementierung):
- Stabiler Item-Key je Kategorie definieren (`task:<id>`, `kidTask:<childId>:<id>`,
  `mail:<id>`, `calendar:<id>`, `birthday:<contactId>`, `sharedList:<itemId>`,
  `countdown:<id>`, `idea:<id>`).
- Firestore-Schema für `feedOrder` (pro Nutzer, pro Zeitgruppe ein Array von Keys).
- Drag-Lib-Wahl (react-native-draggable-flatlist o. ä.), Web-Fallback prüfen.
- Neuer `DashboardBlockKey` Eintrag `feed` in `src/types/index.ts`
  (DASHBOARD_BLOCKS, DEFAULT_DASHBOARD_BLOCKS) + Settings-Eintrag.

----
Q: Nachträglicher Wunsch: "Taschengeld offen" soll auch im Feed auftauchen.
Laut Code (`services/allowance.ts`, `KindScreen.tsx`, TE-52/53) ist "offen" =
ein Kind hat den Erhalt seines monatlichen Taschengelds für den aktuellen Monat
noch nicht bestätigt (`allowanceMonths[aktuellerMonat]?.received !== true`),
und ein Betrag > 0 ist konfiguriert. Es gibt kein Tages-/Fälligkeitsdatum,
nur einen Monat. Soll dafür pro Kind ein Item erscheinen (z. B. "Taschengeld
Juni 2026 · Mia · 10 €"), in der Gruppe "Ohne Termin" (da kein Tagesdatum,
nur Monat), mit eigenem Icon (💶 / Ionicons "cash-outline")? Und: ist das fürs
Eltern-Dashboard gedacht (damit Eltern sehen, wer noch nicht bestätigt hat) oder
soll es nur erscheinen, wenn man selbst das betroffene Kind ist?
Empfehlung: Pro Kind mit konfiguriertem Betrag > 0 und unbestätigtem aktuellem
Monat ein Item in "Ohne Termin", Icon `cash-outline`, Text z. B. "Taschengeld
{Kind} · {Betrag} · {Monat}". Erscheint im (Eltern-)Dashboard für alle Kinder,
deren Taschengeld offen ist – analog zur bestehenden "Aufgaben der Kinder"-Karte,
die ja auch Status aller Kinder zusammenfasst, nicht nur des eigenen Kindes.
A: Ja, pro Kind in "Ohne Termin" mit Icon `cash-outline`, analog zur bestehenden
Kinder-Aufgaben-Karte für alle Kinder im Eltern-Dashboard.
