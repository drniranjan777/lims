'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { calculateTotals, gstTypeFor, stateCodeFromGstin, type LabSettings } from '@lims/shared';
import { api } from '@/lib/api';
import { formatINR, isoDate } from '@/lib/format';
import { useAction, useMaster, type Customer, type Section } from '@/lib/hooks';
import { CustomerContactPicker, TestPicker } from './pickers';
import { Btn, Card, ErrorBox, Field, fieldErr, Input, Select, Textarea } from './ui';

export interface QuotationItemDraft {
  testId: string | null;
  sampleDescription: string;
  testName: string;
  method: string;
  specification: string;
  unit: string;
  sectionId: string | null;
  qty: number;
  rate: number;
}
export interface QuotationDraft {
  date: string;
  validUntil: string;
  enquiryId: string | null;
  customerId: string;
  contactId: string;
  placeOfSupplyStateCode: string;
  discountType: '' | 'PERCENT' | 'AMOUNT';
  discountValue: number | '';
  terms: string;
  remarks: string;
  items: QuotationItemDraft[];
}

export const useLabSettings = () => useQuery({ queryKey: ['lab-settings'], queryFn: () => api.get<LabSettings>('/masters/settings/lab'), staleTime: 300_000 });

export function TotalsBox({ t, extra }: { t: ReturnType<typeof calculateTotals>; extra?: React.ReactNode }) {
  return (
    <table className="t" style={{ maxWidth: 360, marginLeft: 'auto' }}>
      <tbody>
        <tr>
          <td>Sub-total</td>
          <td className="num">{formatINR(t.subtotal)}</td>
        </tr>
        {t.discountAmount > 0 && (
          <tr>
            <td>Discount</td>
            <td className="num">− {formatINR(t.discountAmount)}</td>
          </tr>
        )}
        <tr>
          <td>Taxable value</td>
          <td className="num">{formatINR(t.taxable)}</td>
        </tr>
        {t.igstRate > 0 || (t.cgstRate === 0 && t.igst > 0) ? (
          <tr>
            <td>IGST @ {t.igstRate}%</td>
            <td className="num">{formatINR(t.igst)}</td>
          </tr>
        ) : (
          <>
            <tr>
              <td>CGST @ {t.cgstRate}%</td>
              <td className="num">{formatINR(t.cgst)}</td>
            </tr>
            <tr>
              <td>SGST @ {t.sgstRate}%</td>
              <td className="num">{formatINR(t.sgst)}</td>
            </tr>
          </>
        )}
        {t.roundOff !== 0 && (
          <tr>
            <td>Round off</td>
            <td className="num">{formatINR(t.roundOff)}</td>
          </tr>
        )}
        <tr>
          <td className="bold">Total</td>
          <td className="num bold">{formatINR(t.total)}</td>
        </tr>
        {extra}
      </tbody>
    </table>
  );
}

