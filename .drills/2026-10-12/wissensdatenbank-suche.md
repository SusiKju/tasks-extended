# Wissensdatenbank in Tasks Extended abfragen

_Stand: 2026-10-12 — Status: **zurückgestellt**, nicht umgesetzt._

## Idee

In der App eine Frage stellen → Antwort kommt aus der Wissensdatenbank
(`~/Meine Ablage/Wissensdatenbank`, Google Drive), knapp präsentiert, als **eigene Dashboard-Karte**.

## Bestandsaufnahme

- Wissensdatenbank: 49 Dateien, 40 `.md` mit zusammen ~334 KB (~90k Tokens).
- Dazu `familie/stammbaum-personen.tsv` + `stammbaum-familien.tsv` (~240 KB): GEDCOM-Rohdaten
  (1.930 Personen, 787 Familien) vom 24.07.2026, regenerierbar aus `Backup_Redmann/stammbaum/…/*.ged`.
  Für Alltagsfragen nicht nötig → beim Laden weglassen. Löschen wäre unkritisch, dann aber Verweise in
  `stammbaum.md`, `CLAUDE (1).md`, `eltern-und-familie.md` anpassen.
- `artefakte.md` = Index aller Artefakte mit URL → Treffer können auf Artefakte verlinken.
- App: kein LLM eingebunden. Google-Scope nur `drive.metadata.readonly` (`src/services/googleCalendar.ts`).

## Entscheidung: ohne KI

KI-Variante (Cloud Function + Claude-API) verworfen: **API wird separat vom claude.ai-Abo bezahlt**
(console.anthropic.com, Prepaid). Grobe Kosten bei ~90k Tokens Kontext pro Frage:
Haiku 5.5 ~1 ct, Sonnet 5.5 ~18–22 ct, Opus 5.5 ~36–45 ct. User will keine Zusatzkosten.

## Geplante Umsetzung (wenn wieder aufgegriffen)

**Volltextsuche, rein im Client, kostenlos:**

1. App lädt die `.md`-Dateien direkt aus Drive mit dem vorhandenen Google-Token
   (kein Server, keine Cloud Function). Ordner per Name `Wissensdatenbank` finden, rekursiv `.md` holen.
2. Neuer Scope `drive.readonly` → einmal Google trennen + neu anmelden
   (siehe Memory „Google-Scope braucht Neu-Login“).
3. Dateien an Überschriften (`#`, `##`, `###`) in Abschnitte schneiden.
4. Suche: alle Suchwörter müssen im Abschnitt vorkommen, case-/umlaut-insensitiv;
   Top 3–5 Treffer mit Datei + Überschrift + Textausschnitt.
5. Links in Treffern (z. B. Artefakt-URLs) antippbar.
6. Zugriffsschutz automatisch: nur Matthias' Google-Konto kann den Drive lesen; Kinder-Konten nicht.
   Karte nur zeigen, wenn Google verbunden.

**Grenze:** keine ausformulierte Antwort, nur Fundstellen. Stichworte („Frankenberg Rate“) statt Fragen.

**Optional:** Button „In Claude fragen“ → öffnet claude.ai mit der Frage (Abo bezahlt, Claude liest
Wissensdatenbank über Drive-Connector). Ungeprüft, ob claude.ai eine Frage per URL vorausfüllen lässt.
