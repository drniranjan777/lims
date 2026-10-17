import { calculateTotals, gstTypeFor, stateCodeFromGstin, type TaxRelaxation } from '@lims/shared';
import type { LabSettings } from '@lims/shared';

/** Resolve place of supply (explicit → customer GSTIN → customer state code) and compute totals. */
export function computeCommercials(opts: {
  lab: LabSettings;
  customer: { gstin: string | null; stateCode: string | null };
  placeOfSupplyStateCode?: string | null;
  items: { qty: number; rate: number }[];
  discountType?: 'PERCENT' | 'AMOUNT' | null;
  discountValue?: number | null;
  taxRelaxation?: TaxRelaxation;
  advance?: number | null;
}) {
  const pos = opts.placeOfSupplyStateCode || stateCodeFromGstin(opts.customer.gstin) || opts.customer.stateCode || opts.lab.stateCode;
  const gstType = gstTypeFor(opts.lab.stateCode, pos);
  const totals = calculateTotals({
    lines: opts.items,
    discountType: opts.discountType ?? null,
    discountValue: opts.discountValue ?? 0,
    gstRate: opts.lab.gstRate,
    gstType,
    taxRelaxation: opts.taxRelaxation ?? 'NONE',
    advance: opts.advance ?? 0,
  });
  return { placeOfSupplyStateCode: pos, gstType, totals };
}

export function totalsToColumns(t: ReturnType<typeof calculateTotals>) {
  return {
    subtotal: t.subtotal,
    discountAmount: t.discountAmount,
    taxable: t.taxable,
    cgstRate: t.cgstRate,
    sgstRate: t.sgstRate,
    igstRate: t.igstRate,
    cgst: t.cgst,
    sgst: t.sgst,
    igst: t.igst,
    roundOff: t.roundOff,
    total: t.total,
  };
}
