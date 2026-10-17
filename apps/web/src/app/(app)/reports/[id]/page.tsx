'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/format';
import { useCan } from '@/components/providers';
import { History } from '@/components/history';
import { SignDialog } from '@/components/sign';
import { Btn, Card, Check, ErrorBox, Field, Input, KV, Loading, PageHead, Select, Status, Steps, Textarea } from '@/components/ui';

interface Report {
  id: string;
  number: string;
  revision: number;
  status: string;
  format: 'STANDARD' | 'VALIDATION';
  includeNabl: boolean;
  includeSpecification: boolean;
  issuedToName: string;
  issuedToAddress: string | null;
  issuedToContact: string | null;
  remarks: string | null;
  validationSummary: string | null;
  sectionId: string | null;
  section: { name: string } | null;
  registration: { id: string; number: string; sampleName: string; customer: { name: string }; sections: { sectionId: string; status: string }[] };
  blockers: string[];
  createdByName: string | null;
  previewedByName: string | null;
  previewedAt: string | null;
  releasedByName: string | null;
  releasedAt: string | null;
}

const STEPS = ['Draft', 'Preview', 'Released', 'Dispatched'];

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const can = useCan();
  const qc = useQueryClient();
  const [signing, setSigning] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const { data: r, isLoading, error, refetch } = useQuery({ queryKey: ['report', id], queryFn: () => api.get<Report>(`/reports/${id}`) });
  const [f, setF] = useState<Partial<Report>>({});
  useEffect(() => {
    if (r) setF({ issuedToName: r.issuedToName, issuedToAddress: r.issuedToAddress ?? '', issuedToContact: r.issuedToContact ?? '', includeNabl: r.includeNabl, includeSpecification: r.includeSpecification, format: r.format, remarks: r.remarks ?? '', validationSummary: r.validationSummary ?? '' });
  }, [r]);
  const save = useAction(() => api.put(`/reports/${id}`, f), { success: 'Report updated — preview again before release', invalidate: [['report', id], ['history', 'Report', id]] });

  if (isLoading) return <Loading />;
  if (error || !r) return <ErrorBox error={error} />;
  const locked = r.status === 'RELEASED' || r.status === 'DISPATCHED';
  const editCustomer = !locked && can('report.editCustomer');
  const editOptions = !locked && can('report.release');
  const step = STEPS.findIndex((s) => s.toUpperCase() === r.status);
  const openPreview = () => {
    window.open(fileUrl(`/reports/${id}/preview`), '_blank', 'noopener');
    // the preview request marks the report as previewed
    setTimeout(() => (void refetch(), setPreviewKey((k) => k + 1)), 1500);
  };

  return (
    <>
      <PageHead
        title={
          <span className="row">
            {r.number}
            {r.revision > 0 && <span className="chip warn">Rev {r.revision}</span>} <Status s={r.status} />
          </span>
        }
        sub={`${r.registration.number} · ${r.registration.sampleName} · ${r.section?.name ?? 'Combined report (all sections)'}`}
        crumbs={[{ href: '/reports', label: 'Reports' }]}
        actions={
          <>
            {!locked && (can('report.release') || can('report.editCustomer')) && <Btn onClick={openPreview}>Preview PDF</Btn>}
            {!locked && can('report.release') && (
              <Btn kind="pri" disabled={r.status !== 'PREVIEW' || r.blockers.length > 0} title={r.status !== 'PREVIEW' ? 'Preview the report first' : undefined} onClick={() => setSigning(true)}>
                Release report
              </Btn>
            )}
            {locked && (
              <a className="btn pri" href={fileUrl(`/reports/${id}/pdf`)} target="_blank" rel="noreferrer">
                Download released PDF
              </a>
            )}
            {r.status === 'RELEASED' && can('dispatch.record') && (
              <Link className="btn" href={`/dispatch?report=${id}`}>
                Dispatch
              </Link>
            )}
          </>
        }
      />
      <Card>
        <Steps steps={STEPS} current={locked ? step : r.status === 'PREVIEW' ? 1 : 0} />
      </Card>
      {r.blockers.length > 0 && (
        <div className="alert warn mt">
          <b>Not ready for release</b>
          <ul>
            {r.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="split mt">
        <div>
          <Card
            title="Report details"
            footer={
              (editCustomer || editOptions) && (
                <Btn kind="pri" loading={save.isPending} onClick={() => save.mutate()}>
                  Save changes
                </Btn>
              )
            }
          >
            <div className="grid">
              <div className="grid g2">
                <Field label="Issued to (customer name)" hint={editCustomer ? undefined : 'Editable by authorized approvers only'}>
                  <Input disabled={!editCustomer} value={f.issuedToName} onChange={(e) => setF({ ...f, issuedToName: e.target.value })} />
                </Field>
                <Field label="Contact person">
                  <Input disabled={!editCustomer} value={f.issuedToContact ?? ''} onChange={(e) => setF({ ...f, issuedToContact: e.target.value })} />
                </Field>
              </div>
              <Field label="Address">
                <Textarea rows={2} disabled={!editCustomer} value={f.issuedToAddress ?? ''} onChange={(e) => setF({ ...f, issuedToAddress: e.target.value })} />
              </Field>
              <div className="grid g3">
                <Field label="Format">
                  <Select disabled={!editOptions} value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as Report['format'] })} options={[{ value: 'STANDARD', label: 'Standard test report' }, { value: 'VALIDATION', label: 'Validation / Verification' }]} />
                </Field>
                <div style={{ paddingTop: 22 }}>
                  <Check label="NABL symbol" disabled={!editOptions} checked={Boolean(f.includeNabl)} onChange={(v) => setF({ ...f, includeNabl: v })} />
                </div>
                <div style={{ paddingTop: 22 }}>
                  <Check label="Specification limits" disabled={!editOptions} checked={Boolean(f.includeSpecification)} onChange={(v) => setF({ ...f, includeSpecification: v })} />
                </div>
              </div>
              <Field label="Report remarks">
                <Textarea disabled={!editOptions} value={f.remarks ?? ''} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
              </Field>
              {f.format === 'VALIDATION' && (
                <Field label="Summary & conclusion (validation report)">
                  <Textarea rows={5} disabled={!editOptions} value={f.validationSummary ?? ''} onChange={(e) => setF({ ...f, validationSummary: e.target.value })} />
                </Field>
              )}
              <ErrorBox error={save.error} />
            </div>
          </Card>
          {locked && (
            <Card title="Released report" className="mt" flush>
              <iframe key={previewKey} title="Released report" src={fileUrl(`/reports/${id}/pdf`)} style={{ width: '100%', height: 720, border: 0, display: 'block' }} />
            </Card>
          )}
        </div>
        <div>
          <Card title="Sign-off">
            <KV
              rows={[
                ['Customer', r.registration.customer.name],
                ['Registration', <Link key="r" href={`/registrations/${r.registration.id}`}>{r.registration.number}</Link>],
                ['Created by', r.createdByName],
                ['Previewed', r.previewedAt ? `${r.previewedByName} · ${fmtDateTime(r.previewedAt)}` : 'Not yet'],
                ['Released', r.releasedAt ? `${r.releasedByName} · ${fmtDateTime(r.releasedAt)}` : 'Not yet'],
              ]}
            />
            <p className="small muted">Only final results appear on the report; observations and working data stay on the registration record.</p>
          </Card>
          <div className="mt">
            <History entityType="Report" entityId={id} />
          </div>
        </div>
      </div>
      {signing && (
        <SignDialog
          title={`Release ${r.number}`}
          meaning={`You release this ${r.section ? `${r.section.name} section` : 'combined'} report for ${r.registration.customer.name}. The released PDF is locked and its SHA-256 fingerprint recorded.`}
          confirmLabel="Release & sign"
          onClose={() => setSigning(false)}
          onSign={async (password) => {
            await api.post(`/reports/${id}/release`, { password });
            await refetch();
            qc.invalidateQueries({ queryKey: ['/reports'] });
          }}
        />
      )}
    </>
  );
}
