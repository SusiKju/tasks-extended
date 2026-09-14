/**
 * useMailNotifications.ts
 * Tab-Badge für ungelesene Mails (Pendant zu useSchuleNotifications).
 * Gmail hat hier keinen Realtime-Push wie Firestore, daher wird alle 5 Minuten
 * ein leichtgewichtiger Unread-Count abgefragt statt der vollen Mail-Liste.
 */

import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { getValidAccessToken } from '../services/googleCalendar';
import { fetchUnreadCount } from '../services/googleMail';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useMailNotifications() {
  const googleAccessToken = useStore((s) => s.settings.googleAccessToken);
  const mailWindowDays = useStore((s) => s.settings.mailWindowDays);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!googleAccessToken) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const check = async () => {
      const token = await getValidAccessToken();
      if (!token) return;
      try {
        const count = await fetchUnreadCount(token, mailWindowDays);
        if (!cancelled) setUnreadCount(count);
      } catch {
        // Badge-Check ist best-effort — kein Logout/Fehler-UI von hier aus.
      }
    };
    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [googleAccessToken, mailWindowDays]);

  return { unreadCount };
}
