/**
 * Request validation schemas shared by the API (server-side validation) and the web app
 * (client-side form validation).
 */
import { z } from 'zod';
import { ROLES } from './roles';
import {
  DISPATCH_MODES,
  ENQUIRY_SOURCES,
  ENQUIRY_STATUS,
  REGISTRATION_TEMPLATES,
  REPORT_TYPES,
  TAX_RELAXATIONS,
} from './status';

const id = z.string().min(1);
const optId = z.string().min(1).optional().nullable();
const optText = z.string().trim().max(5000).optional().nullable();
const name = z.string().trim().min(1, 'Required').max(200);
const money = z.coerce.number().min(0).max(99999999);
const date = z.coerce.date();
const optDate = z.coerce.date().optional().nullable();
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(GSTIN, 'Invalid GSTIN (15 characters, e.g. 27AAACL1234A1Z5)');

// ---------- Auth & users ----------
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const signatureSchema = z.object({
  password: z.string().min(1, 'Re-enter your password to sign'),
});

export const userCreateSchema = z.object({
  name,
  email: z.string().trim().toLowerCase().email(),
  designation: optText,
  password: z.string().min(10, 'Minimum 10 characters'),
  roles: z.array(z.enum(ROLES)).min(1),
  sectionIds: z.array(id).default([]),
  active: z.boolean().default(true),
});
export const userUpdateSchema = userCreateSchema.partial().extend({
  password: z.string().min(10).optional(),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, 'Minimum 10 characters'),
});

// ---------- Masters ----------
export const sectionSchema = z.object({
  code: z.string().trim().min(1).max(20).toUpperCase(),
  name,
  active: z.boolean().default(true),
});

export const contactSchema = z.object({
  id: optId,
  name,
  designation: optText,
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  phone: optText,
  isPrimary: z.boolean().default(false),
});

export const customerSchema = z.object({
  name,
  address: optText,
  city: optText,
  state: optText,
  stateCode: z.string().trim().regex(/^\d{2}$/, 'Two-digit state code').optional().nullable().or(z.literal('')),
  pincode: optText,
  gstin: gstinSchema.optional().nullable().or(z.literal('')),
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  phone: optText,
  active: z.boolean().default(true),
  contacts: z.array(contactSchema).default([]),
});

export const testMasterSchema = z.object({
  code: z.string().trim().min(1).max(30).toUpperCase(),
  name,
  sectionId: id,
  method: z.string().trim().min(1).max(300),
  specification: optText,
  unit: optText,
  rate: money,
  nablAccredited: z.boolean().default(false),
  reportType: z.enum(REPORT_TYPES).default('FINAL_RESULT'),
  replicates: z.coerce.number().int().min(1).max(5).default(1),
  formulaId: optId,
  decimals: z.coerce.number().int().min(0).max(6).default(2),
  active: z.boolean().default(true),
});

export const formulaVariableSchema = z.object({
  key: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Letters, digits and _ only'),
  label: z.string().trim().min(1),
  unit: z.string().trim().optional().nullable(),
});
export const formulaSchema = z.object({
  code: z.string().trim().min(1).max(30).toUpperCase(),
  name,
  expression: z.string().trim().min(1).max(1000),
  displayExpression: optText,
  variables: z.array(formulaVariableSchema).min(1),
  resultUnit: optText,
  active: z.boolean().default(true),
});

export const equipmentSchema = z.object({
  code: z.string().trim().min(1).max(30).toUpperCase(),
  name,
  make: optText,
  sectionId: optId,
  calibrationDue: optDate,
  active: z.boolean().default(true),
});

export const chemicalSchema = z.object({
  code: z.string().trim().min(1).max(30).toUpperCase(),
  name,
  kind: z.enum(['CHEMICAL', 'STANDARD', 'REFERENCE_STANDARD', 'MEDIA', 'REAGENT']).default('CHEMICAL'),
  lotNumber: optText,
  potency: z.coerce.number().optional().nullable(),
  expiryDate: optDate,
  active: z.boolean().default(true),
});

