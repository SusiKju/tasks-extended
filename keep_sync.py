#!/usr/bin/env python3
"""
Google Keep ↔ tasks-extended Sync
----------------------------------
Voraussetzungen:
  pip install google-auth-oauthlib google-api-python-client

Erste Ausführung:
  python keep_sync.py
  → Browser öffnet sich für OAuth-Login → Token wird gespeichert

Danach:
  python keep_sync.py          # beidseitige Sync
  python keep_sync.py --pull   # nur Keep → lokal
  python keep_sync.py --push   # nur lokal → Keep
"""

import os
import json
import re
import argparse
from pathlib import Path
from datetime import datetime, timezone

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# ── Konfiguration ────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent
NOTES_DIR    = SCRIPT_DIR / "keep_notes"          # Zielordner für .md-Dateien
STATE_FILE   = SCRIPT_DIR / ".keep_sync_state.json"
TOKEN_FILE   = SCRIPT_DIR / ".keep_token.json"
CREDS_FILE   = SCRIPT_DIR / "client_secret.json"  # heruntergeladene Credentials

SCOPES = ["https://www.googleapis.com/auth/keep"]
# ─────────────────────────────────────────────────────────────────────────────


def get_credentials() -> Credentials:
    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDS_FILE.exists():
                raise FileNotFoundError(
                    f"client_secret.json nicht gefunden unter: {CREDS_FILE}\n"
                    "Bitte die Datei aus der Google Cloud Console herunterladen."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json())
    return creds


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}  # { keep_id: { "file": "filename.md", "updated": "ISO-timestamp" } }


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False))


def slugify(title: str) -> str:
    """Titel → sicherer Dateiname"""
    slug = re.sub(r"[^\w\s-]", "", title.lower())
    slug = re.sub(r"[\s_]+", "_", slug).strip("-_")
    return slug[:80] or "notiz"


def note_to_md(note: dict) -> str:
    title = note.get("title", "").strip()
    text  = note.get("body", {}).get("text", {}).get("text", "").strip()
    lines = [f"# {title}", ""] if title else []
    lines.append(text)
    return "\n".join(lines)


def md_to_note(content: str) -> dict:
    lines = content.splitlines()
    title, body_lines = "", []
    for i, line in enumerate(lines):
        if line.startswith("# "):
            title = line[2:].strip()
            body_lines = lines[i + 1:]
            break
    else:
        body_lines = lines

    text = "\n".join(body_lines).strip()
    note = {"body": {"text": {"text": text}}}
    if title:
        note["title"] = title
    return note


def pull(service, state: dict):
    """Keep → lokal"""
    NOTES_DIR.mkdir(exist_ok=True)
    print("📥 Lade Notizen von Google Keep …")

    remote_ids = set()
    request = service.notes().list()
    while request:
        response = request.execute()
        for note in response.get("notes", []):
            nid      = note["name"].split("/")[-1]
            remote_ids.add(nid)
            updated  = note.get("updateTime", "")

            # Schon aktuell?
            if nid in state and state[nid].get("updated") == updated:
                continue

            md_content = note_to_md(note)
            title      = note.get("title", "").strip() or f"notiz_{nid[:8]}"
            filename   = slugify(title) + f"_{nid[:8]}.md"

            # Dateiname aus State wiederverwenden wenn vorhanden
            if nid in state:
                filename = state[nid]["file"]

            filepath = NOTES_DIR / filename
            filepath.write_text(md_content, encoding="utf-8")

            state[nid] = {"file": filename, "updated": updated}
            print(f"  ✓ {filename}")

        request = service.notes().list_next(request, response)

    # Gelöschte Keep-Notizen lokal entfernen
    for nid, meta in list(state.items()):
        if nid not in remote_ids:
            old_file = NOTES_DIR / meta["file"]
            if old_file.exists():
                old_file.unlink()
                print(f"  🗑 Gelöscht: {meta['file']}")
            del state[nid]


def push(service, state: dict):
    """lokal → Keep (neue Dateien hochladen)"""
    NOTES_DIR.mkdir(exist_ok=True)
    known_files = {meta["file"] for meta in state.values()}

    print("📤 Lade neue lokale Notizen nach Keep …")
    for md_file in NOTES_DIR.glob("*.md"):
        if md_file.name in known_files:
            continue  # bereits bekannt

        content  = md_file.read_text(encoding="utf-8")
        new_note = md_to_note(content)

        result  = service.notes().create(body=new_note).execute()
        nid     = result["name"].split("/")[-1]
        updated = result.get("updateTime", "")

        state[nid] = {"file": md_file.name, "updated": updated}
        print(f"  ✓ {md_file.name} → Keep ({nid[:8]})")


def main():
    parser = argparse.ArgumentParser(description="Google Keep ↔ Lokal Sync")
    parser.add_argument("--pull", action="store_true", help="Nur Keep → lokal")
    parser.add_argument("--push", action="store_true", help="Nur lokal → Keep")
    args = parser.parse_args()

    creds   = get_credentials()
    service = build("keep", "v1", credentials=creds)
    state   = load_state()

    do_pull = args.pull or (not args.pull and not args.push)
    do_push = args.push or (not args.pull and not args.push)

    if do_pull:
        pull(service, state)
    if do_push:
        push(service, state)

    save_state(state)
    print("\n✅ Sync abgeschlossen.")
    print(f"   Notizen gespeichert in: {NOTES_DIR}")


if __name__ == "__main__":
    main()
