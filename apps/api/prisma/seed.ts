/**
 * Idempotent seed: initial administrator, lab settings, sections and starter master data
 * (tests, formulas, equipment, chemicals) taken from the client-approved prototype.
 * Master data is ordinary editable data — Lucid Labs maintains it in Admin → Masters.
 * Demo users (one per role) and demo customers are created only when SEED_DEMO_USERS=true.
 */
import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SECTIONS = [
  { code: 'CHEM', name: 'Chemical' },
  { code: 'INST', name: 'Instrumental' },
  { code: 'MICRO', name: 'Microbiology' },
  { code: 'MECH', name: 'Mechanical' },
];

const FORMULAS = [
  {
    code: 'ASSAY-HPLC',
    name: 'Assay by HPLC (external standard)',
    expression: 'At / As * Ws / Wt * P',
    displayExpression: 'Assay (%) = (Aₜ ÷ Aₛ) × (Wₛ ÷ Wₜ) × P',
    variables: [
      { key: 'At', label: 'Peak area – test', unit: '' },
      { key: 'As', label: 'Peak area – standard', unit: '' },
      { key: 'Ws', label: 'Standard weight', unit: 'mg' },
      { key: 'Wt', label: 'Test weight', unit: 'mg' },
      { key: 'P', label: 'Standard potency', unit: '%' },
    ],
    resultUnit: '%',
  },
  {
    code: 'LOD',
    name: 'Loss on drying',
    expression: '(W1 - W2) / (W1 - W0) * 100',
    displayExpression: 'LOD (%) = (W₁ − W₂) ÷ (W₁ − W₀) × 100',
    variables: [
      { key: 'W0', label: 'Empty bottle', unit: 'g' },
      { key: 'W1', label: 'Bottle + sample, before drying', unit: 'g' },
      { key: 'W2', label: 'Bottle + sample, after drying', unit: 'g' },
    ],
    resultUnit: '%',
  },
  {
    code: 'MOIST',
    name: 'Moisture content (oven)',
    expression: '(W1 - W2) / (W1 - W0) * 100',
    displayExpression: 'Moisture (%) = (W₁ − W₂) ÷ (W₁ − W₀) × 100',
    variables: [
      { key: 'W0', label: 'Empty dish', unit: 'g' },
      { key: 'W1', label: 'Dish + sample, before', unit: 'g' },
      { key: 'W2', label: 'Dish + sample, after', unit: 'g' },
    ],
    resultUnit: '%',
  },
  {
    code: 'TENSILE',
    name: 'Tensile strength',
    expression: 'F * 1000 / A',
    displayExpression: 'Rm (MPa) = F (kN) × 1000 ÷ A (mm²)',
    variables: [
      { key: 'F', label: 'Maximum force', unit: 'kN' },
      { key: 'A', label: 'Original cross-section area', unit: 'mm²' },
    ],
    resultUnit: 'MPa',
  },
];

const TESTS = [
  { code: 'ASSAY', name: 'Assay by HPLC', method: 'USP <621> / STP-HP-014', section: 'INST', spec: '98.0 – 102.0', unit: '%', rate: 3500, nabl: true, reportType: 'INSTRUMENT', formula: 'ASSAY-HPLC', replicates: 2 },
  { code: 'RS', name: 'Related Substances by HPLC', method: 'USP <621> / STP-HP-015', section: 'INST', spec: 'NMT 0.5', unit: '%', rate: 4500, nabl: true, reportType: 'INSTRUMENT', replicates: 1 },
  { code: 'LOD', name: 'Loss on Drying', method: 'USP <731>', section: 'CHEM', spec: 'NMT 0.5', unit: '%', rate: 800, nabl: true, reportType: 'FINAL_RESULT', formula: 'LOD', replicates: 1 },
  { code: 'PH', name: 'pH (1% w/v solution)', method: 'USP <791>', section: 'CHEM', spec: '5.0 – 7.0', unit: '', rate: 400, nabl: true, reportType: 'MULTI_VALUE', replicates: 3 },
  { code: 'MOIST', name: 'Moisture Content', method: 'IS 1350 (Part I)', section: 'CHEM', spec: 'NMT 12.0', unit: '%', rate: 600, nabl: false, reportType: 'FINAL_RESULT', formula: 'MOIST', replicates: 1 },
  { code: 'MLT', name: 'Microbial Limit Test (TAMC)', method: 'USP <61>', section: 'MICRO', spec: 'NMT 1000', unit: 'cfu/g', rate: 3000, nabl: true, reportType: 'FINAL_RESULT', replicates: 1 },
  { code: 'TENS', name: 'Tensile Strength', method: 'ASTM E8/E8M', section: 'MECH', spec: 'Min 410', unit: 'MPa', rate: 2500, nabl: true, reportType: 'MULTI_VALUE', formula: 'TENSILE', replicates: 3 },
  { code: 'HARD', name: 'Brinell Hardness', method: 'ASTM E10', section: 'MECH', spec: '120 – 180', unit: 'HBW', rate: 1200, nabl: true, reportType: 'MULTI_VALUE', replicates: 3 },
  { code: 'OES', name: 'Carbon Content by OES', method: 'ASTM E415', section: 'INST', spec: 'NMT 0.25', unit: '%', rate: 3000, nabl: false, reportType: 'INSTRUMENT', replicates: 1 },
  { code: 'HM', name: 'Lead (Pb) by ICP-MS', method: 'USP <233>', section: 'INST', spec: 'NMT 0.5', unit: 'ppm', rate: 5000, nabl: true, reportType: 'INSTRUMENT', replicates: 1 },
] as const;

