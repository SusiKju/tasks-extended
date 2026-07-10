/**
 * taskMail.ts
 *
 * Push+Mail-Versand für ein Kind (TE-118) und der automatische Versand an alle
 * (TE-149, TE-163). Als eigenständiger Service ausgelagert, damit der
 * automatische tägliche Versand app-weit im RootLayout laufen kann statt nur
 * so lange der Kinder-Tab gemountet ist (TE-163: das war der Grund, warum
 * „Automatisch täglich senden" nie feuerte, wenn die Kinder-Tab in der
 * Session nicht geöffnet wurde).
 */

import { Platform } from 'react-native';
import { format } from 'date-fns';
import { ChildTask, writePushTrigger, getInboxTasksForChild } from './kinderTasks';
import { sendReminderToChild } from './pushNotifications';
import { sendHtmlMail } from './googleMail';

function buildTaskMailHtml(name: string, openTasks: ChildTask[], doneTasks: ChildTask[], appUrl: string): string {
  const taskRows = (tasks: ChildTask[], done: boolean) =>
    tasks.map((t) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:15px;color:${done ? '#aaa' : '#1a1a2e'};${done ? 'text-decoration:line-through;' : ''}">
          <span style="font-size:18px;margin-right:8px">${done ? '✅' : '⭕'}</span>${t.title}
        </td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(79,134,247,0.12)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f86f7,#6ea3ff);padding:32px 28px;text-align:center">
      <div style="font-size:48px;margin-bottom:8px">📋</div>
      <h1 style="margin:0;color:white;font-size:22px;font-weight:800">Hey ${name}! 👋</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px">
        ${openTasks.length === 0
          ? 'Du hast alles erledigt! 🎉'
          : `Du hast noch <strong>${openTasks.length} Aufgabe${openTasks.length !== 1 ? 'n' : ''}</strong> offen`}
      </p>
    </div>

    <!-- Aufgabenliste -->
    <div style="padding:20px 16px">
      ${openTasks.length > 0 ? `
        <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px">Noch offen</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid #eee">
          ${taskRows(openTasks, false)}
        </table>` : ''}

      ${doneTasks.length > 0 ? `
        <p style="margin:${openTasks.length > 0 ? '20px' : '0'} 0 12px;font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px">Schon geschafft 🏆</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid #eee">
          ${taskRows(doneTasks, true)}
        </table>` : ''}

      ${openTasks.length === 0 && doneTasks.length === 0 ? `
        <p style="text-align:center;color:#aaa;font-size:15px;padding:20px 0">Aktuell keine Aufgaben.</p>` : ''}
    </div>

    <!-- CTA Button -->
    <div style="padding:8px 28px 32px;text-align:center">
      <a href="${appUrl}" style="display:inline-block;background:#4f86f7;color:white;text-decoration:none;border-radius:14px;padding:14px 32px;font-size:16px;font-weight:700">
        Aufgaben ansehen →
      </a>
    </div>

    <!-- Footer -->
    <div style="background:#f8f9ff;padding:16px 28px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:12px;color:#aaa">Gesendet von Papa ❤️</p>
    </div>
  </div>
</body>
</html>`;
}

/** Schickt Push + personalisierte Aufgaben-Mail an genau ein Kind. */
export async function sendTaskMailToChild(
  familyId: string,
  childId: string,
  name: string,
  email: string,
  accessToken: string,
  openTasks: ChildTask[],
  doneTasks: ChildTask[]
): Promise<'sent' | 'error'> {
  try {
    // Firestore-Push (App offen)
    await writePushTrigger(familyId, childId, name);
    if (Platform.OS !== 'web') {
      await sendReminderToChild(familyId, childId, name).catch(() => {});
    }

    // family mitgeben, damit der Link self-contained ist: index.tsx persistiert
    // child + family, KindScreen kann die Aufgaben sofort laden (TE-46).
    const appUrl = `https://susikju.github.io/tasks-extended/?child=${childId}&family=${familyId}`;
    const html = buildTaskMailHtml(name, openTasks, doneTasks, appUrl);

    await sendHtmlMail(
      accessToken,
      email,
      openTasks.length > 0
        ? `📋 ${openTasks.length} Aufgabe${openTasks.length !== 1 ? 'n' : ''} offen, ${name}!`
        : `🎉 Alles erledigt, ${name}!`,
      html
    );
    return 'sent';
  } catch (e: any) {
    return 'error';
  }
}

/**
 * Mail Push für alle Kinder mit hinterlegter E-Mail-Adresse, eines nach dem
 * anderen. Holt die Aufgaben frisch aus Firestore statt aus lokalem State,
 * damit der Aufruf auch ohne gemountete Kinder-Tab funktioniert (TE-163).
 */
export async function runAutoSendAll(
  familyId: string,
  children: Array<{ id: string; name: string }>,
  childEmails: Partial<Record<string, string>>,
  accessToken: string
): Promise<{ sent: number; skipped: number; failed: number }> {
  const today = format(new Date(), 'yyyy-MM-dd');
  let sent = 0, skipped = 0, failed = 0;
  for (const child of children) {
    const email = childEmails[child.id];
    if (!email || !accessToken) { skipped++; continue; }
    try {
      const tasks = await getInboxTasksForChild(familyId, child.id, today);
      const openTasks = tasks.filter((t) => !t.done);
      const doneTasks = tasks.filter((t) => t.done);
      const result = await sendTaskMailToChild(familyId, child.id, child.name, email, accessToken, openTasks, doneTasks);
      if (result === 'sent') sent++; else failed++;
    } catch {
      failed++;
    }
  }
  return { sent, skipped, failed };
}
