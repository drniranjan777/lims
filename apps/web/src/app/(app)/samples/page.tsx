'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { DISPATCH_MODES } from '@lims/shared';
import { api, qs, type Paged } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import { fmtDate, fmtDateTime, formatINR, isoDate, MODE_LABELS } from '@/lib/format';
import { useCan } from '@/components/providers';
import { Btn, Card, Empty, ErrorBox, Field, fieldErr, Input, Loading, Modal, PageHead, Pager, Search, Select, Status, Textarea } from '@/components/ui';

interface QRow {
  id: string;
  number: string;
  status: string;
  total: number;
  date: string;
  customer: { name: string };
  purchaseOrders: { poNumber: string }[];
  _count: { receipts: number };
}
interface Receipt {
  id: string;
  number: string;
  status: string;
  receivedAt: string;
  mode: string;
  courierName: string | null;
  docketNumber: string | null;
  numberOfSamples: number;
  condition: string | null;
  quotation: { id: string; number: string; customer: { name: string } };
  purchaseOrder: { poNumber: string } | null;
  registrations: { id: string; number: string; sampleName: string; status: string }[];
}
interface QDetail {
  id: string;
  number: string;
  status: string;
  total: number;
  customer: { name: string };
  purchaseOrders: { id: string; poNumber: string; poDate: string }[];
}

function PoDialog({ q, onClose }: { q: QDetail; onClose: () => void }) {
  const [f, setF] = useState({ poNumber: '', poDate: isoDate(), poValue: q.total as number | '', remarks: '' });
  const save = useAction(() => api.post('/receipts/purchase-orders', { quotationId: q.id, ...f, poValue: f.poValue === '' ? null : f.poValue }), {
    success: `PO recorded — ${q.number} accepted`,
    invalidate: [['/quotations'], ['quotation', q.id], ['awaiting']],
    onDone: onClose,
  });
  return (
    <Modal
      title={`Record customer PO — ${q.number}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="pri" loading={save.isPending} onClick={() => save.mutate()}>
            Save PO
          </Btn>
        </>
      }
    >
      <div className="grid">
        <div className="small muted">
          {q.customer.name} · quotation total {formatINR(q.total)}. Recording a PO marks the quotation as accepted.
        </div>
        <div className="grid g2">
          <Field label="PO number" required error={fieldErr(save.error, 'poNumber')}>
            <Input autoFocus value={f.poNumber} onChange={(e) => setF({ ...f, poNumber: e.target.value })} />
          </Field>
          <Field label="PO date" required error={fieldErr(save.error, 'poDate')}>
            <Input type="date" value={f.poDate} onChange={(e) => setF({ ...f, poDate: e.target.value })} />
          </Field>
        </div>
        <Field label="PO value (₹)">
          <Input type="number" min={0} step="0.01" value={f.poValue} onChange={(e) => setF({ ...f, poValue: e.target.value === '' ? '' : Number(e.target.value) })} />
        </Field>
        <Field label="Remarks">
          <Textarea value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
        </Field>
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  );
}

function ReceiptDialog({ q, onClose }: { q: QDetail; onClose: () => void }) {
  const [f, setF] = useState({
    purchaseOrderId: q.purchaseOrders[0]?.id ?? '',
    receivedAt: new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16),
    mode: 'COURIER',
    courierName: '',
    docketNumber: '',
    numberOfSamples: 1,
    condition: 'Satisfactory, sealed',
    remarks: '',
  });
  const save = useAction(() => api.post('/receipts', { quotationId: q.id, ...f, purchaseOrderId: f.purchaseOrderId || null, receivedAt: new Date(f.receivedAt + '+05:30').toISOString() }), {
    success: 'Sample receipt recorded',
    invalidate: [['/receipts'], ['awaiting'], ['quotation', q.id]],
    onDone: onClose,
  });
  return (
    <Modal
      title={`Sample receipt — ${q.number}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="pri" loading={save.isPending} onClick={() => save.mutate()}>
            Record receipt
          </Btn>
        </>
      }
    >
      <div className="grid">
        <div className="grid g2">
          <Field label="Against PO">
            <Select value={f.purchaseOrderId} onChange={(e) => setF({ ...f, purchaseOrderId: e.target.value })} placeholder="—" options={q.purchaseOrders.map((p) => ({ value: p.id, label: `${p.poNumber} (${fmtDate(p.poDate)})` }))} />
          </Field>
          <Field label="Received at" required>
            <Input type="datetime-local" value={f.receivedAt} onChange={(e) => setF({ ...f, receivedAt: e.target.value })} />
          </Field>
          <Field label="Mode of receipt">
            <Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} options={DISPATCH_MODES.filter((m) => m !== 'EMAIL').map((m) => ({ value: m, label: MODE_LABELS[m] }))} />
          </Field>
          <Field label="Number of samples" required error={fieldErr(save.error, 'numberOfSamples')}>
            <Input type="number" min={1} value={f.numberOfSamples} onChange={(e) => setF({ ...f, numberOfSamples: Number(e.target.value) })} />
          </Field>
          <Field label="Courier name">
            <Input value={f.courierName} onChange={(e) => setF({ ...f, courierName: e.target.value })} />
          </Field>
          <Field label="Docket / AWB no.">
            <Input value={f.docketNumber} onChange={(e) => setF({ ...f, docketNumber: e.target.value })} />
          </Field>
        </div>
        <Field label="Condition on receipt">
          <Input value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} />
        </Field>
        <Field label="Remarks">
          <Textarea value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
        </Field>
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  );
}

