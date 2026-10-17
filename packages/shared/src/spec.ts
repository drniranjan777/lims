/**
 * Specification-limit interpretation, used to mark conformity when a report is generated
 * "with specification limits" (§4.8). Unrecognised specifications return null (no verdict) —
 * the approver then states conformity manually.
 */

export type Conformity = 'COMPLIES' | 'DOES_NOT_COMPLY';

export interface SpecLimits {
  min?: number;
  max?: number;
}

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;

export function parseSpecification(spec?: string | null): SpecLimits | null {
  if (!spec) return null;
  const s = spec.trim();
  let m = new RegExp(`^${NUM}\\s*(?:-|–|—|to)\\s*${NUM}`, 'i').exec(s);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  m = new RegExp(`^(?:NMT|max(?:imum)?|≤|<=|not more than)\\.?\\s*${NUM}`, 'i').exec(s);
  if (m) return { max: Number(m[1]) };
  m = new RegExp(`^(?:NLT|min(?:imum)?|≥|>=|not less than)\\.?\\s*${NUM}`, 'i').exec(s);
  if (m) return { min: Number(m[1]) };
  return null;
}

export function checkConformity(spec: string | null | undefined, value: number | null | undefined): Conformity | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const lim = parseSpecification(spec);
  if (!lim) return null;
  if (lim.min !== undefined && value < lim.min) return 'DOES_NOT_COMPLY';
  if (lim.max !== undefined && value > lim.max) return 'DOES_NOT_COMPLY';
  return 'COMPLIES';
}
