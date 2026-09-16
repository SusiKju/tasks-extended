# Artefakt-App (Claude-Artefakte 1:1 in eigene Web-App übernehmen)

Kontext (aus Chat): Neue, parallel zu `tasks-extended` gehostete App (GitHub Pages), gleicher Stil
(Google-Login, Firestore). Ein Claude-Code-Skill soll auf Zuruf ein aktuelles Claude-Artefakt 1:1
als neue Seite/Route in diese App übernehmen und bei Weiterentwicklung des Artefakts ein Update
dorthin pushen können. Menü zeigt alle vorhandenen Artefakt-Seiten, Klick führt zur Seite. Nutzer
möchte pro Seite entscheiden können, ob sie öffentlich oder privat (nur er, per Google-Login) ist.

----
Q: GitHub Pages kennt keinen Pfad-genauen Zugriffsschutz — eine Pages-Seite ist entweder komplett
öffentlich abrufbar (Free-Plan, was bei einem öffentlichen Repo sowieso der Fall ist) oder das ganze
Pages-Deployment ist privat und verlangt einen eingeloggten GitHub-Account mit Repo-Zugriff (braucht
GitHub Pro/Team, kein Google-Login, kein Pro-Seite-Schalter). "Manche Seiten öffentlich, manche
privat mit Google-Login, individuell pro Seite" lässt sich also nicht auf Hosting-Ebene lösen,
sondern nur auf App-Ebene: Der HTML/JS-Code aller Seiten liegt öffentlich auf GitHub Pages (das ist
nur Layout/Logik, keine Daten), aber bei als "privat" markierten Artefakten dürfen keine echten Werte
(Kontostände, Familientermine etc.) im HTML/JS eingebettet sein — die Seite lädt ihre Daten stattdessen
zur Laufzeit aus Firestore nach, abgesichert durch Firestore-Rules, die nur deine Google-UID
durchlassen (exakt das Muster, das `tasks-extended` schon für Aufgaben nutzt). Das bedeutet: Für als
privat markierte Artefakte ist "1:1 wie von Claude" nicht mehr wörtlich (Bit für Bit) erfüllbar — der
Übernahme-Skill müsste die im Original-Artefakt eingebetteten Daten beim Import herausziehen und nach
Firestore verschieben; optisch/funktional bleibt die Seite aber 1:1. Öffentliche Artefakte hingegen
können unverändert (Daten inklusive) kopiert werden.
Alternative: bezahlter Host mit echtem Zugriffsschutz auf Byte-Ebene (z.B. GitHub Pro für privates
Pages-Repo, oder Firebase Hosting + Cloud Function/App Check vor den Dateien) — dort bleiben auch
private Seiten wörtlich 1:1 inklusive eingebetteter Daten, kostet aber zusätzliche Infrastruktur/Geld
statt der bestehenden kostenlosen Kombination GitHub Pages + Firestore.
Empfehlung: erstes Modell (öffentlicher Code, Daten privater Artefakte wandern in Firestore statt im
HTML zu stehen) — nutzt ausschließlich, was schon kostenlos vorhanden und in `tasks-extended` erprobt
ist.
A: "Ok, ich möchte, dass es nicht public ist. Wir machen alles auf Account-Ebene, also man muss sich
anmelden mit dem Gmail-Account, und ich möchte bestimmen, wer es sehen darf. Das machen wir in
Firestore." — d.h. kein Artefakt ist ohne Login sichtbar (kein "öffentlich"-Modus mehr), Zugriff ist
kein reines Ja/Nein "nur ich", sondern eine von ihm bestimmbare Freigabe pro Artefakt (Personenkreis),
abgebildet in Firestore.
----

