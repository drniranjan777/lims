import { labSettingsSchema, type LabSettings } from '@lims/shared';
import { prisma, type Tx } from './prisma';

export const LAB_SETTINGS_KEY = 'lab';

/** Neutral defaults. Lucid Labs' real GSTIN, address and bank details are entered in Admin → Settings. */
export const DEFAULT_LAB_SETTINGS: LabSettings = labSettingsSchema.parse({
  labName: 'Lucid Labs',
  address: '',
  state: 'Maharashtra',
  stateCode: '27',
  gstRate: 18,
  sacCode: '998346',
  quotationValidityDays: 30,
  quotationTerms:
    '1. Quotation valid for 30 days from date of issue.\n2. 100% payment against tax invoice within 15 days, unless advance agreed.\n3. Turnaround time is counted from receipt of sample and PO.\n4. Remnant samples are retained as per the lab retention policy and then disposed.',
  invoiceTerms: '1. Payment due within 15 days of invoice date.\n2. Please quote the invoice number with your remittance.',
  defaultRetentionMonths: 3,
  retentionMonthsByTemplate: { PHARMA: 6, MECH: 3, OM: 3, GEN: 3 },
  disposalMethods: ['Incineration', 'Chemical neutralisation', 'Autoclave & discard', 'Scrap / recycle', 'Returned to customer'],
});

export async function getLabSettings(db: Tx | typeof prisma = prisma): Promise<LabSettings> {
  const row = await db.setting.findUnique({ where: { key: LAB_SETTINGS_KEY } });
  if (!row) return DEFAULT_LAB_SETTINGS;
  const r = labSettingsSchema.safeParse({ ...DEFAULT_LAB_SETTINGS, ...(row.value as object) });
  return r.success ? r.data : DEFAULT_LAB_SETTINGS;
}
