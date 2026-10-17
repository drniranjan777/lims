'use client';

import { useState } from 'react';
import { REGISTRATION_TEMPLATES, REPORT_TYPE_LABELS, REPORT_TYPES } from '@lims/shared';
import { api } from '@/lib/api';
import { TEMPLATE_FIELDS, TEMPLATE_LABELS } from '@/lib/format';
import { useAction, useMaster, type Section } from '@/lib/hooks';
import { useCan } from './providers';
import { TestPicker } from './pickers';
import { Btn, Card, ErrorBox, Field, fieldErr, Input, Select, Textarea } from './ui';

export interface RegTestDraft {
  id?: string;
  testId: string | null;
  sourceQuotationItemId: string | null;
  sectionId: string;
  testName: string;
  method: string;
  specification: string;
  unit: string;
  reportType: string;
  replicates: number;
  nablAccredited: boolean;
  formulaId: string | null;
  decimals: number;
}
export interface RegDraft {
  template: string;
  sampleName: string;
  sampleDescription: string;
  quantity: string;
  condition: string;
  templateData: Record<string, string>;
  remarks: string;
  tests: RegTestDraft[];
}

export function RegistrationForm({ initial, receiptId, id, onSaved, onCancel, quotationItems = [] }: { initial: RegDraft; receiptId?: string; id?: string; onSaved: (r: { id: string }) => void; onCancel?: () => void; quotationItems?: string[] }) {
  const can = useCan();
  const editMethods = can('test.editMethod');
  const [f, setF] = useState(initial);
  const { data: sections = [] } = useMaster<Section>('sections');
  const { data: formulas = [] } = useMaster<{ id: string; name: string; code: string }>('formulas', { active: 'true' });
  const set = <K extends keyof RegDraft>(k: K, v: RegDraft[K]) => setF((x) => ({ ...x, [k]: v }));
  const setT = (i: number, k: keyof RegTestDraft, v: unknown) => setF((x) => ({ ...x, tests: x.tests.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));
  const fields = TEMPLATE_FIELDS[f.template] ?? [];

  const save = useAction(() => (id ? api.put<{ id: string }>(`/registrations/${id}`, f) : api.post<{ id: string }>('/registrations', { ...f, receiptId })), {
    success: id ? 'Registration updated' : 'Sample pre-registered — sent for verification',
    invalidate: [['/registrations'], ['registration', id], ['/receipts']],
    onDone: onSaved,
  });
  const err = (k: string) => fieldErr(save.error, k);

  return (
    <div className="grid">
      <Card title="Registration template">
        <div className="row" role="radiogroup" aria-label="Registration template">
          {REGISTRATION_TEMPLATES.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={f.template === t} className={`btn ${f.template === t ? 'pri' : ''}`} onClick={() => set('template', t)}>
              {TEMPLATE_LABELS[t]}
            </button>
          ))}
        </div>
        {f.template === 'OM' && <div className="small muted mt">OM template fields are provisional — awaiting confirmation from Lucid Labs.</div>}
      </Card>

      <Card title="Sample details">
        <div className="grid">
          <div className="grid g3">
            <Field label="Sample name" required error={err('sampleName')}>
              <Input value={f.sampleName} onChange={(e) => set('sampleName', e.target.value)} />
            </Field>
            <Field label="Quantity received">
              <Input value={f.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="e.g. 2 × 50 g" />
            </Field>
            <Field label="Condition">
              <Input value={f.condition} onChange={(e) => set('condition', e.target.value)} />
            </Field>
          </div>
          <div className="grid g3">
            {fields.map((k) => (
              <Field key={k} label={k}>
                <Input value={f.templateData[k] ?? ''} onChange={(e) => set('templateData', { ...f.templateData, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
          <Field label="Sample description">
            <Textarea rows={2} value={f.sampleDescription} onChange={(e) => set('sampleDescription', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card
        title="Test group"
        flush
        actions={editMethods ? <TestPicker label="Add test not on quotation" onPick={(t) => set('tests', [...f.tests, { testId: t.id, sourceQuotationItemId: null, sectionId: t.sectionId, testName: t.name, method: t.method, specification: t.specification ?? '', unit: t.unit ?? '', reportType: t.reportType, replicates: t.replicates, nablAccredited: t.nablAccredited, formulaId: t.formulaId, decimals: t.decimals }])} /> : <span className="small muted">Tests & methods copied from the quotation. Changes need a Registration Reviewer.</span>}
      >
        {err('tests') && <div className="alert bad" style={{ margin: 12 }}>{err('tests')}</div>}
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th style={{ minWidth: 170 }}>Test</th>
                <th style={{ minWidth: 150 }}>Method</th>
                <th style={{ minWidth: 110 }}>Specification</th>
                <th style={{ width: 80 }}>Unit</th>
                <th style={{ minWidth: 120 }}>Section</th>
                <th style={{ minWidth: 150 }}>Report type</th>
                <th style={{ width: 70 }}>Repl.</th>
                <th style={{ minWidth: 130 }}>Formula</th>
                <th>NABL</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {f.tests.map((t, i) => {
                const fromQuote = Boolean(t.sourceQuotationItemId && quotationItems.includes(t.sourceQuotationItemId));
                const locked = !editMethods;
                return (
                  <tr key={t.id ?? `${t.sourceQuotationItemId}-${i}`}>
                    <td>
                      <Input disabled={locked} value={t.testName} onChange={(e) => setT(i, 'testName', e.target.value)} aria-label="Test name" />
                      {fromQuote && <div className="small faint">from quotation</div>}
                    </td>
                    <td>
                      <Input disabled={locked} value={t.method} onChange={(e) => setT(i, 'method', e.target.value)} aria-label="Method" />
                    </td>
                    <td>
                      <Input value={t.specification} onChange={(e) => setT(i, 'specification', e.target.value)} aria-label="Specification" />
                    </td>
                    <td>
                      <Input value={t.unit} onChange={(e) => setT(i, 'unit', e.target.value)} aria-label="Unit" />
                    </td>
                    <td>
                      <Select value={t.sectionId} onChange={(e) => setT(i, 'sectionId', e.target.value)} placeholder="Select…" options={sections.map((s) => ({ value: s.id, label: s.name }))} aria-label="Section" />
                    </td>
                    <td>
                      <Select value={t.reportType} onChange={(e) => setT(i, 'reportType', e.target.value)} options={REPORT_TYPES.map((r) => ({ value: r, label: REPORT_TYPE_LABELS[r] }))} aria-label="Report type" />
                    </td>
                    <td>
                      <Input type="number" min={1} max={5} value={t.replicates} onChange={(e) => setT(i, 'replicates', Number(e.target.value))} aria-label="Replicates" />
                    </td>
                    <td>
                      <Select value={t.formulaId ?? ''} onChange={(e) => setT(i, 'formulaId', e.target.value || null)} placeholder="Direct entry" options={formulas.map((x) => ({ value: x.id, label: x.name }))} aria-label="Formula" />
                    </td>
                    <td>
                      <input type="checkbox" checked={t.nablAccredited} onChange={(e) => setT(i, 'nablAccredited', e.target.checked)} aria-label="NABL accredited" />
                    </td>
                    <td>
                      <Btn size="sm" kind="ghost" onClick={() => set('tests', f.tests.filter((_, j) => j !== i))} aria-label="Remove test">
                        ✕
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        footer={
          <>
            {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
            <Btn kind="pri" loading={save.isPending} onClick={() => save.mutate()}>
              {id ? 'Save changes' : 'Pre-register sample'}
            </Btn>
          </>
        }
      >
        <Field label="Remarks">
          <Textarea value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
        </Field>
        <div className="mt">
          <ErrorBox error={save.error} />
        </div>
      </Card>
    </div>
  );
}
