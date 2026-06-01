import { Birthday } from '../types';

const PEOPLE_API = 'https://people.googleapis.com/v1';

interface PeopleBirthdayDate {
  year?: number;
  month?: number;
  day?: number;
}

interface PeoplePerson {
  resourceName?: string;
  names?: Array<{ displayName?: string }>;
  birthdays?: Array<{ date?: PeopleBirthdayDate }>;
  photos?: Array<{ url?: string; default?: boolean }>;
}

/**
 * Fetches all of the user's Google Contacts that have a structured birthday
 * (month + day at minimum) via the People API.
 *
 * Returns:
 *   - Birthday[]  on success (possibly empty)
 *   - null        on auth failure (401/403) — caller should refresh the token
 *                 and retry once, mirroring the other Google sync services.
 */
export async function listContactBirthdays(accessToken: string): Promise<Birthday[] | null> {
  const birthdays: Birthday[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      personFields: 'names,birthdays,photos',
      pageSize: '1000',
      sortOrder: 'FIRST_NAME_ASCENDING',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${PEOPLE_API}/people/me/connections?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // 401 = Token abgelaufen → Caller refresht & retryt (sinnvoll).
    // 403 = Forbidden → fehlender Scope oder People API nicht aktiviert. Ein
    // Refresh bringt KEINE neuen Scopes, daher hier den Grund loggen, damit klar
    // ist, ob neu angemeldet (Scope) oder die People API im GCP-Projekt aktiviert
    // werden muss. Rückgabe bleibt null (Refresh-Retry ist harmlos, überschreibt
    // keine bereits synchronisierten Geburtstage).
    if (res.status === 403) {
      const body = await res.text().catch(() => '');
      const scopeMissing = /scope/i.test(body);
      console.warn(
        `[GoogleContacts] 403 von People API. ${
          scopeMissing
            ? 'Fehlender contacts.readonly-Scope → Google-Verbindung trennen und neu anmelden.'
            : 'Vermutlich People API im GCP-Projekt nicht aktiviert → in der Google Cloud Console aktivieren.'
        } Antwort: ${body.slice(0, 300)}`
      );
      return null;
    }
    if (res.status === 401) return null;
    if (!res.ok) return birthdays;

    const data: { connections?: PeoplePerson[]; nextPageToken?: string } = await res.json();

    for (const person of data.connections ?? []) {
      const mapped = personToBirthday(person);
      if (mapped) birthdays.push(mapped);
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return birthdays;
}

function personToBirthday(person: PeoplePerson): Birthday | null {
  const name = person.names?.[0]?.displayName?.trim();
  if (!name || !person.resourceName) return null;

  // A contact may carry several birthday entries; take the first with a
  // structured date (free-text-only birthdays are skipped).
  const date = person.birthdays?.find((b) => b.date?.month && b.date?.day)?.date;
  if (!date?.month || !date?.day) return null;

  const photoUrl = person.photos?.find((p) => p.url)?.url ?? null;

  return {
    id: person.resourceName,
    name,
    day: date.day,
    month: date.month,
    year: date.year ?? null,
    photoUrl,
    updatedAt: new Date().toISOString(),
  };
}
