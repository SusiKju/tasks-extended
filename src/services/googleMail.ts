const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

async function gmailPost(path: string, accessToken: string, body?: object): Promise<Response> {
  return fetch(`${GMAIL_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export interface MailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

async function gmailFetch(path: string, accessToken: string): Promise<Response> {
  return fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function extractHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export async function fetchRecentMails(accessToken: string): Promise<MailMessage[]> {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const after = Math.floor(fiveDaysAgo.getTime() / 1000);

  const listRes = await gmailFetch(
    `/users/me/messages?labelIds=INBOX&q=after:${after}&maxResults=30`,
    accessToken
  );

  if (!listRes.ok) {
    if (listRes.status === 401) throw new Error('UNAUTHORIZED');
    throw new Error(`Gmail list failed: ${listRes.status}`);
  }

  const listData = await listRes.json();
  const messages: Array<{ id: string; threadId: string }> = listData.messages ?? [];

  if (messages.length === 0) return [];

  const results = await Promise.all(
    messages.map(async ({ id, threadId }) => {
      const res = await gmailFetch(
        `/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        accessToken
      );
      if (!res.ok) return null;
      const data = await res.json();
      const headers: Array<{ name: string; value: string }> = data.payload?.headers ?? [];
      return {
        id,
        threadId,
        from: extractHeader(headers, 'From'),
        subject: extractHeader(headers, 'Subject'),
        date: extractHeader(headers, 'Date'),
        snippet: data.snippet ?? '',
      } satisfies MailMessage;
    })
  );

  return results.filter((m): m is MailMessage => m !== null);
}

export async function trashMail(accessToken: string, messageId: string): Promise<boolean> {
  const res = await gmailPost(`/users/me/messages/${messageId}/trash`, accessToken);
  return res.ok;
}

export async function archiveMail(accessToken: string, messageId: string): Promise<boolean> {
  const res = await gmailPost(`/users/me/messages/${messageId}/modify`, accessToken, {
    removeLabelIds: ['INBOX'],
  });
  return res.ok;
}

/** Sendet eine einfache Text-E-Mail über die Gmail API. */
export async function sendMail(
  accessToken: string,
  to: string,
  subject: string,
  body: string
): Promise<boolean> {
  const raw = [
    `To: ${to}`,
    'Content-Type: text/plain; charset=utf-8',
    `Subject: ${subject}`,
    '',
    body,
  ].join('\r\n');

  // Base64url-kodieren (RFC 4648)
  const encoded = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmailPost('/users/me/messages/send', accessToken, { raw: encoded });
  return res.ok;
}
