import { describe, expect, it } from 'vitest';
import { amountInWords, calculateTotals, gstTypeFor, stateCodeFromGstin } from './money';
import { evaluateFormula, FormulaError, formulaVariables } from './formula';
import { checkConformity, parseSpecification } from './spec';
import { hasPermission, permissionsFor } from './roles';
import { canTransition, QUOTATION_TRANSITIONS, TEST_TRANSITIONS } from './status';

describe('GST & totals', () => {
  it('splits CGST + SGST for intra-state supply', () => {
    const t = calculateTotals({ lines: [{ qty: 2, rate: 3500 }, { qty: 1, rate: 800 }], gstRate: 18, gstType: 'INTRA' });
    expect(t.subtotal).toBe(7800);
    expect(t.cgst).toBe(702);
    expect(t.sgst).toBe(702);
    expect(t.igst).toBe(0);
    expect(t.total).toBe(9204);
  });

  it('applies IGST for inter-state supply and a percentage discount', () => {
    const t = calculateTotals({ lines: [{ qty: 1, rate: 10000 }], gstRate: 18, gstType: 'INTER', discountType: 'PERCENT', discountValue: 10 });
    expect(t.discountAmount).toBe(1000);
    expect(t.taxable).toBe(9000);
    expect(t.igst).toBe(1620);
    expect(t.total).toBe(10620);
  });

  it('zero-rates under LUT relaxation and deducts advance', () => {
    const t = calculateTotals({ lines: [{ qty: 1, rate: 5000 }], gstRate: 18, gstType: 'INTER', taxRelaxation: 'SEZ_LUT', advance: 2000 });
    expect(t.taxTotal).toBe(0);
    expect(t.total).toBe(5000);
    expect(t.balanceDue).toBe(3000);
  });

  it('rounds the grand total to the rupee and reports round-off', () => {
    const t = calculateTotals({ lines: [{ qty: 1, rate: 333.33 }], gstRate: 18, gstType: 'INTRA' });
    expect(t.total).toBe(393);
    expect(t.roundOff).toBeCloseTo(-0.33, 2);
  });

  it('derives state code and supply type', () => {
    expect(stateCodeFromGstin('27AAACL1234A1Z5')).toBe('27');
    expect(stateCodeFromGstin('bad')).toBeNull();
    expect(gstTypeFor('27', '27')).toBe('INTRA');
    expect(gstTypeFor('27', '29')).toBe('INTER');
  });

  it('writes amounts in Indian words', () => {
    expect(amountInWords(125000.5)).toBe('Rupees One Lakh Twenty Five Thousand and Fifty Paise Only');
  });
});

describe('formula engine', () => {
  it('evaluates the HPLC assay formula', () => {
    const r = evaluateFormula('At / As * Ws / Wt * P', { At: 1502340, As: 1498870, Ws: 50.12, Wt: 50.3, P: 99.8 });
    expect(r).toBeCloseTo(99.67, 2);
  });
  it('respects precedence, power and functions', () => {
    expect(evaluateFormula('2 + 3 * 4 ^ 2', {})).toBe(50);
    expect(evaluateFormula('avg(1, 2, 3) + round(2.346, 2)', {})).toBeCloseTo(4.35);
    expect(evaluateFormula('-(W1 - W2)', { W1: 5, W2: 2 })).toBe(-3);
  });
  it('lists variables and rejects unsafe input', () => {
    expect(formulaVariables('(W1 - W2) / (W1 - W0) * 100').sort()).toEqual(['W0', 'W1', 'W2']);
    expect(() => evaluateFormula('constructor.constructor("x")()', {})).toThrow(FormulaError);
    expect(() => evaluateFormula('1 / 0', {})).toThrow('Division by zero');
    expect(() => evaluateFormula('A + 1', {})).toThrow('Missing value');
  });
});

describe('specification limits', () => {
  it('parses ranges, NMT and NLT', () => {
    expect(parseSpecification('98.0 – 102.0')).toEqual({ min: 98, max: 102 });
    expect(parseSpecification('NMT 0.5')).toEqual({ max: 0.5 });
    expect(parseSpecification('Min 410')).toEqual({ min: 410 });
    expect(parseSpecification('Clear colourless solution')).toBeNull();
  });
  it('checks conformity', () => {
    expect(checkConformity('98.0 – 102.0', 99.6)).toBe('COMPLIES');
    expect(checkConformity('NMT 0.5', 0.7)).toBe('DOES_NOT_COMPLY');
    expect(checkConformity('Text only', 1)).toBeNull();
  });
});

describe('roles & status machines', () => {
  it('keeps CRM away from technical approval (§9)', () => {
    expect(hasPermission(['CRM'], 'test.review')).toBe(false);
    expect(hasPermission(['CRM'], 'report.release')).toBe(false);
    expect(hasPermission(['ANALYST'], 'report.release')).toBe(false);
    expect(hasPermission(['SECTION_APPROVER'], 'report.release')).toBe(true);
    expect(permissionsFor(['CRM', 'HOD'])).toContain('quote.review');
  });
  it('enforces transitions', () => {
    expect(canTransition(QUOTATION_TRANSITIONS, 'DRAFT', 'SENT')).toBe(false);
    expect(canTransition(QUOTATION_TRANSITIONS, 'INTERNAL_REVIEW', 'SENT')).toBe(true);
    expect(canTransition(TEST_TRANSITIONS, 'SUBMITTED', 'CORRECTION_REQUIRED')).toBe(true);
    expect(canTransition(TEST_TRANSITIONS, 'APPROVED', 'IN_TESTING')).toBe(false);
  });
});
