/**
 * Status machines — §5 "Recommended Status Flow" of the client-approval document.
 * Each map lists the statuses a record may move to from its current status.
 */

export const ENQUIRY_SOURCES = ['PHONE', 'MAIL', 'WALK_IN', 'REFERENCE', 'OTHER'] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];

export const ENQUIRY_STATUS = ['NEW', 'IN_DISCUSSION', 'QUOTATION_PREPARED', 'CLOSED'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUS)[number];

export const QUOTATION_STATUS = [
  'DRAFT',
  'INTERNAL_REVIEW',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUS)[number];

export const RECEIPT_STATUS = ['AWAITING_SAMPLE', 'RECEIVED', 'PRE_REGISTERED', 'REGISTERED'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUS)[number];

export const REGISTRATION_STATUS = [
  'PRE_REGISTERED',
  'REGISTERED',
  'IN_TESTING',
  'TESTING_COMPLETE',
  'REPORTED',
  'CANCELLED',
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUS)[number];

export const SECTION_WORK_STATUS = ['PENDING', 'RECEIVED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type SectionWorkStatus = (typeof SECTION_WORK_STATUS)[number];

export const TEST_STATUS = [
  'UNASSIGNED',
  'ASSIGNED',
  'IN_TESTING',
  'SUBMITTED',
  'CORRECTION_REQUIRED',
  'APPROVED',
] as const;
export type TestStatus = (typeof TEST_STATUS)[number];

export const REPORT_STATUS = ['DRAFT', 'PREVIEW', 'RELEASED', 'DISPATCHED'] as const;
export type ReportStatus = (typeof REPORT_STATUS)[number];

export const RETENTION_STATUS = ['IN_STORE', 'RETENTION_ACTIVE', 'DUE_FOR_DISPOSAL', 'DISPOSED'] as const;
export type RetentionStatus = (typeof RETENTION_STATUS)[number];

export const INVOICE_STATUS = ['DRAFT', 'APPROVED', 'ISSUED', 'DISPATCHED', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

export const REGISTRATION_TEMPLATES = ['PHARMA', 'MECH', 'OM', 'GEN'] as const;
export type RegistrationTemplate = (typeof REGISTRATION_TEMPLATES)[number];

export const REPORT_TYPES = ['FINAL_RESULT', 'MULTI_VALUE', 'INSTRUMENT', 'VALIDATION'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  FINAL_RESULT: 'Final result – numerical/text',
  MULTI_VALUE: 'Multiple values + average',
  INSTRUMENT: 'Instrument / visual result',
  VALIDATION: 'Validation / Verification report',
};

export const TAX_RELAXATIONS = ['NONE', 'SEZ_LUT', 'EXPORT_LUT', 'EXEMPT'] as const;
export type TaxRelaxation = (typeof TAX_RELAXATIONS)[number];

export const TAX_RELAXATION_LABELS: Record<TaxRelaxation, string> = {
  NONE: 'None — standard GST',
  SEZ_LUT: 'Supply to SEZ under LUT (0%)',
  EXPORT_LUT: 'Export of service under LUT (0%)',
  EXEMPT: 'Exempt supply (0%)',
};

export const DISPATCH_MODES = ['COURIER', 'HAND_DELIVERY', 'EMAIL', 'POST'] as const;
export type DispatchMode = (typeof DISPATCH_MODES)[number];

type Transitions<S extends string> = Record<S, readonly S[]>;

export const QUOTATION_TRANSITIONS: Transitions<QuotationStatus> = {
  DRAFT: ['INTERNAL_REVIEW'],
  INTERNAL_REVIEW: ['DRAFT', 'SENT'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
};

export const ENQUIRY_TRANSITIONS: Transitions<EnquiryStatus> = {
  NEW: ['IN_DISCUSSION', 'QUOTATION_PREPARED', 'CLOSED'],
  IN_DISCUSSION: ['QUOTATION_PREPARED', 'CLOSED'],
  QUOTATION_PREPARED: ['CLOSED', 'IN_DISCUSSION'],
  CLOSED: [],
};

export const TEST_TRANSITIONS: Transitions<TestStatus> = {
  UNASSIGNED: ['ASSIGNED'],
  ASSIGNED: ['IN_TESTING', 'ASSIGNED'],
  IN_TESTING: ['SUBMITTED'],
  SUBMITTED: ['CORRECTION_REQUIRED', 'APPROVED'],
  CORRECTION_REQUIRED: ['IN_TESTING', 'SUBMITTED'],
  APPROVED: [],
};

export const INVOICE_TRANSITIONS: Transitions<InvoiceStatus> = {
  DRAFT: ['APPROVED', 'CANCELLED'],
  APPROVED: ['ISSUED', 'DRAFT', 'CANCELLED'],
  ISSUED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: [],
  CANCELLED: [],
};

export function canTransition<S extends string>(map: Transitions<S>, from: S, to: S): boolean {
  return (map[from] ?? []).includes(to);
}

export const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  IN_DISCUSSION: 'In discussion',
  QUOTATION_PREPARED: 'Quotation prepared',
  CLOSED: 'Closed',
  DRAFT: 'Draft',
  INTERNAL_REVIEW: 'Internal review',
  SENT: 'Sent',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  AWAITING_SAMPLE: 'Awaiting sample',
  RECEIVED: 'Received',
  PRE_REGISTERED: 'Pre-registered',
  REGISTERED: 'Registered',
  IN_TESTING: 'In testing',
  TESTING_COMPLETE: 'Testing complete',
  REPORTED: 'Reported',
  CANCELLED: 'Cancelled',
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  UNASSIGNED: 'Unassigned',
  ASSIGNED: 'Assigned',
  SUBMITTED: 'Submitted for review',
  CORRECTION_REQUIRED: 'Correction required',
  APPROVED: 'Approved',
  PREVIEW: 'Preview',
  RELEASED: 'Released',
  DISPATCHED: 'Dispatched',
  IN_STORE: 'In store',
  RETENTION_ACTIVE: 'Retention active',
  DUE_FOR_DISPOSAL: 'Due for disposal',
  DISPOSED: 'Disposed',
  ISSUED: 'Issued',
  DELIVERED: 'Delivered',
};

export function statusLabel(s: string | null | undefined): string {
  if (!s) return '—';
  return STATUS_LABELS[s] ?? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
