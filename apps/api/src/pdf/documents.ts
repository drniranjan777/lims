import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { amountInWords, formatINR, REPORT_TYPE_LABELS, TAX_RELAXATION_LABELS, type LabSettings, type ReportType, type TaxRelaxation } from '@lims/shared';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { renderPdf } from './printer';

const C = { primary: '#094f8b', muted: '#5d6977', border: '#d3d9df', soft: '#e4eef8', bad: '#b3261e' };
const num = (v: unknown) => Number(v ?? 0);
const txt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

function labHeader(lab: LabSettings, title: string, right: Content[]): Content {
  return {
    columns: [
      {
        width: '*',
        stack: [
          { text: lab.labName, fontSize: 16, bold: true, color: C.primary },
          ...[
            lab.address,
            [lab.phone ? `Ph: ${lab.phone}` : '', lab.email ? `E-mail: ${lab.email}` : ''].filter(Boolean).join('   '),
            lab.gstin ? `GSTIN: ${lab.gstin}   State: ${lab.state} (${lab.stateCode})` : `State: ${lab.state} (${lab.stateCode})`,
          ]
            .filter(Boolean)
            .map((t): Content => ({ text: t as string, color: C.muted })),
        ],
      },
      { width: 'auto', stack: [{ text: title, fontSize: 14, bold: true, alignment: 'right' }, ...right] },
    ],
    margin: [0, 0, 0, 10],
  };
}

const hr = (): Content => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.7, lineColor: C.border }], margin: [0, 2, 0, 8] });

const tableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => C.border,
  vLineColor: () => C.border,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 3,
  paddingBottom: () => 3,
  fillColor: (row: number) => (row === 0 ? C.soft : null),
};

function kv(rows: [string, unknown][]): Content {
  return {
    table: { widths: [110, '*'], body: rows.map(([k, v]) => [{ text: k, color: C.muted }, { text: txt(v) }]) },
    layout: 'noBorders',
  };
}

function bankAndSign(lab: LabSettings, signer: { name?: string | null; designation?: string | null; at?: Date | null } | null, label: string): Content {
  return {
    columns: [
      {
        width: '*',
        stack: [
          { text: 'Bank details', bold: true, margin: [0, 0, 0, 2] },
          kv([
            ['Bank', lab.bankName],
            ['Account no.', lab.bankAccount],
            ['IFSC', lab.bankIfsc],
            ['Branch', lab.bankBranch],
          ]),
        ],
      },
      {
        width: 200,
        stack: [
          { text: `For ${lab.labName}`, bold: true, alignment: 'right' },
          signer?.name
            ? { text: `Electronically signed by ${signer.name}${signer.designation ? `, ${signer.designation}` : ''}\n${fmtDateTime(signer.at)}`, alignment: 'right', color: C.primary, margin: [0, 18, 0, 0] }
            : { text: 'Not yet authorized', alignment: 'right', color: C.bad, margin: [0, 18, 0, 0] },
          { text: label, alignment: 'right', color: C.muted, margin: [0, 4, 0, 0] },
        ],
      },
    ],
    margin: [0, 12, 0, 0],
  };
}

function totalsTable(t: { subtotal: unknown; discountAmount: unknown; taxable: unknown; cgstRate: unknown; sgstRate: unknown; igstRate: unknown; cgst: unknown; sgst: unknown; igst: unknown; roundOff: unknown; total: unknown }, extra: [string, unknown][] = []): Content {
  const rows: [string, string][] = [['Sub-total', formatINR(num(t.subtotal))]];
  if (num(t.discountAmount)) rows.push(['Discount', `− ${formatINR(num(t.discountAmount))}`]);
  rows.push(['Taxable value', formatINR(num(t.taxable))]);
  if (num(t.igstRate) || (!num(t.cgstRate) && num(t.igst))) rows.push([`IGST @ ${num(t.igstRate)}%`, formatINR(num(t.igst))]);
  else {
    rows.push([`CGST @ ${num(t.cgstRate)}%`, formatINR(num(t.cgst))]);
    rows.push([`SGST @ ${num(t.sgstRate)}%`, formatINR(num(t.sgst))]);
  }
  if (num(t.roundOff)) rows.push(['Round off', formatINR(num(t.roundOff))]);
  rows.push(['Total', formatINR(num(t.total))]);
  for (const [k, v] of extra) rows.push([k, formatINR(num(v))]);
  return {
    columns: [
      { width: '*', text: `Amount in words: ${amountInWords(num(t.total))}`, italics: true, margin: [0, 4, 10, 0] },
      {
        width: 220,
        table: {
          widths: ['*', 90],
          body: rows.map(([k, v]): TableCell[] => {
            const fill = k === 'Total' ? C.soft : undefined;
            return [
              { text: k, bold: k === 'Total', fillColor: fill },
              { text: v, alignment: 'right', bold: k === 'Total', fillColor: fill },
            ];
          }),
        },
        layout: tableLayout as never,
      },
    ],
    margin: [0, 8, 0, 0],
  };
}

