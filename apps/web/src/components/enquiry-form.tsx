'use client';

import { useState } from 'react';
import { ENQUIRY_SOURCES } from '@lims/shared';
import { api } from '@/lib/api';
import { isoDate, SOURCE_LABELS } from '@/lib/format';
import { useAction, useMaster, type TestMaster } from '@/lib/hooks';
import { CustomerContactPicker, TestPicker, useSectionName } from './pickers';
import { Btn, Card, ErrorBox, Field, fieldErr, Input, Select, Textarea } from './ui';

export interface EnquiryDraft {
  date: string;
  source: string;
  customerId: string;
  contactId: string;
  queryReference: string;
  projectReference: string;
  receiptDetails: string;
  courierDetails: string;
  description: string;
  testIds: string[];
}

export const emptyEnquiry = (): EnquiryDraft => ({
  date: isoDate(),
  source: 'PHONE',
  customerId: '',
  contactId: '',
  queryReference: '',
  projectReference: '',
  receiptDetails: '',
  courierDetails: '',
  description: '',
  testIds: [],
});

export function EnquiryForm({ initial, id, onSaved, onCancel }: { initial: EnquiryDraft; id?: string; onSaved: (r: { id: string }) => void; onCancel?: () => void }) {
  const [f, setF] = useState(initial);
  const set = <K extends keyof EnquiryDraft>(k: K, v: EnquiryDraft[K]) => setF((x) => ({ ...x, [k]: v }));
  const { data: tests = [] } = useMaster<TestMaster>('tests');
  const sectionName = useSectionName();
  const save = useAction(() => (id ? api.put<{ id: string }>(`/enquiries/${id}`, f) : api.post<{ id: string }>('/enquiries', f)), {
    success: id ? 'Enquiry updated' : 'Enquiry created',
    invalidate: [['/enquiries']],
    onDone: onSaved,
  });
  const err = (k: string) => fieldErr(save.error, k);

  return (
    <Card
      title="Enquiry details"
      footer={
        <>
          {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
          <Btn kind="pri" loading={save.isPending} onClick={() => save.mutate()}>
            Save enquiry
          </Btn>
        </>
      }
    >
      <div className="grid">
        <div className="grid g3">
          <Field label="Enquiry date" required error={err('date')}>
            <Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Source of enquiry" required error={err('source')}>
            <Select value={f.source} onChange={(e) => set('source', e.target.value)} options={ENQUIRY_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))} />
          </Field>
          <Field label="Query reference" error={err('queryReference')}>
            <Input value={f.queryReference} onChange={(e) => set('queryReference', e.target.value)} />
          </Field>
        </div>
        <CustomerContactPicker customerId={f.customerId} contactId={f.contactId} onChange={(c, ct) => setF((x) => ({ ...x, customerId: c, contactId: ct }))} errors={{ customerId: err('customerId'), contactId: err('contactId') }} />
        <div className="grid g3">
          <Field label="Project reference">
            <Input value={f.projectReference} onChange={(e) => set('projectReference', e.target.value)} />
          </Field>
          <Field label="Receipt details">
            <Input value={f.receiptDetails} onChange={(e) => set('receiptDetails', e.target.value)} />
          </Field>
          <Field label="Courier details">
            <Input value={f.courierDetails} onChange={(e) => set('courierDetails', e.target.value)} />
          </Field>
        </div>
        <Field label="Query / requirement">
          <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div>
          <h3 style={{ marginBottom: 8 }}>Required tests</h3>
          <TestPicker exclude={f.testIds} onPick={(t) => set('testIds', [...f.testIds, t.id])} />
          {f.testIds.length > 0 && (
            <table className="t mt">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Method</th>
                  <th>Section</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {f.testIds.map((tid) => {
                  const t = tests.find((x) => x.id === tid);
                  return (
                    <tr key={tid}>
                      <td>{t?.name ?? tid}</td>
                      <td>{t?.method}</td>
                      <td>{sectionName(t?.sectionId)}</td>
                      <td className="right">
                        <Btn size="sm" kind="ghost" onClick={() => set('testIds', f.testIds.filter((x) => x !== tid))} aria-label="Remove test">
                          ✕
                        </Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <ErrorBox error={save.error} />
      </div>
    </Card>
  );
}
