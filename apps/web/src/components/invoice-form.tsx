'use client';

import { useMemo, useState } from 'react';
import { calculateTotals, gstTypeFor, stateCodeFromGstin, TAX_RELAXATION_LABELS, TAX_RELAXATIONS, type TaxRelaxation } from '@lims/shared';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { useAction, useMaster, type Customer } from '@/lib/hooks';
import { CustomerContactPicker } from './pickers';
import { TotalsBox, useLabSettings } from './quotation-form';
import { Btn, Card, ErrorBox, Field, fieldErr, Input, Select, Textarea } from './ui';

export interface InvoiceItemDraft {
  registrationId: string | null;
  description: string;
  sacCode: string;
  qty: number;
  rate: number;
}
export interface InvoiceDraft {
  date: string;
  customerId: string;
  contactId: string;
  quotationId: string | null;
  purchaseOrderId: string | null;
  placeOfSupplyStateCode: string;
  taxRelaxation: TaxRelaxation;
  relaxationReference: string;
  discountType: '' | 'PERCENT' | 'AMOUNT';
  discountValue: number | '';
  advanceReceived: number | '';
  advanceReference: string;
  terms: string;
  remarks: string;
  items: InvoiceItemDraft[];
}

export function InvoiceForm({ initial, id, onSaved, onCancel, context }: { initial: InvoiceDraft; id?: string; onSaved: (r: { id: string }) => void; onCancel?: () => void; context?: React.ReactNode }) {
  const [f, setF] = useState(initial);
  const set = <K extends keyof InvoiceDraft>(k: K, v: InvoiceDraft[K]) => setF((x) => ({ ...x, [k]: v }));
  const setItem = (i: number, k: keyof InvoiceItemDraft, v: string | number) => setF((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const { data: lab } = useLabSettings();
  const { data: customers = [] } = useMaster<Customer>('customers');
  const customer = customers.find((c) => c.id === f.customerId);
  const pos = f.placeOfSupplyStateCode || stateCodeFromGstin(customer?.gstin) || customer?.stateCode || lab?.stateCode || '';
  const totals = useMemo(
    () =>
      calculateTotals({
        lines: f.items,
        discountType: f.discountType || null,
        discountValue: f.discountValue || 0,
        gstRate: lab?.gstRate ?? 18,
        gstType: lab ? gstTypeFor(lab.stateCode, pos) : 'INTRA',
        taxRelaxation: f.taxRelaxation,
        advance: f.advanceReceived || 0,
      }),
    [f, lab, pos],
  );
  const save = useAction(
    () => {
      const body = { ...f, discountType: f.discountType || null, discountValue: f.discountValue === '' ? null : f.discountValue, advanceReceived: f.advanceReceived === '' ? null : f.advanceReceived, placeOfSupplyStateCode: f.placeOfSupplyStateCode || null };
      return id ? api.put<{ id: string }>(`/invoices/${id}`, body) : api.post<{ id: string }>('/invoices', body);
    },
    { success: 'Invoice saved', invalidate: [['/invoices'], ['invoice', id], ['billable']], onDone: onSaved },
  );
  const err = (k: string) => fieldErr(save.error, k);

  return (
    <div className="grid">
      <Card title="Bill to">
        <div className="grid">
          {context}
          <CustomerContactPicker customerId={f.customerId} contactId={f.contactId} onChange={(c, ct) => setF((x) => ({ ...x, customerId: c, contactId: ct }))} errors={{ customerId: err('customerId') }} disabled={Boolean(f.items.some((i) => i.registrationId))} />
          <div className="grid g4">
            <Field label="Invoice date" required>
              <Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
            </Field>
            <Field label="Place of supply (state code)" hint={pos === lab?.stateCode ? 'Intra-state: CGST + SGST' : 'Inter-state: IGST'}>
              <Input value={f.placeOfSupplyStateCode} placeholder={pos} maxLength={2} onChange={(e) => set('placeOfSupplyStateCode', e.target.value)} />
            </Field>
            <Field label="Tax relaxation">
              <Select value={f.taxRelaxation} onChange={(e) => set('taxRelaxation', e.target.value as TaxRelaxation)} options={TAX_RELAXATIONS.map((t) => ({ value: t, label: TAX_RELAXATION_LABELS[t] }))} />
            </Field>
            <Field label="LUT / exemption reference" required={f.taxRelaxation !== 'NONE'} error={err('relaxationReference')}>
              <Input disabled={f.taxRelaxation === 'NONE'} value={f.relaxationReference} onChange={(e) => set('relaxationReference', e.target.value)} />
            </Field>
          </div>
          <div className="grid g4">
            <Field label="Discount">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Select style={{ width: 90 }} value={f.discountType} onChange={(e) => set('discountType', e.target.value as InvoiceDraft['discountType'])} options={[{ value: '', label: 'None' }, { value: 'PERCENT', label: '%' }, { value: 'AMOUNT', label: '₹' }]} aria-label="Discount type" />
                <Input type="number" min={0} step="0.01" disabled={!f.discountType} value={f.discountValue} onChange={(e) => set('discountValue', e.target.value === '' ? '' : Number(e.target.value))} aria-label="Discount value" />
              </div>
            </Field>
            <Field label="Advance received (₹)">
              <Input type="number" min={0} step="0.01" value={f.advanceReceived} onChange={(e) => set('advanceReceived', e.target.value === '' ? '' : Number(e.target.value))} />
            </Field>
            <Field label="Advance reference">
              <Input value={f.advanceReference} onChange={(e) => set('advanceReference', e.target.value)} placeholder="UTR / receipt no." />
            </Field>
          </div>
        </div>
      </Card>
      <Card title="Charges" flush actions={<Btn size="sm" onClick={() => set('items', [...f.items, { registrationId: null, description: '', sacCode: lab?.sacCode ?? '998346', qty: 1, rate: 0 }])}>+ Add line</Btn>}>
        {err('items') && <div className="alert bad" style={{ margin: 12 }}>{err('items')}</div>}
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th style={{ minWidth: 300 }}>Description</th>
                <th style={{ width: 100 }}>SAC</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 120 }}>Rate (₹)</th>
                <th className="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {f.items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <Input value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} aria-label="Description" />
                  </td>
                  <td>
                    <Input value={it.sacCode} onChange={(e) => setItem(i, 'sacCode', e.target.value)} aria-label="SAC code" />
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
            </tbody>
          </table>
        </div>
        <div style={{ padding: 16 }}>
          <TotalsBox
            t={totals}
            extra={
              totals.advance > 0 && (
                <>
                  <tr>
                    <td>Less: advance</td>
                    <td className="num">− {formatINR(totals.advance)}</td>
                  </tr>
                  <tr>
                    <td className="bold">Balance due</td>
                    <td className="num bold">{formatINR(totals.balanceDue)}</td>
                  </tr>
                </>
              )
            }
          />
        </div>
      </Card>
      <Card
        footer={
          <>
            {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
            <Btn kind="pri" loading={save.isPending} onClick={() => save.mutate()}>
              Save draft invoice
            </Btn>
          </>
        }
      >
        <div className="grid g2">
          <Field label="Remarks">
            <Textarea value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </Field>
          <Field label="Terms">
            <Textarea rows={4} value={f.terms} onChange={(e) => set('terms', e.target.value)} />
          </Field>
        </div>
        <ErrorBox error={save.error} />
      </Card>
    </div>
  );
}
