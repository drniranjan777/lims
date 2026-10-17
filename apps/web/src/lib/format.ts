import { formatINR, statusLabel } from '@lims/shared';

export { formatINR, statusLabel };

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

/** yyyy-mm-dd in IST for <input type="date">. */
export function isoDate(d: string | Date | null | undefined = new Date()) {
  if (!d) return '';
  const x = new Date(new Date(d).getTime() + 330 * 60000);
  return x.toISOString().slice(0, 10);
}

const TONES: Record<string, string> = {
  NEW: 'info', IN_DISCUSSION: 'info', QUOTATION_PREPARED: 'pri', CLOSED: '',
  DRAFT: '', INTERNAL_REVIEW: 'warn', SENT: 'info', ACCEPTED: 'ok', REJECTED: 'bad', EXPIRED: 'bad',
  AWAITING_SAMPLE: 'warn', RECEIVED: 'info', PRE_REGISTERED: 'warn', REGISTERED: 'ok',
  IN_TESTING: 'info', TESTING_COMPLETE: 'ok', REPORTED: 'pri', CANCELLED: 'bad',
  PENDING: 'warn', IN_PROGRESS: 'info', COMPLETED: 'ok',
  UNASSIGNED: 'warn', ASSIGNED: 'info', SUBMITTED: 'warn', CORRECTION_REQUIRED: 'bad', APPROVED: 'ok',
  PREVIEW: 'info', RELEASED: 'ok', DISPATCHED: 'pri', DELIVERED: 'ok',
  IN_STORE: 'info', RETENTION_ACTIVE: 'info', DUE_FOR_DISPOSAL: 'warn', DISPOSED: '',
  ISSUED: 'ok', COMPLIES: 'ok', DOES_NOT_COMPLY: 'bad', NOT_CONFIGURED: 'warn', FAILED: 'bad',
};

export const statusTone = (s: string | null | undefined) => (s ? TONES[s] ?? '' : '');

export const SOURCE_LABELS: Record<string, string> = { PHONE: 'Phone', MAIL: 'Mail', WALK_IN: 'Walk-in', REFERENCE: 'Reference', OTHER: 'Other' };
export const TEMPLATE_LABELS: Record<string, string> = { PHARMA: 'Pharma', MECH: 'Mechanical (Mech)', OM: 'OM', GEN: 'General (Gen)' };
export const MODE_LABELS: Record<string, string> = { COURIER: 'Courier', HAND_DELIVERY: 'Hand delivery', EMAIL: 'E-mail', POST: 'Post' };

/** Sample fields per registration template (from the approved prototype; OM fields pending confirmation). */
export const TEMPLATE_FIELDS: Record<string, string[]> = {
  PHARMA: ['Batch No.', 'Mfg. Date', 'Exp. Date', 'Pharmacopoeia', 'Label Claim', 'Manufacturer'],
  MECH: ['Material Grade', 'Heat / Cast No.', 'Specimen Type', 'Dimensions', 'Applicable Standard'],
  OM: ['Material Description', 'Lot No.', 'Source / Origin', 'Packing Details'],
  GEN: ['Sample Description', 'Lot / Batch No.', 'Packing Details', 'Customer Reference'],
};
