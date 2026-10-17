'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { DISPATCH_MODES } from '@lims/shared';
import { api } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import { fmtDate, formatINR, isoDate, MODE_LABELS } from '@/lib/format';
import { useCan } from '@/components/providers';
import { Btn, Card, Check, Empty, ErrorBox, Field, fieldErr, Input, Loading, Modal, PageHead, Pager, Search, Select, Status, Textarea } from '@/components/ui';

interface Pending {
  reports: { id: string; number: string; revision: number; sectionId: string | null; releasedAt: string; registration: { id: string; number: string; sampleName: string; customerId: string; customer: { name: string }; sections: { sectionId: string }[] } }[];
  invoices: { id: string; number: string; total: number; customerId: string; date: string; customer: { name: string } }[];
}
interface Dispatch {
  id: string;
  number: string;
  dispatchDate: string;
  dispatchedByName: string;
  mode: string;
  courierName: string | null;
  docketNumber: string | null;
  status: string;
  receivedDate: string | null;
  receivedByName: string | null;
  combinedVerifiedById: string | null;
  customer: { name: string };
  items: { id: string; report: { number: string; registration: { number: string } } | null; invoice: { number: string } | null }[];
}

function ReceiptDialog({ d, onClose }: { d: Dispatch; onClose: () => void }) {
  const [f, setF] = useState({ receivedDate: isoDate(), receivedByName: '' });
  const save = useAction(() => api.post(`/dispatches/${d.id}/receipt`, f), { success: 'Receipt at customer end recorded', invalidate: [['/dispatches']], onDone: onClose });
  return (
    <Modal
      title={`Customer receipt — ${d.number}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="pri" loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Btn>
        </>
      }
    >
      <div className="grid g2">
        <Field label="Date received by customer" required error={fieldErr(save.error, 'receivedDate')}>
          <Input type="date" value={f.receivedDate} onChange={(e) => setF({ ...f, receivedDate: e.target.value })} />
        </Field>
        <Field label="Received by (name)" required error={fieldErr(save.error, 'receivedByName')}>
          <Input autoFocus value={f.receivedByName} onChange={(e) => setF({ ...f, receivedByName: e.target.value })} />
        </Field>
      </div>
      <ErrorBox error={save.error} />
    </Modal>
  );
}

export default function DispatchPage() {
  const can = useCan();
  const preselect = useSearchParams().get('report');
  const pending = useQuery({ queryKey: ['dispatch-pending'], queryFn: () => api.get<Pending>('/dispatches/pending'), enabled: can('dispatch.record') });
  const list = useList<Dispatch>('/dispatches');
  const [customerId, setCustomerId] = useState('');
  const [reports, setReports] = useState<string[]>([]);
  const [invoices, setInvoices] = useState<string[]>([]);
  const [f, setF] = useState({ dispatchDate: isoDate(), mode: 'COURIER', courierName: '', docketNumber: '', remarks: '', combinedVerified: false });
  const [receipt, setReceipt] = useState<Dispatch | null>(null);

  const customers = useMemo(() => {
    const m = new Map<string, string>();
    pending.data?.reports.forEach((r) => m.set(r.registration.customerId, r.registration.customer.name));
    pending.data?.invoices.forEach((i) => m.set(i.customerId, i.customer.name));
    return [...m.entries()].map(([value, label]) => ({ value, label }));
  }, [pending.data]);
  // Preselect the customer of a report opened via ?report=
  const pre = pending.data?.reports.find((r) => r.id === preselect);
  useEffect(() => {
    if (pre) {
      setCustomerId(pre.registration.customerId);
      setReports([pre.id]);
    }
  }, [pre]);
  const custReports = pending.data?.reports.filter((r) => r.registration.customerId === customerId) ?? [];
  const custInvoices = pending.data?.invoices.filter((i) => i.customerId === customerId) ?? [];
  const needsCombined = custReports.some((r) => reports.includes(r.id) && !r.sectionId && r.registration.sections.length > 1);

  const create = useAction(() => api.post('/dispatches', { customerId, reportIds: reports, invoiceIds: invoices, ...f }), {
    success: 'Dispatch recorded',
    invalidate: [['/dispatches'], ['dispatch-pending'], ['/reports'], ['/invoices']],
    onDone: () => (setReports([]), setInvoices([]), setF({ ...f, courierName: '', docketNumber: '', remarks: '', combinedVerified: false })),
  });
  const toggle = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  return (
    <>
      <PageHead title="Dispatch" sub="Submit final reports and invoices to the customer and track receipt at the customer end (§4.11)." />
      {can('dispatch.record') && (
        <Card
          title="New dispatch"
          footer={
            <Btn kind="pri" disabled={!customerId || (!reports.length && !invoices.length)} loading={create.isPending} onClick={() => create.mutate()}>
              Record dispatch
            </Btn>
          }
        >
          {pending.isLoading ? (
            <Loading />
          ) : !customers.length ? (
            <div className="muted">No released reports or issued invoices are waiting for dispatch.</div>
          ) : (
            <div className="grid">
              <Field label="Customer">
                <Select value={customerId} onChange={(e) => (setCustomerId(e.target.value), setReports([]), setInvoices([]))} placeholder="Select customer…" options={customers} />
              </Field>
              {customerId && (
                <div className="grid g2">
                  <div>
                    <h3>Released reports</h3>
                    {custReports.length ? (
                      custReports.map((r) => (
                        <div key={r.id}>
                          <Check
                            checked={reports.includes(r.id)}
                            onChange={() => toggle(reports, setReports, r.id)}
                            label={
                              <span>
                                <span className="mono">{r.number}</span>
                                {r.revision ? ` Rev ${r.revision}` : ''} · {r.registration.number} · {r.registration.sampleName}
                                {!r.sectionId && r.registration.sections.length > 1 && <span className="chip info" style={{ marginLeft: 6 }}>Combined</span>}
                              </span>
                            }
                          />
                        </div>
                      ))
                    ) : (
                      <div className="small muted">None</div>
                    )}
                  </div>
                  <div>
                    <h3>Issued invoices</h3>
                    {custInvoices.length ? (
                      custInvoices.map((i) => (
                        <div key={i.id}>
                          <Check checked={invoices.includes(i.id)} onChange={() => toggle(invoices, setInvoices, i.id)} label={`${i.number} · ${fmtDate(i.date)} · ${formatINR(i.total)}`} />
                        </div>
                      ))
                    ) : (
                      <div className="small muted">None</div>
                    )}
                  </div>
                </div>
              )}
              <div className="grid g4">
                <Field label="Dispatch date" required>
                  <Input type="date" value={f.dispatchDate} onChange={(e) => setF({ ...f, dispatchDate: e.target.value })} />
                </Field>
                <Field label="Mode" required>
                  <Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} options={DISPATCH_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))} />
                </Field>
                <Field label="Courier">
                  <Input value={f.courierName} onChange={(e) => setF({ ...f, courierName: e.target.value })} />
                </Field>
                <Field label="Docket / AWB no.">
                  <Input value={f.docketNumber} onChange={(e) => setF({ ...f, docketNumber: e.target.value })} />
                </Field>
              </div>
              <Field label="Remarks">
                <Textarea rows={2} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
              </Field>
              {needsCombined && (
                <div className="alert warn">
                  <Check label="I have verified that the complete combined report (all sections) is included in this dispatch." checked={f.combinedVerified} onChange={(v) => setF({ ...f, combinedVerified: v })} />
                </div>
              )}
              <ErrorBox error={create.error} />
            </div>
          )}
        </Card>
      )}
      <Card title={<div className="row"><h2>Dispatch register</h2><Search value={list.q} onChange={list.setQ} placeholder="Search dispatch, docket, customer" /></div>} flush className="mt">
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty>No dispatches yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Dispatch</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Documents</th>
                  <th>Mode / courier</th>
                  <th>By</th>
                  <th>Customer receipt</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.number}</td>
                    <td className="nowrap">{fmtDate(d.dispatchDate)}</td>
                    <td>{d.customer.name}</td>
                    <td className="small">
                      {d.items.map((i) => (
                        <div key={i.id}>{i.report ? `Report ${i.report.number} (${i.report.registration.number})` : `Invoice ${i.invoice?.number}`}</div>
                      ))}
                      {d.combinedVerifiedById && <span className="chip ok">Combined verified</span>}
                    </td>
                    <td className="small">{[MODE_LABELS[d.mode], d.courierName, d.docketNumber].filter(Boolean).join(' · ')}</td>
                    <td className="small">{d.dispatchedByName}</td>
                    <td className="small">
                      {d.receivedDate ? (
                        `${fmtDate(d.receivedDate)} · ${d.receivedByName}`
                      ) : can('dispatch.record') ? (
                        <Btn size="sm" onClick={() => setReceipt(d)}>
                          Record receipt
                        </Btn>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <Status s={d.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && <Pager page={list.page} pages={list.data.pages} total={list.data.total} onPage={list.setPage} />}
      </Card>
      {receipt && <ReceiptDialog d={receipt} onClose={() => setReceipt(null)} />}
      <p className="small muted">
        Reports become available here once released in <Link href="/reports">Reports</Link>; invoices once issued in <Link href="/invoices">Tax Invoices</Link>.
      </p>
    </>
  );
}
