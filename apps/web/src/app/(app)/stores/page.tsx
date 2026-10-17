'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RETENTION_STATUS, statusLabel } from '@lims/shared';
import { api } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import { fmtDate, isoDate, TEMPLATE_LABELS } from '@/lib/format';
import { useLabSettings } from '@/components/quotation-form';
import { Btn, Card, Empty, ErrorBox, Field, fieldErr, Input, Loading, Modal, PageHead, Pager, Search, Select, Status, Textarea } from '@/components/ui';

interface Eligible {
  id: string;
  number: string;
  sampleName: string;
  template: string;
  quantity: string | null;
  status: string;
  defaultRetentionMonths: number;
  customer: { name: string };
}
interface Retained {
  id: string;
  status: string;
  receivedInStoreAt: string;
  receivedByName: string;
  storageLocation: string | null;
  quantity: string | null;
  retentionMonths: number;
  plannedDisposalDate: string;
  disposedAt: string | null;
  disposalMethod: string | null;
  disposedByName: string | null;
  remarks: string | null;
  registration: { id: string; number: string; sampleName: string; template: string; customer: { name: string } };
}

function ReceiveDialog({ r, onClose }: { r: Eligible; onClose: () => void }) {
  const [f, setF] = useState({ receivedInStoreAt: isoDate(), storageLocation: '', quantity: r.quantity ?? '', retentionMonths: r.defaultRetentionMonths, remarks: '' });
  const save = useAction(() => api.post('/stores/retained', { registrationId: r.id, ...f }), { success: 'Remnant sample received into stores', invalidate: [['/stores/retained'], ['stores-eligible']], onDone: onClose });
  const planned = new Date(f.receivedInStoreAt);
  planned.setMonth(planned.getMonth() + Number(f.retentionMonths || 0));
  return (
    <Modal
      title={`Receive remnant — ${r.number}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="pri" loading={save.isPending} onClick={() => save.mutate()}>
            Receive into store
          </Btn>
        </>
      }
    >
      <div className="grid g2">
        <Field label="Date received in store" required>
          <Input type="date" value={f.receivedInStoreAt} onChange={(e) => setF({ ...f, receivedInStoreAt: e.target.value })} />
        </Field>
        <Field label="Retention period (months)" required hint={`Planned disposal ${fmtDate(planned)}`} error={fieldErr(save.error, 'retentionMonths')}>
          <Input type="number" min={0} max={120} value={f.retentionMonths} onChange={(e) => setF({ ...f, retentionMonths: Number(e.target.value) })} />
        </Field>
        <Field label="Storage location">
          <Input value={f.storageLocation} onChange={(e) => setF({ ...f, storageLocation: e.target.value })} placeholder="e.g. Rack A-3" />
        </Field>
        <Field label="Quantity retained">
          <Input value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
        </Field>
      </div>
      <Field label="Remarks">
        <Textarea rows={2} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
      </Field>
      <ErrorBox error={save.error} />
    </Modal>
  );
}

function DisposeDialog({ r, onClose }: { r: Retained; onClose: () => void }) {
  const { data: lab } = useLabSettings();
  const [f, setF] = useState({ disposedAt: isoDate(), disposalMethod: '', remarks: '' });
  const early = f.disposedAt < isoDate(r.plannedDisposalDate);
  const save = useAction(() => api.post(`/stores/retained/${r.id}/dispose`, f), { success: 'Disposal recorded', invalidate: [['/stores/retained']], onDone: onClose });
  return (
    <Modal
      title={`Dispose — ${r.registration.number}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="danger" loading={save.isPending} disabled={!f.disposalMethod || (early && !f.remarks.trim())} onClick={() => save.mutate()}>
            Record disposal
          </Btn>
        </>
      }
    >
      <div className="grid">
        <div className="small muted">
          Planned disposal {fmtDate(r.plannedDisposalDate)} · retained {r.retentionMonths} month(s) at {r.storageLocation ?? '—'}. You are recorded as the person who disposed the sample.
        </div>
        <div className="grid g2">
          <Field label="Actual disposal date" required>
            <Input type="date" value={f.disposedAt} onChange={(e) => setF({ ...f, disposedAt: e.target.value })} />
          </Field>
          <Field label="Disposal method" required>
            <Select value={f.disposalMethod} onChange={(e) => setF({ ...f, disposalMethod: e.target.value })} placeholder="Select…" options={(lab?.disposalMethods ?? []).map((m) => ({ value: m, label: m }))} />
          </Field>
        </div>
        {early && <div className="alert warn small">This is before the end of the retention period — give the reason (e.g. customer instruction).</div>}
        <Field label="Remarks" required={early}>
          <Textarea value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
        </Field>
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  );
}

