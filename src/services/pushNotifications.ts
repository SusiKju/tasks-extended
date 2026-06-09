/**
 * pushNotifications.ts
 * Push-Token registrieren und Push-Nachrichten über Expo Push Service senden.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { savePushToken, getPushTokens, getReminderTimes } from './kinderTasks';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Einmalig beim App-Start aufrufen (Kind-Modus). Registriert den Push-Token. */
export async function registerPushToken(familyId: string, childId: string): Promise<void> {
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

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    'd2992d41-b8a8-42de-b1d9-f6848a6485b6';
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await savePushToken(familyId, childId, token);
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

/**
 * Sendet Push an alle Kinder die einen Token haben. Vom Eltern-Gerät aufrufen.
 * @param children Array mit {id, name} aller Kinder der Familie
 */
export async function sendReminderToAllChildren(
  familyId: string,
  children: Array<{ id: string; name: string }>
): Promise<void> {
  const childIds = children.map((c) => c.id);
  const tokens = await getPushTokens(familyId, childIds);
  const promises = children
    .filter((c) => tokens[c.id] !== null && tokens[c.id] !== undefined)
    .map((c) => sendPush(tokens[c.id]!, c.name));
  await Promise.all(promises);
}

/** Sendet Push an ein einzelnes Kind. */
export async function sendReminderToChild(
  familyId: string,
  childId: string,
  childName: string
): Promise<void> {
  const tokens = await getPushTokens(familyId, [childId]);
  const token = tokens[childId];
  if (!token) throw new Error(`Kein Push-Token für ${childName} gespeichert.`);
  await sendPush(token, childName);
}

/** Gibt die konfigurierten Erinnerungszeiten als { hour, minute }[] zurück. */
export async function getReminderSchedule(familyId: string): Promise<{ hour: number; minute: number }[]> {
  const times = await getReminderTimes(familyId);
  return times.map((t) => {
    const [h, m] = t.split(':').map(Number);
    return { hour: h, minute: m };
  });
}