----
Q: Da jetzt jedes Artefakt grundsätzlich zugriffsbeschränkt ist (kein Public-Modus), stellt sich die
Frage nach der Granularität der Freigabe. `tasks-extended` hat bereits ein Familien-/Gruppen-Mitglied-
schaftsmodell (siehe `groups.tsx`, `family-setup.tsx`, Drill-Thema `multi-tenant-familienapp`) — dort
werden Nutzer per Google-UID/Familien-ID Gruppen zugeordnet. Zwei Wege:
(a) Freigabe pro Artefakt als Liste konkreter Personen (Google-UIDs/E-Mails), die du beim Import oder
später frei bearbeitest — z.B. "Vermögensübersicht: nur ich", "Wachstumskurven: ich + Diana". Feingranular,
aber jedes Artefakt-Dokument braucht ein eigenes Zugriffsfeld.
(b) Freigabe über feste Rollen/Gruppen (z.B. "nur ich" vs. "Familie") wie im bestehenden
Familien-Modell von `tasks-extended` — weniger flexibel pro Artefakt, dafür Wiederverwendung der
vorhandenen Gruppenlogik/Firestore-Struktur statt einer neuen Freigabe-Logik.
Reicht auch die Frage, ob die neue App dasselbe Firebase-Projekt (und damit dieselben Google-Konten/
Gruppen) wie `tasks-extended` nutzt, oder ein eigenes, komplett getrenntes Firebase-Projekt bekommt.
Empfehlung: (a) freie Personenliste pro Artefakt-Dokument in Firestore (Feld `allowedUids: string[]`,
Default `[deine UID]`) — flexibler als starre Rollen und trotzdem simpel; dabei **dasselbe
Firebase-Projekt** wie `tasks-extended` weiterverwenden (Diana & Co. haben dort schon Google-Konten/
UIDs hinterlegt, keine doppelte Nutzerverwaltung nötig), nur eine neue Top-Level-Collection
(`artefakte`) darin anlegen.
A: "a" — freie Personenliste (`allowedUids`) pro Artefakt-Dokument, inkl. Wiederverwendung desselben
Firebase-Projekts wie `tasks-extended` (war Teil der empfohlenen Option a).
----

----
Q: Größte noch offene Weichenstellung: der Tech-Stack der neuen App selbst. `tasks-extended` ist eine
Expo/React-Native-Web-App mit Tab-Navigation (`app/(tabs)/*.tsx`) — jede Seite ist eine React-Native-
Komponente, kein rohes HTML/CSS. Ein Claude-Artefakt ist dagegen meist eigenständiges HTML/CSS/
(Vanilla- oder CDN-)JS. Zwei Wege für "genau in diesem Stil" (GitHub Pages + Google-Login + Firestore):
(a) **Plain static Multi-Page-Site** (kein Expo/React Native): eigenes, schlankes Repo mit einer
Login-Seite (Firebase-Auth-SDK per npm/CDN, Google-Provider) + einer Menü-Seite, die aus einer
Firestore-Collection `artefakte` liest, welche Seiten für dich freigegeben sind + wohin sie zeigen.
Jedes übernommene Artefakt landet unverändert als eigener Ordner (`artefakte/<slug>/index.html` +
Assets) — echtes 1:1, der Übernahme-Skill kopiert im Kern nur Dateien und trägt einen Menüeintrag in
Firestore ein. Style/Login/Menü sind eigenständig, keine Verwandtschaft zum RN-Code von
`tasks-extended` nötig.
(b) **Expo/React-Native-Web-App wie `tasks-extended`**: jedes Artefakt müsste als RN-Screen
nachgebaut oder per WebView/iframe eingebettet werden (in RN-Web funktioniert `iframe` nur eingeschränkt
und fühlt sich nicht "nativ" an) — verwässert "1:1" erheblich und macht den Übernahme-Skill viel
aufwendiger, weil er bei jedem Import HTML/CSS/JS in RN-Code übersetzen müsste.
Empfehlung: (a) — plain static Site. Das erfüllt "1:1 wie von Claude" wörtlich, macht den
Übernahme-Skill trivial (Dateien kopieren + Firestore-Eintrag), und "genau in diesem Stil" bezieht
sich vermutlich auf Hosting/Login/Firestore, nicht zwingend auf Expo/React Native als Framework.
A: "a" — plain static Multi-Page-Site, kein Expo/React Native.
----

