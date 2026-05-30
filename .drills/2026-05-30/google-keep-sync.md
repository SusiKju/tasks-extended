# Google Keep Sync – Problemanalyse

## Kontext
Nutzer möchte Notizen mit Google Keep synchronisieren. Google Workspace-Nutzer. 
In der Google Console ist keine Organisation sichtbar. 
Wurde angewiesen, die Zielgruppe auf "intern" zu setzen, hat aber keine Rechte dafür.

----
Q: Welche App oder welches Tool soll mit Google Keep synchronisiert werden?
A: tasks-extended App-Ordner ist importiert (lokale App in Cowork).

----
Q: Bist du der Workspace-Admin deiner Organisation?
A: Unklar – Admin-Seite ist aufrufbar, aber manche Rechte fehlen. Wahrscheinlich kein Super-Admin.

----
Q: Was siehst du in der Google Cloud Console?
A: Ein Projekt vorhanden, aber keine Organisation darüber.

----
Q: Geht es beim "intern"-Problem um den OAuth-Consent-Screen?
A: Ja.

## Diagnose
Das Projekt ist nicht mit einer Workspace-Organisation verknüpft → die Option "Intern" im 
OAuth-Consent-Screen ist deshalb ausgegraut/nicht verfügbar. Nur Projekte innerhalb einer 
verifizierten Workspace-Org können "Intern" setzen.

## Lösungsansätze
- Option A (empfohlen): Consent-Screen auf "Extern" + App im Testmodus lassen → eigene 
  E-Mail als Testnutzer eintragen → funktioniert für persönliche Nutzung ohne Verification.
- Option B: Workspace-Admin bitten, das Cloud-Projekt der Organisation zuzuordnen.
- Option C: Service Account mit Domain-weiter Delegation (nur wenn echter Admin vorhanden).

----
Q: Hast du den OAuth-Consent-Screen bereits auf "Extern" gestellt?
A: Ja.

----
Q: Welche Keep-API-Methode – lesen, schreiben, oder beides?
A: Lesen und Schreiben.

## Nächste Schritte (Lösung)
1. In Cloud Console: Keep API aktivieren
2. OAuth-Credentials (Desktop-App) erstellen → client_secret.json herunterladen
3. Eigene E-Mail als Testnutzer im Consent-Screen eintragen
4. Sync-Skript (Python) mit google-auth + keep-api ausführen