function footer(docLabel: string) {
  return (page: number, pages: number): Content => ({
    columns: [
      { text: docLabel, color: C.muted, fontSize: 7 },
      { text: `Page ${page} of ${pages}`, alignment: 'right', color: C.muted, fontSize: 7 },
    ],
    margin: [36, 16, 36, 0],
  });
}

// ---------------------------------------------------------------- quotation

export interface QuotationForPdf {
  number: string;
  revision: number;
  date: Date;
  validUntil: Date | null;
  status: string;
  placeOfSupplyStateCode: string | null;
  gstType: string;
  customer: { name: string; address: string | null; city: string | null; state: string | null; gstin: string | null };
  contact: { name: string; email: string | null; phone: string | null } | null;
  enquiry: { number: string } | null;
  items: { sampleDescription: string | null; testName: string; method: string | null; specification: string | null; unit: string | null; qty: number; rate: unknown; amount: unknown }[];
  terms: string | null;
  remarks: string | null;
  authorizedBy: { name: string; designation: string | null } | null;
  authorizedAt: Date | null;
  subtotal: unknown; discountAmount: unknown; taxable: unknown; cgstRate: unknown; sgstRate: unknown; igstRate: unknown; cgst: unknown; sgst: unknown; igst: unknown; roundOff: unknown; total: unknown;
}

export function quotationPdf(q: QuotationForPdf, lab: LabSettings): Promise<Buffer> {
  const body: TableCell[][] = [
    ['#', 'Sample / item', 'Test', 'Method', 'Specification', 'Qty', 'Rate', 'Amount'].map((h) => ({ text: h, bold: true })),
    ...q.items.map((i, idx) => [
      String(idx + 1),
      txt(i.sampleDescription),
      i.testName,
      txt(i.method),
      i.specification ? `${i.specification}${i.unit ? ` ${i.unit}` : ''}` : '—',
      { text: String(i.qty), alignment: 'right' as const },
      { text: formatINR(num(i.rate)), alignment: 'right' as const },
      { text: formatINR(num(i.amount)), alignment: 'right' as const },
    ]),
  ];
  const def: TDocumentDefinitions = {
    info: { title: `Quotation ${q.number}` },
    watermark: q.authorizedAt ? undefined : { text: 'DRAFT', opacity: 0.08, bold: true },
    footer: footer(`Quotation ${q.number}${q.revision ? ` Rev ${q.revision}` : ''}`),
    content: [
      labHeader(lab, 'QUOTATION', [
        { text: q.number, alignment: 'right', bold: true },
        { text: `Date: ${fmtDate(q.date)}`, alignment: 'right' },
        { text: `Valid until: ${fmtDate(q.validUntil)}`, alignment: 'right' },
      ]),
      hr(),
      {
        columns: [
          { width: '*', stack: [{ text: 'To', color: C.muted }, { text: q.customer.name, bold: true }, { text: [q.customer.address, q.customer.city, q.customer.state].filter(Boolean).join(', ') }, { text: q.customer.gstin ? `GSTIN: ${q.customer.gstin}` : 'GSTIN: —' }] },
          { width: '*', stack: [{ text: 'Kind attention', color: C.muted }, { text: q.contact?.name ?? '—', bold: true }, { text: [q.contact?.email, q.contact?.phone].filter(Boolean).join(' · ') }, { text: q.enquiry ? `Enquiry ref: ${q.enquiry.number}` : '' }, { text: `Place of supply: ${txt(q.placeOfSupplyStateCode)} (${q.gstType === 'INTRA' ? 'CGST + SGST' : 'IGST'})` }] },
        ],
        margin: [0, 0, 0, 10],
      },
      { table: { headerRows: 1, widths: [14, 70, '*', 80, 70, 24, 56, 60], body }, layout: tableLayout as never },
      totalsTable(q),
      q.remarks ? { text: [{ text: 'Remarks: ', bold: true }, q.remarks], margin: [0, 10, 0, 0] } : '',
      { text: 'Terms & conditions', bold: true, margin: [0, 12, 0, 2] },
      { text: q.terms ?? '', color: C.muted },
      bankAndSign(lab, q.authorizedBy ? { ...q.authorizedBy, at: q.authorizedAt } : null, 'Authorized signatory'),
    ],
  };
  return renderPdf(def);
}