----
Q: Repo-Name und damit die GitHub-Pages-URL (`susikju.github.io/<repo>/`). Im Chat vorher schon
angerissen (Ablehnung von "Artifact App" als Name, da zu Claude-Terminologie-nah), Vorschläge waren
u.a. `redmann-dashboard`, `susikju-hub`, `familien-app`.
Empfehlung: `susikju-hub` — kurz, an den bestehenden GitHub-Namensraum (`SusiKju/tasks-extended`)
angelehnt, nicht an Claude-Begriffe gebunden, lässt inhaltlich auch spätere andere Auswertungen (nicht
nur Artefakte) zu, ohne dass der Name dann falsch klingt.
A: ?
----

----
Q: Update-Verhalten, wenn ein bereits übernommenes Artefakt sich weiterentwickelt hat und der Skill
erneut mit derselben Artefakt-URL aufgerufen wird. Der Skill erkennt anhand der in Firestore
gespeicherten `sourceUrl` je Artefakt-Dokument, dass es sich um ein Update statt eines Neuimports
handelt, überschreibt den vorhandenen Ordner `artefakte/<slug>/` mit dem neuen Stand und committet.
Zwei Wege, wie der Commit ins Repo kommt:
(a) **Direkter Push auf `main`** — wie im bestehenden Deployment-Muster von `tasks-extended`
("Push nach main löst automatisch `.github/workflows/deploy.yml` aus"), GitHub Pages baut sofort neu.
(b) **Branch + Pull Request**, den du erst manuell mergen musst, bevor die Seite live aktualisiert wird.
Empfehlung: (a) — Repo ist nur für dich, jede Änderung bleibt per `git revert` rückgängig machbar, ein
PR-Zwischenschritt wäre bei einem Single-User-Repo reine Reibung ohne echten Nutzen.
A: "susikju-hub" (Repo-Name) — "und direkter push" (Update-Verhalten a).
----

----
Q: Verhältnis zwischen dem Original-Claude-Artefakt und der übernommenen Kopie in `susikju-hub`, und
Rückwirkung auf `artefakte.md` in der Wissensdatenbank (dort ist laut `CLAUDE.md` aktuell die
verbindliche Liste aller Artefakte samt URL gepflegt, "Neue Artefakte... gehören in diese Datei").
Zwei Aspekte hängen zusammen:
(1) Nach der Übernahme in `susikju-hub`: wird `susikju-hub` ab sofort die **alleinige aktive Kopie**
(künftige Änderungen/Interaktionen — z. B. Lesestatus im Bücherregal ankreuzen — passieren nur noch
dort, das Original-Claude-Artefakt bleibt als eingefrorener Ausgangspunkt bestehen, wird aber nicht
mehr weiter gepflegt)? Oder sollen beide Kopien parallel weitergepflegt und bei jeder Änderung
synchron gehalten werden (mehr Aufwand, doppelte Pflege, Divergenz-Risiko)?
(2) Soll der Übernahme-Skill nach einem Import/Update automatisch die passende Zeile in `artefakte.md`
aktualisieren (URL auf `susikju-hub` umbiegen bzw. ergänzen, Vermerk "migriert am ...", ggf. Original-
URL als Historie stehen lassen), damit `artefakte.md` weiterhin die eine verbindliche Übersicht bleibt
und nicht zwei parallele, unabhängig gepflegte Register entstehen (`artefakte.md` vs. Firestore-
Collection `artefakte` in `susikju-hub`)?
Empfehlung: (1) `susikju-hub` wird ab Übernahme die alleinige aktive Kopie, Original-Artefakt = reines
Backup/Ursprungsreferenz, keine Parallelpflege. (2) Ja, der Skill schreibt die aktualisierte
`susikju-hub`-URL automatisch in die passende Zeile von `artefakte.md` (Spalte "URL" ersetzen oder
ergänzen + Datum), damit es weiterhin nur eine verbindliche Fundstelle gibt.
A: "susikju-hub Löst artefakte ab, muss aber immer synchron gehalten werden mit dem Markdown-File in
der Wissensdatenbank. Der Skill muss synchronisieren können zwischen Markdown-File und susikju-hub.
Das Skill muss Artifacts zu susikju-hub exportieren können." — d.h. präziser als meine Empfehlung:
`susikju-hub` ersetzt Claude-Artefakte als aktive Plattform, aber es braucht zwei getrennte
Skill-Fähigkeiten: (1) **Export** — ein Claude-Artefakt neu nach `susikju-hub` übernehmen, (2)
**Sync** — laufend zwischen den fachlichen Markdown-Dateien der Wissensdatenbank (z. B.
`finanzen-anlagen.md`, `buecherbibliothek.md`) und `susikju-hub`s Firestore-Daten synchron halten,
nicht nur einmalig beim Import die URL in `artefakte.md` nachtragen.
----

