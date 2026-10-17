import type { Tx } from './prisma';
import { financialYear } from './dates';

/**
 * Document number series. Numbers reset every Indian financial year (April).
 * Format: PREFIX/2026-27/0001. (Final formats, incl. NABL ULR, are an open question for
 * Lucid Labs — see docs/IMPLEMENTATION_PLAN.md; only this file needs to change.)
 */
export const SERIES = {
  CUSTOMER: { prefix: 'CUS', perYear: false, pad: 4 },
  ENQUIRY: { prefix: 'ENQ', perYear: true, pad: 4 },
  QUOTATION: { prefix: 'QTN', perYear: true, pad: 4 },
  RECEIPT: { prefix: 'SRN', perYear: true, pad: 4 },
  REGISTRATION: { prefix: 'LL', perYear: true, pad: 5 },
  REPORT: { prefix: 'TR', perYear: true, pad: 5 },
  INVOICE: { prefix: 'INV', perYear: true, pad: 4 },
  INVOICE_DRAFT: { prefix: 'DRAFT-INV', perYear: true, pad: 4 },
  DISPATCH: { prefix: 'DSP', perYear: true, pad: 4 },
} as const;
export type Series = keyof typeof SERIES;

/** Atomically allocate the next number in a series (safe under concurrent requests). */
export async function nextNumber(tx: Tx, series: Series, at: Date = new Date()): Promise<string> {
  const def = SERIES[series];
  const period = def.perYear ? financialYear(at) : 'ALL';
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "NumberSequence" ("series", "period", "nextValue")
    VALUES (${series}, ${period}, 2)
    ON CONFLICT ("series", "period") DO UPDATE SET "nextValue" = "NumberSequence"."nextValue" + 1
    RETURNING "nextValue" - 1 AS value`;
  const n = String(Number(rows[0].value)).padStart(def.pad, '0');
  return def.perYear ? `${def.prefix}/${period}/${n}` : `${def.prefix}-${n}`;
}
