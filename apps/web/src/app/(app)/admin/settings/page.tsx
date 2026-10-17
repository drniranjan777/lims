'use client';

import { useEffect, useState } from 'react';
import { REGISTRATION_TEMPLATES, type LabSettings } from '@lims/shared';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { TEMPLATE_LABELS } from '@/lib/format';
import { useLabSettings } from '@/components/quotation-form';
import { Btn, Card, ErrorBox, Field, fieldErr, Input, Loading, PageHead, Textarea } from '@/components/ui';

export default function SettingsPage() {
  const { data, isLoading } = useLabSettings();
  const [f, setF] = useState<LabSettings | null>(null);
  useEffect(() => {
    if (data) setF(data);
  }, [data]);
  const save = useAction(() => api.put('/masters/settings/lab', f), { success: 'Settings saved', invalidate: [['lab-settings']] });
  if (isLoading || !f) return <Loading />;
  const set = <K extends keyof LabSettings>(k: K, v: LabSettings[K]) => setF({ ...f, [k]: v });
  const err = (k: string) => fieldErr(save.error, k);
  const text = (k: keyof LabSettings, label: string, hint?: string) => (
    <Field label={label} error={err(k)} hint={hint}>
      <Input value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value as never)} />
    </Field>
  );
  return (
    <>
      <PageHead title="Lab settings" sub="Printed on quotations, reports and tax invoices, and used for GST, numbering and retention defaults." actions={<Btn kind="pri" loading={save.isPending} onClick={() => save.mutate()}>Save settings</Btn>} />
      <ErrorBox error={save.error} />
      <div className="grid g2">
        <Card title="Laboratory">
          <div className="grid">
            {text('labName', 'Laboratory name')}
            <Field label="Address">
              <Textarea rows={2} value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <div className="grid g2">
              {text('state', 'State')}
              {text('stateCode', 'State code', 'Used to decide CGST+SGST vs IGST')}
              {text('gstin', 'GSTIN')}
              {text('pan', 'PAN')}
              {text('phone', 'Phone')}
              {text('email', 'E-mail')}
              {text('nablCertificateNo', 'NABL certificate no.')}
            </div>
          </div>
        </Card>
        <Card title="Bank details (quotation & invoice)">
          <div className="grid g2">
            {text('bankName', 'Bank')}
            {text('bankAccount', 'Account number')}
            {text('bankIfsc', 'IFSC')}
            {text('bankBranch', 'Branch')}
          </div>
        </Card>
        <Card title="Commercial">
          <div className="grid g3">
            <Field label="GST rate (%)" error={err('gstRate')}>
              <Input type="number" value={f.gstRate} onChange={(e) => set('gstRate', Number(e.target.value))} />
            </Field>
            {text('sacCode', 'SAC code', '998346 = technical testing & analysis')}
            <Field label="Quotation validity (days)">
              <Input type="number" value={f.quotationValidityDays} onChange={(e) => set('quotationValidityDays', Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Default quotation terms">
            <Textarea rows={5} value={f.quotationTerms ?? ''} onChange={(e) => set('quotationTerms', e.target.value)} />
          </Field>
          <Field label="Default invoice terms">
            <Textarea rows={3} value={f.invoiceTerms ?? ''} onChange={(e) => set('invoiceTerms', e.target.value)} />
          </Field>
        </Card>
        <Card title="Sample retention">
          <div className="grid g3">
            <Field label="Default retention (months)">
              <Input type="number" value={f.defaultRetentionMonths} onChange={(e) => set('defaultRetentionMonths', Number(e.target.value))} />
            </Field>
            {REGISTRATION_TEMPLATES.map((t) => (
              <Field key={t} label={`${TEMPLATE_LABELS[t]} (months)`}>
                <Input type="number" value={f.retentionMonthsByTemplate[t] ?? ''} onChange={(e) => set('retentionMonthsByTemplate', { ...f.retentionMonthsByTemplate, [t]: Number(e.target.value) })} />
              </Field>
            ))}
          </div>
          <Field label="Approved disposal methods (one per line)">
            <Textarea rows={5} value={f.disposalMethods.join('\n')} onChange={(e) => set('disposalMethods', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} />
          </Field>
        </Card>
      </div>
    </>
  );
}
