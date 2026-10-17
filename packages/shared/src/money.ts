/**
 * Commercial calculations for quotations and tax invoices (§4.2, §4.13).
 * All arithmetic is done in integer paise to avoid floating-point drift.
 */
import type { TaxRelaxation } from './status';

export const toPaise = (rupees: number | string): number => Math.round(Number(rupees || 0) * 100);
export const fromPaise = (paise: number): number => paise / 100;

export type GstType = 'INTRA' | 'INTER';

export interface LineInput {
  qty: number;
  rate: number | string;
}

export interface TotalsInput {
  lines: LineInput[];
  discountType?: 'PERCENT' | 'AMOUNT' | null;
  discountValue?: number | string | null;
  gstRate: number; // e.g. 18
  gstType: GstType;
  taxRelaxation?: TaxRelaxation;
  advance?: number | string | null;
}

export interface Totals {
  subtotal: number;
  discountAmount: number;
  taxable: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  roundOff: number;
  total: number;
  advance: number;
  balanceDue: number;
  lineAmounts: number[];
}

/** Two-digit state code from a GSTIN, e.g. "27AAACL1234A1Z5" -> "27". */
export function stateCodeFromGstin(gstin?: string | null): string | null {
  if (!gstin) return null;
  const m = /^(\d{2})[A-Z0-9]{13}$/i.exec(gstin.trim());
  return m ? m[1] : null;
}

/** INTRA-state (CGST + SGST) when supplier and place of supply share a state; otherwise IGST. */
export function gstTypeFor(labStateCode: string, placeOfSupplyStateCode?: string | null): GstType {
  if (!placeOfSupplyStateCode) return 'INTRA';
  return labStateCode === placeOfSupplyStateCode ? 'INTRA' : 'INTER';
}

export function calculateTotals(input: TotalsInput): Totals {
  const lineAmounts = input.lines.map((l) => Math.round(toPaise(l.rate) * Number(l.qty || 0)));
  const subtotal = lineAmounts.reduce((a, b) => a + b, 0);

  let discountAmount = 0;
  const dv = Number(input.discountValue || 0);
  if (input.discountType === 'PERCENT') discountAmount = Math.round((subtotal * Math.min(Math.max(dv, 0), 100)) / 100);
  else if (input.discountType === 'AMOUNT') discountAmount = Math.min(toPaise(dv), subtotal);
  const taxable = subtotal - discountAmount;

  const relaxed = input.taxRelaxation && input.taxRelaxation !== 'NONE';
  const rate = relaxed ? 0 : input.gstRate;
  let cgstRate = 0,
    sgstRate = 0,
    igstRate = 0;
  if (input.gstType === 'INTRA') {
    cgstRate = rate / 2;
    sgstRate = rate / 2;
  } else igstRate = rate;

  const cgst = Math.round((taxable * cgstRate) / 100);
  const sgst = Math.round((taxable * sgstRate) / 100);
  const igst = Math.round((taxable * igstRate) / 100);
  const taxTotal = cgst + sgst + igst;
  const gross = taxable + taxTotal;
  const total = Math.round(gross / 100) * 100; // round to nearest rupee
  const roundOff = total - gross;
  const advance = Math.min(toPaise(input.advance ?? 0), total);

  return {
    subtotal: fromPaise(subtotal),
    discountAmount: fromPaise(discountAmount),
    taxable: fromPaise(taxable),
    cgstRate,
    sgstRate,
    igstRate,
    cgst: fromPaise(cgst),
    sgst: fromPaise(sgst),
    igst: fromPaise(igst),
    taxTotal: fromPaise(taxTotal),
    roundOff: fromPaise(roundOff),
    total: fromPaise(total),
    advance: fromPaise(advance),
    balanceDue: fromPaise(total - advance),
    lineAmounts: lineAmounts.map(fromPaise),
  };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}

/** Indian-system amount in words, e.g. 12500.5 -> "Rupees Twelve Thousand Five Hundred and Fifty Paise Only". */
export function amountInWords(amount: number): string {
  const paise = Math.round(amount * 100);
  let n = Math.floor(paise / 100);
  const p = paise % 100;
  if (n === 0 && p === 0) return 'Rupees Zero Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  let words = `Rupees ${parts.join(' ') || 'Zero'}`;
  if (p) words += ` and ${twoDigits(p)} Paise`;
  return `${words} Only`;
}

export function formatINR(n: number | string | null | undefined): string {
  return '₹ ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