// ---------------------------------------------------------------- tax invoice

export interface InvoiceForPdf extends Omit<QuotationForPdf, 'number' | 'revision' | 'validUntil' | 'items' | 'enquiry' | 'authorizedBy' | 'authorizedAt'> {
  number: string | null;
  draftNumber: string;
  customerGstin: string | null;
  taxRelaxation: string;
  relaxationReference: string | null;
  poValue: unknown;
  advanceReceived: unknown;
  advanceReference: string | null;
  balanceDue: unknown;
  quotation: { number: string } | null;
  purchaseOrder: { poNumber: string; poDate: Date } | null;
  items: { description: string; sacCode: string | null; qty: number; rate: unknown; amount: unknown; registration?: { number: string } | null }[];
  approvedBy: { name: string; designation: string | null } | null;
  approvedAt: Date | null;
}

export function invoicePdf(inv: InvoiceForPdf, lab: LabSettings): Promise<Buffer> {
  const isFinal = Boolean(inv.number);
  const body: TableCell[][] = [
    ['#', 'Description', 'Reg. no.', 'SAC', 'Qty', 'Rate', 'Amount'].map((h) => ({ text: h, bold: true })),
    ...inv.items.map((i, idx) => [
      String(idx + 1),
      i.description,
      txt(i.registration?.number),
      txt(i.sacCode),
      { text: String(i.qty), alignment: 'right' as const },
      { text: formatINR(num(i.rate)), alignment: 'right' as const },
      { text: formatINR(num(i.amount)), alignment: 'right' as const },
    ]),
  ];
  const extra: [string, unknown][] = num(inv.advanceReceived) ? [['Less: advance received', -num(inv.advanceReceived)], ['Balance due', inv.balanceDue]] : [];
  const def: TDocumentDefinitions = {
    info: { title: `Tax Invoice ${inv.number ?? inv.draftNumber}` },
    watermark: isFinal ? undefined : { text: 'DRAFT', opacity: 0.08, bold: true },
    footer: footer(`Tax Invoice ${inv.number ?? inv.draftNumber}`),
    content: [
      labHeader(lab, 'TAX INVOICE', [
        { text: inv.number ?? `${inv.draftNumber} (draft)`, alignment: 'right', bold: true },
        { text: `Date: ${fmtDate(inv.date)}`, alignment: 'right' },
        { text: lab.pan ? `PAN: ${lab.pan}` : '', alignment: 'right' },
      ]),
      hr(),
      {
        columns: [
          { width: '*', stack: [{ text: 'Bill to', color: C.muted }, { text: inv.customer.name, bold: true }, { text: [inv.customer.address, inv.customer.city, inv.customer.state].filter(Boolean).join(', ') }, { text: `GSTIN: ${txt(inv.customerGstin)}` }, { text: inv.contact ? `Attn: ${inv.contact.name}` : '' }] },
          {
            width: '*',
            stack: [
              kv([
                ['Place of supply', `${txt(inv.placeOfSupplyStateCode)} (${inv.gstType === 'INTRA' ? 'CGST + SGST' : 'IGST'})`],
                ['Quotation', inv.quotation?.number],
                ['Customer PO', inv.purchaseOrder ? `${inv.purchaseOrder.poNumber} dt. ${fmtDate(inv.purchaseOrder.poDate)}` : null],
                ['PO value', inv.poValue ? formatINR(num(inv.poValue)) : null],
                ['Tax relaxation', inv.taxRelaxation !== 'NONE' ? `${TAX_RELAXATION_LABELS[inv.taxRelaxation as TaxRelaxation]}${inv.relaxationReference ? ` — ${inv.relaxationReference}` : ''}` : 'None'],
                ['Advance ref.', inv.advanceReference],
              ]),
            ],
          },
        ],
        margin: [0, 0, 0, 10],
      },
      { table: { headerRows: 1, widths: [14, '*', 70, 40, 24, 60, 64], body }, layout: tableLayout as never },
      totalsTable(inv, extra),
      inv.remarks ? { text: [{ text: 'Remarks: ', bold: true }, inv.remarks], margin: [0, 10, 0, 0] } : '',
      { text: 'Terms & conditions', bold: true, margin: [0, 12, 0, 2] },
      { text: inv.terms ?? '', color: C.muted },
      bankAndSign(lab, inv.approvedBy ? { ...inv.approvedBy, at: inv.approvedAt } : null, 'Authorized signatory'),
    ],
  };
  return renderPdf(def);
}

