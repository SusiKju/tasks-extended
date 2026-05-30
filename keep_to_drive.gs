// Google Apps Script: Keep → Drive Sync
// Speicherort: script.google.com → Neues Projekt → diesen Code einfügen
// Dann: Ausführen → syncKeepToDrive (einmalig zur Autorisierung)
// Danach: Trigger → täglich automatisch ausführen

const FOLDER_NAME = 'Tasks-Extended';

function getOrCreateFolder() {
  const existing = DriveApp.getFoldersByName(FOLDER_NAME);
  if (existing.hasNext()) return existing.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

function syncKeepToDrive() {
  const folder = getOrCreateFolder();
  const notes = KeepApp.getNotes();

  // Bestehende Dateien im Ordner indexieren
  const existingFiles = {};
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    existingFiles[f.getName()] = f;
  }

  const syncedIds = new Set();

  for (const note of notes) {
    if (note.isTrashed()) continue;

    const id = note.getId();
    const title = note.getTitle() || 'Notiz';
    const text = note.getText() || '';
    const pinned = note.isPinned();
    const labels = note.getLabels().map(l => l.getName());

    // Checkliste extrahieren
    let checklist = null;
    const listItems = note.getList ? note.getList() : null;
    if (listItems) {
      checklist = listItems.getListItems().map(item => ({
        text: item.getText(),
        checked: item.isChecked(),
      }));
    }

    const payload = {
      id,
      title,
      content: text,
      checklist,
      pinned,
      labels,
      color: '#F0C040',
      updatedAt: note.getUpdated().toISOString(),
      createdAt: note.getCreated ? note.getCreated().toISOString() : new Date().toISOString(),
      source: 'google-keep',
    };

    const filename = `keep_${id}.json`;
    const json = JSON.stringify(payload, null, 2);

    if (existingFiles[filename]) {
      existingFiles[filename].setContent(json);
    } else {
      folder.createFile(filename, json, MimeType.PLAIN_TEXT);
    }

    syncedIds.add(filename);
  }

  // Gelöschte Keep-Notizen aus Drive entfernen
  for (const [name, file] of Object.entries(existingFiles)) {
    if (name.startsWith('keep_') && !syncedIds.has(name)) {
      file.setTrashed(true);
    }
  }

  console.log(`✅ ${syncedIds.size} Keep-Notizen synchronisiert.`);
}

// Täglichen Trigger einrichten (einmalig aufrufen)
function createDailyTrigger() {
  ScriptApp.newTrigger('syncKeepToDrive')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();
  console.log('Trigger erstellt: täglich 07:00 Uhr');
}
