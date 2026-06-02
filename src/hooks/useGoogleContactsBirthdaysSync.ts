import { useCallback } from 'react';
import { useStore } from '../store';
import { getValidAccessToken } from '../services/googleCalendar';
import { listContactBirthdays } from '../services/googleContacts';

/**
 * Pulls birthdays from Google Contacts (People API) and stores them as the
 * app's birthday data basis. Returns the number of birthdays synced, or null
 * when no Google account is connected / the sync could not run.
 *
 * Runs whenever a Google access token is present — independent of
 * `settings.googleBirthdaysEnabled` (mirrors the Drive-notes hook). That flag has
 * no user-facing toggle; it is only flipped on connect/disconnect. Gating on it
 * here suppressed the background syncs for anyone who connected Google before this
 * feature shipped (flag defaults to false via migration), so birthdays stayed
 * empty on the dashboard even when Google Contacts had one for today.
 */
export function useGoogleContactsBirthdaysSync() {
  const syncBirthdays = useCallback(async (overrideToken?: string): Promise<number | null> => {
    const { setBirthdays } = useStore.getState();

    // Stillen Refresh erlauben (Web via GIS, nativ via Refresh-Token).
    const token = overrideToken ?? (await getValidAccessToken());
    if (!token) return null;

    // First attempt with the current token.
    let result = await listContactBirthdays(token).catch(() => null);

    // null = auth failure → force refresh once and retry.
    if (result === null && !overrideToken) {
      const newToken = await getValidAccessToken(true);
      if (newToken && newToken !== token) {
        result = await listContactBirthdays(newToken).catch(() => null);
      }
    }

    if (result === null) return null;

    setBirthdays(result);
    return result.length;
  }, []);

  return { syncBirthdays };
}
