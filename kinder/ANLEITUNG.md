# Einrichtung – Nachrichten von Papa auf Jürgens Handy

## Vorher (einmalig auf deinem PC / Handy)

1. Wähle einen geheimen Topic-Namen, z. B. `papa-juergen-k7x2`
   _(klein, kein Leerzeichen, etwas kryptisch damit niemand zufällig mitlesen kann)_

2. Öffne `kinder/index.html` und ersetze:
   ```
   papa-zu-kind-AENDERE-MICH
   ```
   durch deinen Topic-Namen.

3. Änderung committen & pushen → GitHub Pages baut automatisch.

---

## Einmalige Einrichtung auf Jürgens Handy (du sitzt dabei, ~3 Min.)

### Schritt 1 – Chrome freigeben (temporär oder dauerhaft via Family Link)
- Öffne **Google Family Link** auf deinem Handy
- Tippe auf Jürgens Profil → **Einstellungen** → **Inhaltsfilter für Google Chrome**
- Wähle: **Nur bestimmte Websites zulassen**
- Füge `susikju.github.io` hinzu → Speichern

### Schritt 2 – Seite öffnen und als App speichern
- Auf Jürgens Handy Chrome öffnen
- URL eingeben: `https://susikju.github.io/tasks-extended/kinder`
- Oben rechts **⋮ Menü** → **"Zum Startbildschirm hinzufügen"**
- Name lassen oder auf „Papa" ändern → **Hinzufügen**

### Schritt 3 – Benachrichtigungen erlauben
- Die App (jetzt auf dem Startbildschirm) öffnen
- Auf den blauen Knopf **„Benachrichtigungen erlauben"** tippen
- Im Browser-Dialog auf **„Zulassen"** tippen
- Grüne Meldung erscheint ✅ → fertig!

### Schritt 4 – Chrome wieder sperren (optional)
- Zurück in Family Link → Chrome-Einstellungen
- Auf **„Alle Websites sperren"** oder wieder den alten Stand herstellen
- Die Benachrichtigungen funktionieren **weiterhin**, auch wenn Chrome gesperrt ist

---

## Nachrichten senden (du, jederzeit)

**Option A – ntfy-App (empfohlen)**
- Installiere „ntfy" aus dem Play Store / App Store auf deinem Handy
- Topic eingeben: `papa-juergen-k7x2` (dein gewählter Name)
- Nachricht tippen → Senden → Jürgen bekommt sofort eine Benachrichtigung

**Option B – Browser**
- Öffne: `https://ntfy.sh/papa-juergen-k7x2`
- Text eingeben → auf das Senden-Symbol tippen

**Option C – Kommandozeile**
```bash
curl -d "Abendessen ist fertig!" ntfy.sh/papa-juergen-k7x2
```

---

## Wie die Benachrichtigung aussieht

- Erscheint wie eine normale App-Benachrichtigung oben im Statusbalken
- Titel: „Nachricht von Papa" (oder was du eingibst)
- Chrome muss **nicht geöffnet** sein
- Funktioniert auch wenn das Handy gesperrt ist (Sperrbildschirm)