----
Q: Mechanik der laufenden Sync-Fähigkeit — zwei Teilfragen, die zusammenhängen:
(1) **Richtung/Auslöser:** In `tasks-extended` gibt es dafür schon ein Vorbild
(`scripts/sync-bambini-to-wissensdatenbank.mjs`): Firestore → Markdown, aber laut README "nicht über
GitHub Actions, da das Zielverzeichnis ein lokal gemountetes Google-Drive-Verzeichnis ist, kein Repo
— daher manuell bzw. per lokalem Cron/launchd ausführen." Die andere Richtung (Markdown → Firestore)
entspricht genau der schon bestehenden `CLAUDE.md`-Regel "bei jeder inhaltlichen Änderung... auch das
zugehörige Artefakt erneut veröffentlichen" — das ließe sich erweitern: sobald in einer laufenden
Chat-Session (mit Arbeitsverzeichnis Wissensdatenbank) eine der über `susikju-hub` verknüpften
Markdown-Dateien geändert wird, schreibt derselbe Skill-Aufruf die geänderten Werte direkt in die
Firestore-Collection von `susikju-hub` mit — ohne gesonderte Rückfrage, weil es nur ein Schreibzugriff
auf deine eigene private Datenbank ist (gleiches Risikoprofil wie das bisherige lokale Markdown-Edit).
Für Änderungen, die umgekehrt zuerst in `susikju-hub` selbst passieren (z. B. Lesestatus im
Bücherregal anklicken), bräuchte es weiterhin einen separaten, manuell/lokal per Cron laufenden Sync
zurück nach Markdown — analog zum Bambini-Skript, da GitHub Actions die Wissensdatenbank nicht
erreicht.
(2) **Zugangsdaten:** Der `susikju-hub`-Firebase-Service-Account (analog `serviceAccount.json` in
`tasks-extended`, dort schon `.gitignore`t) darf laut den Konventionen der Wissensdatenbank
("Zugangsdaten werden in Bitwarden gepflegt, nie Klartext in der Wissensdatenbank") nicht in die
Wissensdatenbank kopiert werden. Er müsste stattdessen an einem lokalen Pfad außerhalb des
Google-Drive-Ordners liegen (z. B. im `susikju-hub`-Repo-Ordner selbst, gitignored), auf den der Sync-
Skill per festem Pfad zugreift, auch wenn die Session gerade in der Wissensdatenbank arbeitet.
Empfehlung: (1) Markdown→Firestore automatisch/inline bei jeder Faktenänderung während einer
Chat-Session (Erweiterung der bestehenden Republish-Regel), Firestore→Markdown weiterhin als
manuell/lokal per Cron laufendes Skript nach bestehendem Bambini-Vorbild. (2) Service-Account-Datei
bleibt außerhalb der Wissensdatenbank (im `susikju-hub`-Repo, gitignored), nur der Pfad dazu wird
referenziert.
A: "Am besten per ENV-Datei die Daten ablegen und nicht committen." — präzisiert Teil (2): Firebase-
Zugangsdaten/Service-Account als `.env`-Datei (gitignored, analog zu `EXPO_PUBLIC_GOOGLE_CLIENT_ID` in
`tasks-extended`), nicht als eingecheckte JSON-Datei. Teil (1) (Sync-Richtungen/Auslöser) unwidersprochen
wie empfohlen übernommen.
----

