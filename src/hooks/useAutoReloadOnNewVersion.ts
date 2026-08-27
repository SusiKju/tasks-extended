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

async function checkForNewVersion(): Promise<void> {
  if (!OWN_SHA) return; // lokaler Dev-Build ohne CI-SHA – nichts zu vergleichen
  try {
    const res = await fetch(`/tasks-extended/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { sha } = (await res.json()) as { sha?: string };
    if (sha && sha !== OWN_SHA) {
      window.location.replace(`${window.location.pathname}?v=${Date.now()}`);
    }
  } catch {
    // Netzwerkfehler o.ä. – beim nächsten Start/Aufwachen erneut versuchen
  }
}

export function useAutoReloadOnNewVersion(): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    checkForNewVersion();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') checkForNewVersion();
    });
    return () => sub.remove();
  }, []);
}
