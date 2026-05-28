---
title: Bild- und Datei-Upload zu Tasks hinzufügen
task: TE-3
created: 2026-05-28T08:51
---

## Umgesetzt in

- `src/components/AttachmentPreview.tsx` — Grid für Bilder, Liste für Dokumente
- `src/screens/CreateTaskScreen.tsx` — Anhänge beim Anlegen hinzufügen
- `src/screens/TaskDetailScreen.tsx` — Anhänge nachträglich hinzufügen/entfernen
- `src/types/index.ts` — `Attachment` Typ
- `src/store/index.ts` — `addAttachment`, `removeAttachment`

## Features

- Foto aufnehmen (Kamera) oder aus Galerie wählen via `expo-image-picker`
- Dokumente wählen via `expo-document-picker` (beliebiger MIME-Typ)
- Mehrfachauswahl bei Galerie und Dokumenten
- Bildvorschau als horizontale Scroll-Gallery (80×80px Thumbnails)
- Dokumente als Listeneinträge mit Name + Dateigröße
- Entfernen per X-Button
- Permissions-Handling mit freundlicher Fehlermeldung

## Berechtigungen

- iOS: `NSPhotoLibraryUsageDescription`, `NSCameraUsageDescription` in app.json
- Android: `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `CAMERA` in app.json
