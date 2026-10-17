/**
 * Roles and permissions — mirrors §3 (User Roles & Access) and §9 (Approval Boundaries)
 * of the client-approval document, and the permission matrix shown in the approved prototype.
 */

export const ROLES = [
  'ADMIN',
  'CRM',
  'HOD',
  'REG_REVIEWER',
  'SECTION_APPROVER',
  'ANALYST',
  'STORES',
  'ACCOUNTS',
  'SIGNATORY',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  CRM: 'CRM User',
  HOD: 'Lab HOD',
  REG_REVIEWER: 'Registration Reviewer / Approver',
  SECTION_APPROVER: 'Section Approver',
  ANALYST: 'Section Analyst',
  STORES: 'Stores User',
  ACCOUNTS: 'Accounts / Invoice User',
  SIGNATORY: 'Authorized Signatory',
};

export const PERMISSIONS = {
  'enq.create': 'Create / edit enquiries & customers',
  'quote.edit': 'Create / edit quotations',
  'quote.review': 'Confirm tests, methods & specs (HOD review)',
  'quote.authorize': 'Authorize & sign quotations',
  'po.record': 'Record PO & sample receipt',
  'reg.pre': 'Pre-register samples',
  'reg.approve': 'Approve registration & assign sections',
  'test.editMethod': 'Edit / modify tests & methods',
  'sec.assign': 'Receive samples & allocate analysts',
  'test.enter': 'Enter observations, data & results',
  'test.review': 'Review / approve test data',
  'report.editCustomer': 'Edit customer details before final report',
  'report.release': 'Preview & release reports',
  'dispatch.record': 'Record dispatch & receipt',
  'stores.manage': 'Record retention & disposal',
  'invoice.edit': 'Prepare tax invoices',
  'invoice.authorize': 'Authorize & sign invoices',
  'masters.manage': 'Manage master data & settings',
  'users.manage': 'Manage users & roles',
  'audit.view': 'View audit trail',
} as const;
export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  CRM: ['enq.create', 'quote.edit', 'po.record', 'reg.pre', 'dispatch.record'],
  HOD: ['quote.edit', 'quote.review'],
  REG_REVIEWER: ['reg.approve', 'test.editMethod'],
  SECTION_APPROVER: [
    'test.editMethod',
    'sec.assign',
    'test.review',
    'report.editCustomer',
    'report.release',
  ],
  ANALYST: ['test.enter'],
  STORES: ['stores.manage'],
  ACCOUNTS: ['invoice.edit', 'dispatch.record'],
  SIGNATORY: ['quote.authorize', 'invoice.authorize', 'report.release', 'audit.view'],
};

export function permissionsFor(roles: readonly Role[]): Permission[] {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return [...set];
}

export function hasPermission(roles: readonly Role[], perm: Permission): boolean {
  return roles.some((r) => ROLE_PERMISSIONS[r]?.includes(perm));
}

/** Roles whose data access is restricted to the lab sections assigned to the user. */
export const SECTION_SCOPED_ROLES: Role[] = ['SECTION_APPROVER', 'ANALYST'];
