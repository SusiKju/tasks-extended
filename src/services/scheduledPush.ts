/**
 * scheduledPush.ts
 * Prüft täglich zur konfigurierten Zeit ob eine Push-Nachricht gesendet werden soll.
 * Aufruf: scheduleCheckIfNeeded() einmalig beim App-Start (Eltern-Modus).
 *
 * Funktionsweise:
 * - Liest Erinnerungszeiten aus Firestore
 * - Prüft jede Minute ob eine der Zeiten ±1 Minute der aktuellen Zeit entspricht
 * - Sendet dann Push an alle Kinder
 */

import { sendReminderToAllChildren } from './pushNotifications';
import { getReminderTimes } from './kinderTasks';

let intervalId: ReturnType<typeof setInterval> | null = null;

function currentHHMM(): string {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function scheduleCheckIfNeeded(): void {
  if (intervalId) return; // bereits läuft

  intervalId = setInterval(async () => {
    try {
      const times = await getReminderTimes();
      const now = currentHHMM();
      if (times.includes(now)) {
        await sendReminderToAllChildren();
      }
    } catch (e) {
      console.warn('scheduledPush error:', e);
    }
  }, 60_000); // jede Minute prüfen
}

export function stopScheduledPush(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