export const labSettingsSchema = z.object({
  labName: name,
  address: optText,
  state: z.string().trim().min(1),
  stateCode: z.string().trim().regex(/^\d{2}$/),
  gstin: gstinSchema.optional().nullable().or(z.literal('')),
  pan: optText,
  phone: optText,
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  nablCertificateNo: optText,
  bankName: optText,
  bankAccount: optText,
  bankIfsc: optText,
  bankBranch: optText,
  gstRate: z.coerce.number().min(0).max(28).default(18),
  sacCode: z.string().trim().default('998346'),
  quotationValidityDays: z.coerce.number().int().min(1).max(365).default(30),
  quotationTerms: optText,
  invoiceTerms: optText,
  defaultRetentionMonths: z.coerce.number().int().min(0).max(120).default(3),
  retentionMonthsByTemplate: z.record(z.enum(REGISTRATION_TEMPLATES), z.coerce.number().int().min(0).max(120)).default({}),
  disposalMethods: z.array(z.string().trim().min(1)).default([]),
});
export type LabSettings = z.infer<typeof labSettingsSchema>;

// ---------- CRM enquiry ----------
export const enquirySchema = z.object({
  date: date.default(() => new Date()),
  source: z.enum(ENQUIRY_SOURCES),
  customerId: id,
  contactId: optId,
  queryReference: optText,
  projectReference: optText,
  receiptDetails: optText,
  courierDetails: optText,
  description: optText,
  testIds: z.array(id).default([]),
});
export const enquiryStatusSchema = z.object({
  status: z.enum(ENQUIRY_STATUS),
  remarks: optText,
});

// ---------- Quotation ----------
export const quotationItemSchema = z.object({
  testId: optId,
  sampleDescription: optText,
  testName: z.string().trim().min(1).max(300),
  method: optText,
  specification: optText,
  unit: optText,
  sectionId: optId,
  qty: z.coerce.number().int().min(1).max(10000),
  rate: money,
});
export const quotationSchema = z.object({
  date: date.default(() => new Date()),
  validUntil: optDate,
  enquiryId: optId,
  customerId: id,
  contactId: optId,
  placeOfSupplyStateCode: z.string().trim().regex(/^\d{2}$/).optional().nullable().or(z.literal('')),
  discountType: z.enum(['PERCENT', 'AMOUNT']).optional().nullable(),
  discountValue: z.coerce.number().min(0).optional().nullable(),
  terms: optText,
  remarks: optText,
  items: z.array(quotationItemSchema).min(1, 'Add at least one test'),
});
export const quotationDecisionSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  reason: optText,
});

// ---------- PO & sample receipt ----------
export const purchaseOrderSchema = z.object({
  quotationId: id,
  poNumber: z.string().trim().min(1).max(100),
  poDate: date,
  poValue: money.optional().nullable(),
  remarks: optText,
});

export const sampleReceiptSchema = z.object({
  quotationId: id,
  purchaseOrderId: optId,
  receivedAt: date.default(() => new Date()),
  mode: z.enum(DISPATCH_MODES).default('COURIER'),
  courierName: optText,
  docketNumber: optText,
  numberOfSamples: z.coerce.number().int().min(1).max(1000).default(1),
  condition: optText,
  remarks: optText,
});

// ---------- Registration ----------
export const registrationTestSchema = z.object({
  id: optId,
  testId: optId,
  sourceQuotationItemId: optId,
  sectionId: id,
  testName: z.string().trim().min(1).max(300),
  method: z.string().trim().min(1).max(300),
  specification: optText,
  unit: optText,
  reportType: z.enum(REPORT_TYPES).default('FINAL_RESULT'),
  replicates: z.coerce.number().int().min(1).max(5).default(1),
  nablAccredited: z.boolean().default(false),
  formulaId: optId,
  decimals: z.coerce.number().int().min(0).max(6).default(2),
});

