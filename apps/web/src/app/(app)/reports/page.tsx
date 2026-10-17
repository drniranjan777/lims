'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { REPORT_STATUS, statusLabel } from '@lims/shared';
import { api } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import { useCan } from '@/components/providers';
import { Btn, Card, Check, Empty, ErrorBox, Field, Loading, Modal, PageHead, Pager, Search, Select, Status, Textarea } from '@/components/ui';

interface Row {
  id: string;
  number: string;
  revision: number;
  status: string;
  sectionName: string;
  releasedAt: string | null;
  createdAt: string;
  includeNabl: boolean;
  format: string;
  registration: { id: string; number: string; sampleName: string; customer: { name: string } };
}
interface Candidate {
  id: string;
  number: string;
  sampleName: string;
  status: string;
  customer: { name: string };
  sections: { sectionId: string; status: string; name?: string }[];
  reports: { id: string; number: string; status: string; sectionId: string | null }[];
}

function NewReport({ c, onClose }: { c: Candidate; onClose: () => void }) {
  const router = useRouter();
  const allDone = c.sections.every((s) => s.status === 'COMPLETED');
  const [f, setF] = useState({ sectionId: allDone || c.sections.length === 1 ? '' : c.sections.find((s) => s.status === 'COMPLETED')?.sectionId ?? '', includeNabl: false, includeSpecification: true, format: 'STANDARD', reason: '' });
  const existsReleased = c.reports.some((r) => (r.sectionId ?? '') === f.sectionId && ['RELEASED', 'DISPATCHED'].includes(r.status));
  const create = useAction(() => api.post<{ id: string }>('/reports', { registrationId: c.id, ...f, sectionId: f.sectionId || null }), { success: 'Report created', invalidate: [['/reports']], onDone: (r) => router.push(`/reports/${r.id}`) });
  return (
    <Modal
      title={`New report — ${c.number}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="pri" loading={create.isPending} disabled={existsReleased && !f.reason.trim()} onClick={() => create.mutate()}>
            Create report
          </Btn>
        </>
      }
    >
      <div className="grid">
        <Field label="Scope" hint={c.sections.length > 1 ? 'A combined report can be released only after every section completes.' : undefined}>
          <Select value={f.sectionId} onChange={(e) => setF({ ...f, sectionId: e.target.value })} options={[...(c.sections.length > 1 ? [{ value: '', label: `Combined — all ${c.sections.length} sections${allDone ? '' : ' (not all complete)'}` }] : [{ value: '', label: 'Full report' }]), ...(c.sections.length > 1 ? c.sections.map((s) => ({ value: s.sectionId, label: `${s.name} only${s.status === 'COMPLETED' ? '' : ' (in progress)'}` })) : [])]} />
        </Field>
        <Field label="Format">
          <Select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })} options={[{ value: 'STANDARD', label: 'Standard test report' }, { value: 'VALIDATION', label: 'Validation / Verification (book-style)' }]} />
        </Field>
        <Check label="With NABL symbol" checked={f.includeNabl} onChange={(v) => setF({ ...f, includeNabl: v })} />
        <Check label="With specification limits & conformity" checked={f.includeSpecification} onChange={(v) => setF({ ...f, includeSpecification: v })} />
        {existsReleased && (
          <Field label="Reason for revised report" required>
            <Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </Field>
        )}
        <ErrorBox error={create.error} />
      </div>
    </Modal>
  );
}

export default function ReportsPage() {
  const can = useCan();
  const router = useRouter();
  const params = useSearchParams();
  const list = useList<Row>('/reports', { status: params.get('status') ?? '', extra: { registrationId: params.get('registration') ?? undefined } });
  const cands = useQuery({ queryKey: ['report-candidates'], queryFn: () => api.get<Candidate[]>('/reports/candidates'), enabled: can('report.release') });
  const [creating, setCreating] = useState<Candidate | null>(null);
  const ready = (cands.data ?? []).filter((c) => !c.reports.some((r) => !r.sectionId && ['DRAFT', 'PREVIEW', 'RELEASED', 'DISPATCHED'].includes(r.status)));
  return (
    <>
      <PageHead title="Reports" sub="Preview, generate and release test reports — with or without NABL symbol and specification limits (§4.8–4.10)." />
      {can('report.release') && (
        <Card title="Ready for reporting" flush>
          {cands.isLoading ? (
            <Loading />
          ) : !ready.length ? (
            <Empty>No registrations with approved results waiting for a report.</Empty>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Sample</th>
                  <th>Customer</th>
                  <th>Sections</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ready.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">
                      <Link href={`/registrations/${c.id}`}>{c.number}</Link>
                    </td>
                    <td>{c.sampleName}</td>
                    <td>{c.customer.name}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {c.sections.map((s) => (
                          <Status key={s.sectionId} s={s.status} label={s.name} />
                        ))}
                      </div>
                    </td>
                    <td className="right">
                      <Btn size="sm" kind="pri" onClick={() => setCreating(c)}>
                        Create report
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      <Card
        className="mt"
        flush
        title={
          <div className="row">
            <Search value={list.q} onChange={list.setQ} placeholder="Search report, registration, sample" />
            <Select value={list.status} onChange={(e) => list.setStatus(e.target.value)} placeholder="All statuses" options={REPORT_STATUS.map((s) => ({ value: s, label: statusLabel(s) }))} aria-label="Status filter" />
          </div>
        }
      >
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty>No reports found.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Report no.</th>
                  <th>Registration</th>
                  <th>Customer</th>
                  <th>Scope</th>
                  <th>Options</th>
                  <th>Released</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((r) => (
                  <tr key={r.id} className="click" onClick={() => router.push(`/reports/${r.id}`)}>
                    <td className="mono">
                      <Link href={`/reports/${r.id}`}>{r.number}</Link>
                      {r.revision > 0 && <span className="chip warn" style={{ marginLeft: 6 }}>Rev {r.revision}</span>}
                    </td>
                    <td className="mono small">
                      {r.registration.number}
                      <div className="muted">{r.registration.sampleName}</div>
                    </td>
                    <td>{r.registration.customer.name}</td>
                    <td>{r.sectionName}</td>
                    <td className="small">
                      {r.format === 'VALIDATION' ? 'Validation · ' : ''}
                      {r.includeNabl ? 'NABL' : 'No NABL'}
                    </td>
                    <td className="nowrap">{fmtDate(r.releasedAt)}</td>
                    <td>
                      <Status s={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && <Pager page={list.page} pages={list.data.pages} total={list.data.total} onPage={list.setPage} />}
      </Card>
      {creating && <NewReport c={creating} onClose={() => setCreating(null)} />}
    </>
  );
}