const EQUIPMENT = [
  ['HPLC-02', 'Agilent 1260 HPLC', 'INST', '2027-01-15'],
  ['HPLC-04', 'Waters Alliance e2695', 'INST', '2026-12-02'],
  ['BAL-07', 'Analytical balance 0.01 mg', 'CHEM', '2026-10-30'],
  ['OVN-03', 'Hot-air oven 105 °C', 'CHEM', '2027-03-11'],
  ['PHM-01', 'pH meter', 'CHEM', '2026-11-19'],
  ['UTM-01', 'Universal testing machine 600 kN', 'MECH', '2027-02-08'],
  ['BHT-01', 'Brinell hardness tester', 'MECH', '2027-01-21'],
  ['OES-01', 'Optical emission spectrometer', 'INST', '2027-04-14'],
  ['ICP-01', 'ICP-MS', 'INST', '2026-12-26'],
  ['INC-02', 'BOD incubator 30–35 °C', 'MICRO', '2027-01-05'],
] as const;

const CHEMICALS = [
  { code: 'ACN-HPLC', name: 'Acetonitrile (HPLC grade)', kind: 'CHEMICAL', lotNumber: 'L-ACN-2611', expiryDate: '2027-06-30' },
  { code: 'KH2PO4', name: 'Potassium dihydrogen phosphate AR', kind: 'REAGENT', lotNumber: 'L-KP-2609', expiryDate: '2028-01-31' },
  { code: 'RS-PCM', name: 'Paracetamol reference standard', kind: 'REFERENCE_STANDARD', lotNumber: 'RS-PCM-04', potency: 99.8, expiryDate: '2027-03-31' },
  { code: 'BUF-7', name: 'pH 7.00 buffer solution', kind: 'STANDARD', lotNumber: 'B7-2608', expiryDate: '2027-02-28' },
  { code: 'SCDA', name: 'Soybean casein digest agar', kind: 'MEDIA', lotNumber: 'M-SCDA-2610', expiryDate: '2027-04-30' },
] as const;

const DEMO_USERS: { email: string; name: string; designation: string; roles: Role[]; sections: string[] }[] = [
  { email: 'crm@lucidlabs.local', name: 'Priya Sawant', designation: 'CRM Executive', roles: ['CRM'], sections: [] },
  { email: 'hod@lucidlabs.local', name: 'Dr. Anil Gokhale', designation: 'Lab HOD', roles: ['HOD'], sections: [] },
  { email: 'regrev@lucidlabs.local', name: 'Sneha Kamat', designation: 'Registration Reviewer', roles: ['REG_REVIEWER'], sections: [] },
  { email: 'approver.chem@lucidlabs.local', name: 'Dr. Nitin Deshpande', designation: 'Section Approver', roles: ['SECTION_APPROVER'], sections: ['CHEM', 'INST'] },
  { email: 'approver.micro@lucidlabs.local', name: 'Dr. Farah Khan', designation: 'Section Approver', roles: ['SECTION_APPROVER'], sections: ['MICRO'] },
  { email: 'approver.mech@lucidlabs.local', name: 'Er. Suresh Naik', designation: 'Section Approver', roles: ['SECTION_APPROVER'], sections: ['MECH'] },
  { email: 'analyst.chem@lucidlabs.local', name: 'A. Kulkarni', designation: 'Analyst', roles: ['ANALYST'], sections: ['CHEM'] },
  { email: 'analyst.inst@lucidlabs.local', name: 'R. Mehta', designation: 'Analyst', roles: ['ANALYST'], sections: ['INST'] },
  { email: 'analyst.micro@lucidlabs.local', name: 'K. Iyer', designation: 'Analyst', roles: ['ANALYST'], sections: ['MICRO'] },
  { email: 'analyst.mech@lucidlabs.local', name: 'V. Rao', designation: 'Analyst', roles: ['ANALYST'], sections: ['MECH'] },
  { email: 'stores@lucidlabs.local', name: 'Ganesh Pawar', designation: 'Stores In-charge', roles: ['STORES'], sections: [] },
  { email: 'accounts@lucidlabs.local', name: 'Lydia Fernandes', designation: 'Accounts Executive', roles: ['ACCOUNTS'], sections: [] },
  { email: 'signatory@lucidlabs.local', name: 'Dr. Meera Rao', designation: 'Quality Manager', roles: ['SIGNATORY'], sections: [] },
];

