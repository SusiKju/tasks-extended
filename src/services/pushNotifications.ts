/**
 * pushNotifications.ts
 * Push-Token registrieren und Push-Nachrichten über Expo Push Service senden.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { savePushToken, getPushTokens, getReminderTimes, ChildId, CHILD_NAMES } from './kinderTasks';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Einmalig beim App-Start aufrufen (Kind-Modus). Registriert den Push-Token. */
export async function registerPushToken(childId: ChildId): Promise<void> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push-Berechtigung verweigert');
    return;
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await savePushToken(childId, token);
}

/** Sendet eine Push-Nachricht an ein Kind via Expo Push Service. */
async function sendPush(token: string, childName: string): Promise<void> {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: token,
      title: `Hey ${childName}! 👋`,
      body: 'Schau mal kurz in deine Aufgaben rein.',
      sound: 'default',
    }),
  });
}

/** Sendet Push an alle Kinder die einen Token haben. Vom Eltern-Gerät aufrufen. */
export async function sendReminderToAllChildren(): Promise<void> {
  const tokens = await getPushTokens();
  const promises = (Object.entries(tokens) as [ChildId, string | null][])
    .filter(([, token]) => token !== null)
    .map(([childId, token]) => sendPush(token!, CHILD_NAMES[childId]));
  await Promise.all(promises);
}

/** Gibt die konfigurierten Erinnerungszeiten als { hour, minute }[] zurück. */
export async function getReminderSchedule(): Promise<{ hour: number; minute: number }[]> {
  const times = await getReminderTimes();
  return times.map((t) => {
    const [h, m] = t.split(':').map(Number);
    return { hour: h, minute: m };
  });
}
