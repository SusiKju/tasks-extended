/**
 * useAutoReloadOnNewVersion.ts (TE-74)
 *
 * GitHub Pages erlaubt keine eigenen Cache-Header – ein Deploy kann daher
 * lange als gecachtes, altes Bundle im Browser hängen bleiben (bekanntes,
 * wiederkehrendes Problem bei diesem Setup). Fix: bei App-Start und beim
 * Zurückkehren aus dem Hintergrund fragt die App eine garantiert ungecachte
 * `version.json` (git SHA, von .github/workflows/deploy.yml bei jedem Deploy
 * neu geschrieben) ab und vergleicht sie mit der SHA, die im eigenen Bundle
 * steckt (EXPO_PUBLIC_GIT_SHA, zur Build-Zeit eingebacken). Bei Abweichung
 * lädt sich die Seite über eine cache-brechende URL (neuer Query-Parameter)
 * still selbst neu – kein Hinweis, keine Rückfrage nötig.
 *
 * Web-only: auf nativen Builds gibt es weder GitHub Pages noch dieses
 * Cache-Problem.
 */

import { useEffect } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';

const OWN_SHA = process.env.EXPO_PUBLIC_GIT_SHA ?? null;

// TE-47: Eine neue Version wird nicht mehr sofort beim Zurückkehren geladen
// (das wirkte wie ein kompletter Neustart vor den Augen des Users), sondern
// gemerkt und erst dann angewendet, wenn die Seite unsichtbar ist – oder
// direkt beim App-Start, wo ohnehin noch nichts zu sehen ist.
let updatePending = false;

function reloadToNewVersion(): void {
  window.location.replace(`${window.location.pathname}?v=${Date.now()}`);
}

async function checkForNewVersion(): Promise<void> {
  if (!OWN_SHA || updatePending) return; // lokaler Dev-Build ohne CI-SHA – nichts zu vergleichen
  try {
    const res = await fetch(`/tasks-extended/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { sha } = (await res.json()) as { sha?: string };
    if (sha && sha !== OWN_SHA) {
      updatePending = true;
      if (document.visibilityState === 'hidden') reloadToNewVersion();
    }
  } catch {
    // Netzwerkfehler o.ä. – beim nächsten Start/Aufwachen erneut versuchen
  }
}

export function useAutoReloadOnNewVersion(): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // App-Start: noch nichts sichtbar → neue Version direkt laden.
    checkForNewVersion().then(() => { if (updatePending) reloadToNewVersion(); });
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      // Beim Verlassen: anstehendes Update jetzt unsichtbar einspielen.
      if (state !== 'active' && updatePending) reloadToNewVersion();
      if (state === 'active') checkForNewVersion();
    });
    // Auch während die App offen bleibt gelegentlich prüfen (Desktop-Tab).
    const id = setInterval(checkForNewVersion, 15 * 60_000);
    return () => { sub.remove(); clearInterval(id); };
  }, []);
}