----
Q: Rollout-Reihenfolge — es gibt aktuell 7 Einträge in `artefakte.md`. Soll der Export-Skill von Anfang
an **beliebige** Artefakte einzeln übernehmen können (du rufst ihn pro Artefakt-URL auf, fängst z. B.
mit der Bücherwand an, wie im Chat als Beispiel genannt), oder soll er von Anfang an auch einen
**Batch-Modus** beherrschen (alle 7 bestehenden Einträge aus `artefakte.md` in einem Rutsch
importieren)? Das beeinflusst, wie viel Skill-Logik gleich beim ersten Bau nötig ist.
Empfehlung: zuerst nur Einzel-Import (ein Artefakt pro Aufruf, per URL oder per Verweis auf die Zeile
in `artefakte.md`) — Bücherwand als erster Testlauf, weil sie schon im Chat als Beispiel genannt wurde
und zusätzlich den komplexesten Fall abdeckt (Assets + eigene Artefakt-Datenbank). Batch-Import für die
restlichen 6 lässt sich danach ohne Architekturänderung ergänzen, sobald der Einzel-Fall bewährt ist —
kein Grund, das vorwegzunehmen.
A: "passt so, einzeln zuerst mit Bücherwand"
----

## Zusammenfassung (Design steht)

- Kein öffentlicher Modus: jede Seite verlangt Google-Login; Zugriff pro Artefakt über eine freie
  Personenliste (`allowedUids`) in Firestore, Default nur Matthias.
- Gleiches Firebase-Projekt wie `tasks-extended` (bestehende Google-Konten/UIDs der Familie
  wiederverwenden), neue Top-Level-Collection `artefakte`.
- Neue App = eigenes Repo `susikju-hub`, **plain static Multi-Page-Site** (kein Expo/React Native):
  Login-Seite (Firebase-Auth, Google-Provider), Menü-Seite aus Firestore, pro Artefakt ein eigener
  Ordner `artefakte/<slug>/` mit dem 1:1 übernommenen HTML/CSS/JS (+ Assets). Bei als privat
  eingestuften Artefakten keine echten Daten im HTML/JS einbetten, sondern zur Laufzeit aus Firestore
  laden (Firestore-Rules prüfen `request.auth.uid` gegen `allowedUids`).
- Deployment: direkter Push nach `main`, GitHub Pages baut automatisch (wie bei `tasks-extended`).
- `susikju-hub` löst Claude-Artefakte als aktive Plattform ab, `artefakte.md` bleibt aber die
  verbindliche Übersicht und wird laufend synchron gehalten, nicht nur einmalig verlinkt. Der Skill
  braucht zwei Fähigkeiten:
  - **Export**: ein Claude-Artefakt neu nach `susikju-hub` übernehmen.
  - **Sync**: Markdown → Firestore automatisch/inline bei Faktenänderungen während einer Chat-Session
    in der Wissensdatenbank (Erweiterung der bestehenden Republish-Regel aus `CLAUDE.md`); Firestore →
    Markdown weiterhin als separates, manuell/per Cron laufendes Skript (Vorbild:
    `sync-bambini-to-wissensdatenbank.mjs`), da GitHub Actions den Google-Drive-Ordner nicht erreicht.
- Zugangsdaten (Firebase-Service-Account) als `.env`-Datei, gitignored, nicht committet, nicht in der
  Wissensdatenbank abgelegt.
- Rollout: erst Einzel-Import (ein Artefakt pro Aufruf), Bücherwand als ersten Testlauf, weil sie
  Assets + eigene Artefakt-Datenbank gleichzeitig abdeckt. Batch-Import für die übrigen 6 Artefakte
  später, ohne Architekturänderung.