export function QuotationForm({ initial, id, onSaved, onCancel }: { initial: QuotationDraft; id?: string; onSaved: (r: { id: string }) => void; onCancel?: () => void }) {
  const [f, setF] = useState(initial);
  const set = <K extends keyof QuotationDraft>(k: K, v: QuotationDraft[K]) => setF((x) => ({ ...x, [k]: v }));
  const setItem = (i: number, k: keyof QuotationItemDraft, v: string | number) => setF((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const { data: lab } = useLabSettings();
  const { data: customers = [] } = useMaster<Customer>('customers');
  const { data: sections = [] } = useMaster<Section>('sections');
  const customer = customers.find((c) => c.id === f.customerId);

  const pos = f.placeOfSupplyStateCode || stateCodeFromGstin(customer?.gstin) || customer?.stateCode || lab?.stateCode || '';
  const totals = useMemo(
    () =>
      calculateTotals({
        lines: f.items.map((i) => ({ qty: i.qty, rate: i.rate })),
        discountType: f.discountType || null,
        discountValue: f.discountValue || 0,
        gstRate: lab?.gstRate ?? 18,
        gstType: lab ? gstTypeFor(lab.stateCode, pos) : 'INTRA',
      }),
    [f.items, f.discountType, f.discountValue, lab, pos],
  );

  const save = useAction(
    () => {
      const body = { ...f, discountType: f.discountType || null, discountValue: f.discountValue === '' ? null : f.discountValue, validUntil: f.validUntil || null, placeOfSupplyStateCode: f.placeOfSupplyStateCode || null };
      return id ? api.put<{ id: string }>(`/quotations/${id}`, body) : api.post<{ id: string }>('/quotations', body);
    },
    { success: 'Quotation saved', invalidate: [['/quotations'], ['quotation', id]], onDone: onSaved },
  );
  const err = (k: string) => fieldErr(save.error, k);

  return (
    <div className="grid">
      <Card title="Customer & terms">
        <div className="grid">
          <CustomerContactPicker customerId={f.customerId} contactId={f.contactId} onChange={(c, ct) => setF((x) => ({ ...x, customerId: c, contactId: ct }))} errors={{ customerId: err('customerId') }} />
          <div className="grid g4">
            <Field label="Quotation date" required error={err('date')}>
              <Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
            </Field>
            <Field label="Valid until" hint={`Default ${lab?.quotationValidityDays ?? 30} days`}>
              <Input type="date" value={f.validUntil} onChange={(e) => set('validUntil', e.target.value)} />
            </Field>
            <Field label="Place of supply (state code)" hint={pos ? (pos === lab?.stateCode ? 'Intra-state: CGST + SGST' : 'Inter-state: IGST') : undefined} error={err('placeOfSupplyStateCode')}>
              <Input value={f.placeOfSupplyStateCode} placeholder={pos} maxLength={2} onChange={(e) => set('placeOfSupplyStateCode', e.target.value)} />
            </Field>
            <Field label="Discount">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Select style={{ width: 90 }} value={f.discountType} onChange={(e) => set('discountType', e.target.value as QuotationDraft['discountType'])} options={[{ value: '', label: 'None' }, { value: 'PERCENT', label: '%' }, { value: 'AMOUNT', label: '₹' }]} aria-label="Discount type" />
                <Input type="number" min={0} step="0.01" disabled={!f.discountType} value={f.discountValue} onChange={(e) => set('discountValue', e.target.value === '' ? '' : Number(e.target.value))} aria-label="Discount value" />
              </div>
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Tests, methods & pricing" flush actions={<TestPicker onPick={(t) => set('items', [...f.items, { testId: t.id, sampleDescription: '', testName: t.name, method: t.method, specification: t.specification ?? '', unit: t.unit ?? '', sectionId: t.sectionId, qty: 1, rate: Number(t.rate) }])} />}>
        {err('items') && <div className="alert bad" style={{ margin: 12 }}>{err('items')}</div>}
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>Sample / item</th>
                <th style={{ minWidth: 160 }}>Test</th>
                <th style={{ minWidth: 140 }}>Method</th>
                <th style={{ minWidth: 110 }}>Specification</th>
                <th style={{ minWidth: 110 }}>Section</th>
                <th style={{ width: 70 }}>Qty</th>
                <th style={{ width: 110 }}>Rate (₹)</th>
                <th className="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {f.items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <Input value={it.sampleDescription} onChange={(e) => setItem(i, 'sampleDescription', e.target.value)} aria-label="Sample description" />
                  </td>
                  <td>
                    <Input value={it.testName} onChange={(e) => setItem(i, 'testName', e.target.value)} aria-label="Test name" />
                  </td>
                  <td>
                    <Input value={it.method} onChange={(e) => setItem(i, 'method', e.target.value)} aria-label="Method" />
                  </td>
                  <td>
                    <Input value={it.specification} onChange={(e) => setItem(i, 'specification', e.target.value)} aria-label="Specification" />
                  </td>
                  <td>
                    <Select value={it.sectionId ?? ''} onChange={(e) => setItem(i, 'sectionId', e.target.value)} placeholder="—" options={sections.map((s) => ({ value: s.id, label: s.name }))} aria-label="Section" />
                  </td>
                  <td>
                    <Input type="number" min={1} value={it.qty} onChange={(e) => setItem(i, 'qty', Number(e.target.value))} aria-label="Quantity" />
                  </td>
                  <td>
                    <Input type="number" min={0} step="0.01" value={it.rate} onChange={(e) => setItem(i, 'rate', Number(e.target.value))} aria-label="Rate" />
                  </td>
                  <td className="num">{formatINR(totals.lineAmounts[i])}</td>
                  <td>
                    <Btn size="sm" kind="ghost" onClick={() => set('items', f.items.filter((_, j) => j !== i))} aria-label="Remove line">
                      ✕
                    </Btn>
                  </td>
                </tr>
              ))}
              {!f.items.length && (
                <tr>
                  <td colSpan={9} className="empty">
                    Add tests from the test master using the picker above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: 16 }}>
          <TotalsBox t={totals} />
          <div className="small muted right">Totals are recalculated and stored by the server on save.</div>
        </div>
      </Card>

      <Card
        title="Remarks & terms"
        footer={
          <>
            {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
            <Btn kind="pri" loading={save.isPending} onClick={() => save.mutate()}>
              Save draft
            </Btn>
          </>
        }
      >
        <div className="grid g2">
          <Field label="Remarks">
            <Textarea value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </Field>
          <Field label="Terms & conditions" hint="Defaults from Lab settings">
            <Textarea rows={5} value={f.terms} onChange={(e) => set('terms', e.target.value)} />
          </Field>
        </div>
        <ErrorBox error={save.error} />
      </Card>
    </div>
  );
}

export const emptyQuotation = (terms = ''): QuotationDraft => ({
  date: isoDate(),
  validUntil: '',
  enquiryId: null,
  customerId: '',
  contactId: '',
  placeOfSupplyStateCode: '',
  discountType: '',
  discountValue: '',
  terms,
  remarks: '',
  items: [],
});