export default function SamplesPage() {
  const can = useCan();
  const params = useSearchParams();
  const [dialog, setDialog] = useState<{ kind: 'po' | 'receipt'; q: QDetail } | null>(null);
  const awaiting = useQuery({ queryKey: ['awaiting'], queryFn: () => api.get<Paged<QRow>>(`/quotations${qs({ status: 'SENT,ACCEPTED', pageSize: 100 })}`) });
  const receipts = useList<Receipt>('/receipts');

  const open = async (kind: 'po' | 'receipt', id: string) => setDialog({ kind, q: await api.get<QDetail>(`/quotations/${id}`) });
  const qid = params.get('quotationId');
  useEffect(() => {
    if (!qid) return;
    void api.get<QDetail>(`/quotations/${qid}`).then((q) => setDialog({ kind: q.status === 'SENT' || !q.purchaseOrders.length ? 'po' : 'receipt', q }));
  }, [qid]);

  const pending = (awaiting.data?.items ?? []).filter((q) => q._count.receipts === 0);
  return (
    <>
      <PageHead title="PO & Sample Receipt" sub="Record the customer PO against the quotation and the receipt of samples, then pre-register (§4.3)." />
      <Card title="Quotations awaiting PO / samples" flush>
        {awaiting.isLoading ? (
          <Loading />
        ) : !pending.length ? (
          <Empty>No sent or accepted quotations are waiting for samples.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Quotation</th>
                  <th>Customer</th>
                  <th className="num">Total</th>
                  <th>PO</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.map((q) => (
                  <tr key={q.id}>
                    <td className="mono">
                      <Link href={`/quotations/${q.id}`}>{q.number}</Link>
                    </td>
                    <td>{q.customer.name}</td>
                    <td className="num">{formatINR(q.total)}</td>
                    <td>{q.purchaseOrders.map((p) => p.poNumber).join(', ') || <span className="faint">Not received</span>}</td>
                    <td>
                      <Status s={q.status} />
                    </td>
                    <td className="right nowrap">
                      {can('po.record') && (
                        <>
                          <Btn size="sm" onClick={() => open('po', q.id)}>
                            Record PO
                          </Btn>{' '}
                          <Btn size="sm" kind="pri" disabled={q.status !== 'ACCEPTED'} title={q.status !== 'ACCEPTED' ? 'Record the PO first' : undefined} onClick={() => open('receipt', q.id)}>
                            Receive sample
                          </Btn>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={<div className="row"><h2>Sample receipts</h2><Search value={receipts.q} onChange={receipts.setQ} placeholder="Search receipt, docket, customer" /></div>} flush className="mt">
        {receipts.isLoading ? (
          <Loading />
        ) : !receipts.data?.items.length ? (
          <Empty>No samples received yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Received</th>
                  <th>Customer</th>
                  <th>Quotation / PO</th>
                  <th>Courier / docket</th>
                  <th className="num">Samples</th>
                  <th>Registrations</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {receipts.data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.number}</td>
                    <td className="nowrap">{fmtDateTime(r.receivedAt)}</td>
                    <td>{r.quotation.customer.name}</td>
                    <td className="small">
                      <Link href={`/quotations/${r.quotation.id}`}>{r.quotation.number}</Link>
                      {r.purchaseOrder && ` / ${r.purchaseOrder.poNumber}`}
                    </td>
                    <td className="small">{[MODE_LABELS[r.mode], r.courierName, r.docketNumber].filter(Boolean).join(' · ')}</td>
                    <td className="num">
                      {r.registrations.length}/{r.numberOfSamples}
                    </td>
                    <td className="small">
                      {r.registrations.map((g) => (
                        <div key={g.id}>
                          <Link href={`/registrations/${g.id}`}>{g.number}</Link> {g.sampleName}
                        </div>
                      ))}
                    </td>
                    <td>
                      <Status s={r.status} />
                    </td>
                    <td className="right">
                      {can('reg.pre') && r.registrations.length < r.numberOfSamples && (
                        <Link className="btn sm pri" href={`/registrations/new?receiptId=${r.id}`}>
                          Pre-register
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {receipts.data && <Pager page={receipts.page} pages={receipts.data.pages} total={receipts.data.total} onPage={receipts.setPage} />}
      </Card>
      {dialog?.kind === 'po' && <PoDialog q={dialog.q} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'receipt' && <ReceiptDialog q={dialog.q} onClose={() => setDialog(null)} />}
    </>
  );
}