// ---------------------------------------------------------------- test report

export interface ReportContent {
  lab: { labName: string; address?: string | null; phone?: string | null; email?: string | null; nablCertificateNo?: string | null };
  number: string;
  revision: number;
  format: 'STANDARD' | 'VALIDATION';
  includeNabl: boolean;
  includeSpecification: boolean;
  combined: boolean;
  sectionName: string | null;
  issuedTo: { name: string; address: string | null; contact: string | null };
  registration: {
    number: string;
    sampleName: string;
    sampleDescription: string | null;
    template: string;
    templateData: Record<string, string>;
    quantity: string | null;
    condition: string | null;
    receivedAt: string;
    registeredAt: string | null;
    quotationNumber: string;
    poNumber: string | null;
    poDate: string | null;
  };
  sections: {
    name: string;
    tests: {
      testName: string;
      method: string;
      specification: string | null;
      unit: string | null;
      reportType: ReportType;
      nablAccredited: boolean;
      replicateValues: (number | null)[];
      result: string | null;
      conformity: string | null;
      remarks: string | null;
      performedAt: string | null;
      images: { attachmentId: string; caption: string | null; fileName: string }[];
    }[];
    reviewedBy: string[];
  }[];
  remarks: string | null;
  validationSummary: string | null;
  issueDate: string | null;
  releasedBy: { name: string; designation: string | null; at: string } | null;
}

const conformityText = (c: string | null) => (c === 'COMPLIES' ? 'Complies' : c === 'DOES_NOT_COMPLY' ? 'Does not comply' : '—');

