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

/** Sendet eine HTML-E-Mail über die Gmail API. */
export async function sendHtmlMail(
  accessToken: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<boolean> {
  const boundary = 'boundary_' + Math.random().toString(36).slice(2);
  const raw = [
    `To: ${to}`,
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: text/html; charset=utf-8`,
    '',
    htmlBody,
  ].join('\r\n');

  const encoded = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmailPost('/users/me/messages/send', accessToken, { raw: encoded });
  return res.ok;
}