export default function StoresPage() {
  const params = useSearchParams();
  const eligible = useQuery({ queryKey: ['stores-eligible'], queryFn: () => api.get<Eligible[]>('/stores/eligible') });
  const list = useList<Retained>('/stores/retained', { status: params.get('status') ?? '' });
  const [receive, setReceive] = useState<Eligible | null>(null);
  const [dispose, setDispose] = useState<Retained | null>(null);
  const today = isoDate();
  return (
    <>
      <PageHead title="Stores · Sample Retention" sub="Record remnant samples after testing, their retention period, and disposal with method and responsible person (§4.12)." />
      <Card title="Remnant samples to receive" flush>
        {eligible.isLoading ? (
          <Loading />
        ) : !eligible.data?.length ? (
          <Empty>No tested samples are waiting to be received into stores.</Empty>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Sample</th>
                <th>Customer</th>
                <th>Template</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {eligible.data.map((r) => (
                <tr key={r.id}>
                  <td className="mono">
                    <Link href={`/registrations/${r.id}`}>{r.number}</Link>
                  </td>
                  <td>{r.sampleName}</td>
                  <td>{r.customer.name}</td>
                  <td>{TEMPLATE_LABELS[r.template]}</td>
                  <td>
                    <Status s={r.status} />
                  </td>
                  <td className="right">
                    <Btn size="sm" kind="pri" onClick={() => setReceive(r)}>
                      Receive
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card
        className="mt"
        flush
        title={
          <div className="row">
            <h2>Retention register</h2>
            <Search value={list.q} onChange={list.setQ} placeholder="Search registration, sample, location" />
            <Select value={list.status} onChange={(e) => list.setStatus(e.target.value)} placeholder="All statuses" options={RETENTION_STATUS.map((s) => ({ value: s, label: statusLabel(s) }))} aria-label="Status filter" />
          </div>
        }
      >
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty>No retained samples.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Sample</th>
                  <th>Received in store</th>
                  <th>Location</th>
                  <th>Retention</th>
                  <th>Planned disposal</th>
                  <th>Disposal</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((r) => {
                  const due = r.status !== 'DISPOSED' && isoDate(r.plannedDisposalDate) <= today;
                  return (
                    <tr key={r.id}>
                      <td className="mono">
                        <Link href={`/registrations/${r.registration.id}`}>{r.registration.number}</Link>
                      </td>
                      <td>
                        {r.registration.sampleName}
                        <div className="small muted">{r.registration.customer.name}</div>
                      </td>
                      <td className="small">
                        {fmtDate(r.receivedInStoreAt)}
                        <div className="muted">{r.receivedByName}</div>
                      </td>
                      <td>{r.storageLocation ?? '—'}</td>
                      <td>{r.retentionMonths} mo</td>
                      <td className="nowrap" style={due ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>
                        {fmtDate(r.plannedDisposalDate)}
                      </td>
                      <td className="small">{r.disposedAt ? `${fmtDate(r.disposedAt)} · ${r.disposalMethod} · ${r.disposedByName}` : '—'}</td>
                      <td>
                        <Status s={due && r.status !== 'DUE_FOR_DISPOSAL' ? 'DUE_FOR_DISPOSAL' : r.status} />
                      </td>
                      <td className="right">
                        {r.status !== 'DISPOSED' && (
                          <Btn size="sm" onClick={() => setDispose(r)}>
                            Dispose
                          </Btn>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {list.data && <Pager page={list.page} pages={list.data.pages} total={list.data.total} onPage={list.setPage} />}
      </Card>
      {receive && <ReceiveDialog r={receive} onClose={() => setReceive(null)} />}
      {dispose && <DisposeDialog r={dispose} onClose={() => setDispose(null)} />}
    </>
  );
}