export function reportPdf(r: ReportContent, opts: { draft: boolean; images: Map<string, string> }): Promise<Buffer> {
  const testsRows = (s: ReportContent['sections'][number]): Content => {
    const head = ['#', 'Test', 'Method', ...(r.includeSpecification ? ['Specification'] : []), 'Result', ...(r.includeSpecification ? ['Conformity'] : [])];
    const rows: TableCell[][] = s.tests.map((t, i) => {
      const unit = t.unit ? ` ${t.unit}` : '';
      const resultCell: Content =
        t.reportType === 'MULTI_VALUE' && t.replicateValues.length
          ? { stack: [{ text: `${txt(t.result)}${unit} (mean)`, bold: true }, { text: t.replicateValues.map((v, j) => `R${j + 1}: ${v ?? '—'}`).join('   '), fontSize: 7, color: C.muted }] }
          : { text: `${txt(t.result)}${t.result ? unit : ''}`, bold: true };
      return [
        String(i + 1),
        { text: `${t.testName}${r.includeNabl && !t.nablAccredited ? ' *' : ''}` },
        t.method,
        ...(r.includeSpecification ? [t.specification ? `${t.specification}${unit}` : '—'] : []),
        resultCell,
        ...(r.includeSpecification ? [{ text: conformityText(t.conformity), color: t.conformity === 'DOES_NOT_COMPLY' ? C.bad : undefined }] : []),
      ] as TableCell[];
    });
    const widths = r.includeSpecification ? [14, '*', 90, 70, 80, 56] : [14, '*', 120, 100];
    return { table: { headerRows: 1, widths, body: [head.map((h) => ({ text: h, bold: true })), ...rows] }, layout: tableLayout as never, margin: [0, 0, 0, 6] };
  };

  const images = (s: ReportContent['sections'][number]): Content[] =>
    s.tests.flatMap((t) =>
      t.images
        .filter((img) => opts.images.has(img.attachmentId))
        .map((img) => ({
          stack: [
            { image: opts.images.get(img.attachmentId) as string, fit: [500, 260], alignment: 'center' as const },
            { text: `${t.testName} — ${img.caption ?? img.fileName}`, alignment: 'center' as const, fontSize: 8, color: C.muted, margin: [0, 2, 0, 8] as [number, number, number, number] },
          ],
          unbreakable: true,
        })),
    );

  const reg = r.registration;
  const tplRows = Object.entries(reg.templateData ?? {}).filter(([, v]) => v);
  const sampleBlock: Content = {
    columns: [
      { width: '*', stack: [{ text: 'Issued to', color: C.muted }, { text: r.issuedTo.name, bold: true }, { text: r.issuedTo.address ?? '' }, { text: r.issuedTo.contact ? `Attn: ${r.issuedTo.contact}` : '' }] },
      {
        width: '*',
        stack: [
          kv([
            ['Registration no.', reg.number],
            ['Sample received', reg.receivedAt],
            ['Registered on', reg.registeredAt],
            ['Quotation / PO', `${reg.quotationNumber}${reg.poNumber ? ` / ${reg.poNumber}` : ''}`],
          ]),
        ],
      },
    ],
    margin: [0, 0, 0, 8],
  };
  const sampleDetails: Content = {
    table: {
      widths: [110, '*', 110, '*'],
      body: chunk(
        [['Sample', reg.sampleName], ['Description', reg.sampleDescription], ['Quantity', reg.quantity], ['Condition on receipt', reg.condition], ...tplRows].map(([k, v]): TableCell[] => [{ text: String(k), color: C.muted }, txt(v)]),
        2,
      ).map((pair) => (pair.length === 2 ? [...pair[0], ...pair[1]] : [...pair[0], '', ''])),
    },
    layout: tableLayout as never,
    margin: [0, 0, 0, 10],
  };

  const signatures: Content = {
    columns: [
      { width: '*', stack: r.sections.map((s) => ({ text: `${s.name} — reviewed by ${s.reviewedBy.join(', ') || '—'}`, color: C.muted })) },
      {
        width: 220,
        stack: r.releasedBy
          ? [{ text: 'Authorized signatory', color: C.muted, alignment: 'right' }, { text: `Electronically signed by ${r.releasedBy.name}${r.releasedBy.designation ? `, ${r.releasedBy.designation}` : ''}`, alignment: 'right', color: C.primary }, { text: r.releasedBy.at, alignment: 'right', color: C.muted }]
          : [{ text: 'DRAFT — not released', alignment: 'right', color: C.bad, bold: true }],
      },
    ],
    margin: [0, 14, 0, 0],
  };

  const notes: Content = {
    stack: [
      r.includeNabl && r.sections.some((s) => s.tests.some((t) => !t.nablAccredited)) ? { text: '* Test not covered under the scope of NABL accreditation.', fontSize: 7, color: C.muted } : '',
      { text: 'The results relate only to the sample(s) tested as received. This report shall not be reproduced except in full without the written approval of the laboratory.', fontSize: 7, color: C.muted },
    ],
    margin: [0, 10, 0, 0],
  };

  const header: Content = {
    columns: [
      {
        width: '*',
        stack: [
          { text: r.lab.labName, fontSize: 16, bold: true, color: C.primary },
          { text: r.lab.address ?? '', color: C.muted },
          { text: [r.lab.phone, r.lab.email].filter(Boolean).join(' · '), color: C.muted },
        ],
      },
      r.includeNabl
        ? { width: 90, table: { body: [[{ stack: [{ text: 'NABL', bold: true, fontSize: 14, alignment: 'center', color: C.primary }, { text: r.lab.nablCertificateNo ? `Cert. ${r.lab.nablCertificateNo}` : 'Accredited', fontSize: 7, alignment: 'center' }] }]] }, layout: tableLayout as never }
        : { width: 0, text: '' },
    ],
    margin: [0, 0, 0, 6],
  };

  const title = r.format === 'VALIDATION' ? 'VALIDATION / VERIFICATION REPORT' : 'TEST REPORT';
  const titleBlock: Content = {
    columns: [
      { text: title, fontSize: 13, bold: true },
      { stack: [{ text: `Report no.: ${r.number}${r.revision ? ` Rev ${r.revision}` : ''}`, alignment: 'right', bold: true }, { text: `Issue date: ${r.issueDate ?? '—'}`, alignment: 'right' }, { text: r.combined ? 'Combined report (all sections)' : `Section: ${r.sectionName}`, alignment: 'right', color: C.muted }] },
    ],
    margin: [0, 0, 0, 6],
  };

  let content: Content[];
  if (r.format === 'VALIDATION') {
    // Book-style: cover page, then one chapter per section with tables, trend of replicates and images.
    content = [
      header,
      hr(),
      { text: title, fontSize: 20, bold: true, alignment: 'center', margin: [0, 120, 0, 10] },
      { text: reg.sampleName, fontSize: 14, alignment: 'center' },
      { text: `Report no. ${r.number}`, alignment: 'center', margin: [0, 6, 0, 0] },
      { text: `Prepared for ${r.issuedTo.name}`, alignment: 'center', margin: [0, 2, 0, 0], color: C.muted },
      { text: '', pageBreak: 'after' },
      titleBlock,
      sampleBlock,
      sampleDetails,
      ...r.sections.flatMap((s, i): Content[] => [
        { text: `${i + 1}. ${s.name}`, fontSize: 12, bold: true, margin: [0, 8, 0, 4], color: C.primary },
        testsRows(s),
        ...s.tests
          .filter((t) => t.replicateValues.length > 1)
          .map((t) => ({ text: `${t.testName}: replicate trend ${t.replicateValues.map((v) => v ?? '—').join(' → ')}`, color: C.muted, fontSize: 8 })),
        ...s.tests.filter((t) => t.remarks).map((t) => ({ text: `${t.testName}: ${t.remarks}`, fontSize: 8 })),
        ...images(s),
      ]),
      r.validationSummary ? { stack: [{ text: 'Summary & conclusion', fontSize: 12, bold: true, margin: [0, 10, 0, 4] }, { text: r.validationSummary }] } : '',
      r.remarks ? { text: [{ text: 'Remarks: ', bold: true }, r.remarks], margin: [0, 8, 0, 0] } : '',
      signatures,
      notes,
    ];
  } else {
    content = [
      header,
      hr(),
      titleBlock,
      sampleBlock,
      sampleDetails,
      ...r.sections.flatMap((s): Content[] => [
        ...(r.sections.length > 1 || r.combined ? [{ text: s.name, bold: true, margin: [0, 4, 0, 3] as [number, number, number, number], color: C.primary }] : []),
        testsRows(s),
        ...s.tests.filter((t) => t.remarks).map((t) => ({ text: `${t.testName}: ${t.remarks}`, fontSize: 8, color: C.muted })),
        ...images(s),
      ]),
      r.remarks ? { text: [{ text: 'Remarks: ', bold: true }, r.remarks], margin: [0, 8, 0, 0] } : '',
      { text: '— End of report —', alignment: 'center', color: C.muted, margin: [0, 10, 0, 0] },
      signatures,
      notes,
    ];
  }

  return renderPdf({
    info: { title: `Test Report ${r.number}` },
    watermark: opts.draft ? { text: 'DRAFT — NOT FOR RELEASE', opacity: 0.08, bold: true } : undefined,
    footer: footer(`Report ${r.number} · ${reg.number}`),
    content,
  });
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export { REPORT_TYPE_LABELS };