async function upsertUser(email: string, name: string, designation: string, password: string, roles: Role[], sectionIds: string[]) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing; // never overwrite an existing user's password or roles
  return prisma.user.create({
    data: {
      email,
      name,
      designation,
      passwordHash: await bcrypt.hash(password, 12),
      roles: { create: roles.map((role) => ({ role })) },
      sections: { create: sectionIds.map((sectionId) => ({ sectionId })) },
    },
  });
}

async function main() {
  const sections = new Map<string, string>();
  for (const s of SECTIONS) {
    const row = await prisma.section.upsert({ where: { code: s.code }, update: {}, create: s });
    sections.set(s.code, row.id);
  }

  const formulas = new Map<string, string>();
  for (const f of FORMULAS) {
    const row = await prisma.formula.upsert({ where: { code: f.code }, update: {}, create: f });
    formulas.set(f.code, row.id);
  }

  for (const t of TESTS) {
    await prisma.testMaster.upsert({
      where: { code: t.code },
      update: {},
      create: {
        code: t.code,
        name: t.name,
        method: t.method,
        sectionId: sections.get(t.section)!,
        specification: t.spec,
        unit: t.unit || null,
        rate: t.rate,
        nablAccredited: t.nabl,
        reportType: t.reportType,
        replicates: t.replicates,
        formulaId: 'formula' in t ? formulas.get(t.formula) : null,
      },
    });
  }

  for (const [code, name, section, due] of EQUIPMENT) {
    await prisma.equipment.upsert({ where: { code }, update: {}, create: { code, name, sectionId: sections.get(section), calibrationDue: new Date(due) } });
  }
  for (const c of CHEMICALS) {
    await prisma.chemical.upsert({ where: { code: c.code }, update: {}, create: { ...c, expiryDate: new Date(c.expiryDate) } });
  }

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!adminEmail || adminPassword.length < 10) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (>= 10 chars) in .env');
  await upsertUser(adminEmail, 'System Administrator', 'Administrator', adminPassword, ['ADMIN'], [...sections.values()]);

  if (process.env.SEED_DEMO_USERS === 'true') {
    const pw = process.env.SEED_DEMO_PASSWORD ?? '';
    if (pw.length < 10) throw new Error('SEED_DEMO_PASSWORD must be at least 10 characters');
    for (const u of DEMO_USERS) await upsertUser(u.email, u.name, u.designation, pw, u.roles, u.sections.map((s) => sections.get(s)!));

    const demoCustomers = [
      { code: 'CUS-DEMO-1', name: 'Sunrise Pharmaceuticals Pvt. Ltd. (demo)', city: 'Pune', state: 'Maharashtra', stateCode: '27', gstin: '27AABCS1234F1Z5', email: 'qa@sunrise-pharma.example', contact: { name: 'Mr. Rahul Joshi', designation: 'QA Manager', email: 'rahul.joshi@sunrise-pharma.example', phone: '+91 98200 00001' } },
      { code: 'CUS-DEMO-2', name: 'Deccan Forge & Castings (demo)', city: 'Belagavi', state: 'Karnataka', stateCode: '29', gstin: '29AACCD5678K1Z2', email: 'quality@deccanforge.example', contact: { name: 'Ms. Kavya Rao', designation: 'Quality Head', email: 'kavya.rao@deccanforge.example', phone: '+91 98450 00002' } },
    ];
    for (const { contact, ...c } of demoCustomers) {
      const exists = await prisma.customer.findUnique({ where: { code: c.code } });
      if (!exists) await prisma.customer.create({ data: { ...c, contacts: { create: { ...contact, isPrimary: true } } } });
    }
  }

  console.log(`Seed complete: ${SECTIONS.length} sections, ${TESTS.length} tests, ${FORMULAS.length} formulas, ${EQUIPMENT.length} equipment, ${CHEMICALS.length} chemicals.`);
  console.log(`Administrator: ${adminEmail}${process.env.SEED_DEMO_USERS === 'true' ? ` · ${DEMO_USERS.length} demo users (see docs/PROGRESS.md for e-mails; password = SEED_DEMO_PASSWORD in .env)` : ''}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