export const registrationSchema = z.object({
  receiptId: id,
  template: z.enum(REGISTRATION_TEMPLATES),
  sampleName: z.string().trim().min(1).max(300),
  sampleDescription: optText,
  quantity: optText,
  condition: optText,
  templateData: z.record(z.string(), z.string().max(500)).default({}),
  remarks: optText,
  tests: z.array(registrationTestSchema).min(1, 'Add at least one test'),
});
export const registrationUpdateSchema = registrationSchema.omit({ receiptId: true });

// ---------- Section allocation ----------
export const assignTestsSchema = z.object({
  testIds: z.array(id).min(1),
  analystId: id,
});

// ---------- Analyst workbench ----------
export const observationSchema = z.object({
  /** Replicate rows: each row is a map of formula variable -> value (or a direct reading). */
  replicates: z.array(z.record(z.string(), z.union([z.number(), z.string(), z.null()]))).max(5).default([]),
  rawData: optText,
  readingNotes: optText,
  finalResult: z.string().trim().max(500).optional().nullable(),
  remarks: optText,
  environment: optText,
  startedAt: optDate,
  completedAt: optDate,
});

export const chemicalUsageSchema = z.object({
  chemicalId: id,
  quantity: z.coerce.number().min(0).optional().nullable(),
  unit: optText,
  remarks: optText,
});
export const equipmentUsageSchema = z.object({
  equipmentId: id,
  usedFrom: optDate,
  usedTo: optDate,
  remarks: optText,
});

export const reviewDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'RETURN']),
  comments: optText,
  password: z.string().min(1, 'Re-enter your password to sign'),
});

// ---------- Reports ----------
export const reportCreateSchema = z.object({
  registrationId: id,
  sectionId: optId, // null => combined report across all sections
  includeNabl: z.boolean().default(false),
  includeSpecification: z.boolean().default(true),
  format: z.enum(['STANDARD', 'VALIDATION']).default('STANDARD'),
});
export const reportUpdateSchema = z.object({
  includeNabl: z.boolean().optional(),
  includeSpecification: z.boolean().optional(),
  format: z.enum(['STANDARD', 'VALIDATION']).optional(),
  issuedToName: z.string().trim().max(300).optional(),
  issuedToAddress: optText,
  issuedToContact: optText,
  remarks: optText,
  validationSummary: optText,
});

// ---------- Dispatch ----------
export const dispatchSchema = z.object({
  customerId: id,
  reportIds: z.array(id).default([]),
  invoiceIds: z.array(id).default([]),
  dispatchDate: date.default(() => new Date()),
  mode: z.enum(DISPATCH_MODES),
  courierName: optText,
  docketNumber: optText,
  remarks: optText,
  combinedVerified: z.boolean().default(false),
});
export const dispatchReceiptSchema = z.object({
  receivedDate: date,
  receivedByName: z.string().trim().min(1).max(200),
});

// ---------- Stores ----------
export const retentionSchema = z.object({
  registrationId: id,
  receivedInStoreAt: date.default(() => new Date()),
  storageLocation: optText,
  quantity: optText,
  retentionMonths: z.coerce.number().int().min(0).max(120),
  remarks: optText,
});
export const disposalSchema = z.object({
  disposedAt: date,
  disposalMethod: z.string().trim().min(1).max(200),
  remarks: optText,
});

// ---------- Invoice ----------
export const invoiceItemSchema = z.object({
  registrationId: optId,
  description: z.string().trim().min(1).max(500),
  sacCode: optText,
  qty: z.coerce.number().int().min(1).max(10000),
  rate: money,
});
export const invoiceSchema = z.object({
  date: date.default(() => new Date()),
  customerId: id,
  contactId: optId,
  quotationId: optId,
  purchaseOrderId: optId,
  placeOfSupplyStateCode: z.string().trim().regex(/^\d{2}$/).optional().nullable().or(z.literal('')),
  taxRelaxation: z.enum(TAX_RELAXATIONS).default('NONE'),
  relaxationReference: optText,
  discountType: z.enum(['PERCENT', 'AMOUNT']).optional().nullable(),
  discountValue: z.coerce.number().min(0).optional().nullable(),
  advanceReceived: money.optional().nullable(),
  advanceReference: optText,
  terms: optText,
  remarks: optText,
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line'),
});

export const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
