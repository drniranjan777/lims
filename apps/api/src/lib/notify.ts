import nodemailer from 'nodemailer';
import type { Role } from '@lims/shared';
import { config } from '../config';
import { logger } from './logger';
import { prisma, type Tx } from './prisma';

/**
 * Notifications (§7): in-app notifications for staff, e-mail via an outbox table for customers.
 * The outbox makes e-mail delivery reliable (retried) and auditable; when SMTP is not configured
 * messages are kept with status NOT_CONFIGURED instead of pretending to be sent.
 */

export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
}

export async function notifyUsers(db: Tx, userIds: string[], n: NotificationInput) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  await db.notification.createMany({ data: ids.map((userId) => ({ userId, ...n })) });
}

/** Users holding any of the roles; optionally restricted to those assigned to a lab section. */
export async function usersWithRoles(db: Tx, roles: Role[], sectionId?: string): Promise<string[]> {
  const users = await db.user.findMany({
    where: {
      active: true,
      roles: { some: { role: { in: roles } } },
      ...(sectionId ? { sections: { some: { sectionId } } } : {}),
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function notifyRoles(db: Tx, roles: Role[], n: NotificationInput, sectionId?: string) {
  await notifyUsers(db, await usersWithRoles(db, roles, sectionId), n);
}

export async function queueEmail(
  db: Tx,
  e: { to: string | null | undefined; subject: string; body: string; entityType?: string; entityId?: string },
) {
  if (!e.to) return null;
  return db.emailOutbox.create({
    data: {
      to: e.to,
      subject: e.subject,
      body: e.body,
      entityType: e.entityType,
      entityId: e.entityId,
      status: config.smtpConfigured ? 'PENDING' : 'NOT_CONFIGURED',
    },
  });
}

let transporter: nodemailer.Transporter | null = null;
function getTransporter() {
  if (!config.smtpConfigured) return null;
  transporter ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return transporter;
}

/** Deliver pending e-mails. Called by the background job runner. */
export async function deliverPendingEmails(limit = 20) {
  const t = getTransporter();
  if (!t) return 0;
  const pending = await prisma.emailOutbox.findMany({
    where: { status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: 5 } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  let sent = 0;
  for (const m of pending) {
    try {
      await t.sendMail({ from: config.SMTP_FROM, to: m.to, subject: m.subject, text: m.body });
      await prisma.emailOutbox.update({ where: { id: m.id }, data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 }, error: null } });
      sent++;
    } catch (err) {
      logger.warn({ err, id: m.id }, 'e-mail delivery failed');
      await prisma.emailOutbox.update({
        where: { id: m.id },
        data: { status: 'FAILED', attempts: { increment: 1 }, error: String((err as Error).message).slice(0, 500) },
      });
    }
  }
  return sent;
}
