'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, fileUrl } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { fmtDate, fmtDateTime, formatINR, isoDate } from '@/lib/format';
import { useCan } from '@/components/providers';
import { QuotationForm, TotalsBox } from '@/components/quotation-form';
import { History } from '@/components/history';
import { SignDialog } from '@/components/sign';
import { Btn, Card, ErrorBox, Field, KV, Loading, Modal, PageHead, Status, Steps, Textarea } from '@/components/ui';

interface Quotation {
  id: string;
  number: string;
  date: string;
  validUntil: string | null;
  status: string;
  enquiryId: string | null;
  customerId: string;
  contactId: string | null;
  placeOfSupplyStateCode: string | null;
  gstType: string;
  discountType: 'PERCENT' | 'AMOUNT' | null;
  discountValue: number | null;
  terms: string | null;
  remarks: string | null;
  decisionReason: string | null;
  subtotal: number; discountAmount: number; taxable: number; cgstRate: number; sgstRate: number; igstRate: number; cgst: number; sgst: number; igst: number; roundOff: number; total: number;
  customer: { name: string; gstin: string | null };
  contact: { name: string; email: string | null } | null;
  enquiry: { id: string; number: string } | null;
  items: { id: string; testId: string | null; sampleDescription: string | null; testName: string; method: string | null; specification: string | null; unit: string | null; sectionId: string | null; qty: number; rate: number; amount: number }[];
  purchaseOrders: { id: string; poNumber: string; poDate: string; poValue: number | null }[];
  receipts: { id: string; number: string; status: string; receivedAt: string }[];
  createdBy: { name: string } | null;
  hodReviewedBy: { name: string } | null;
  hodReviewedAt: string | null;
  authorizedBy: { name: string; designation: string | null } | null;
  authorizedAt: string | null;
  sentAt: string | null;
}

const STEPS = ['Draft', 'HOD review', 'Authorization', 'Sent', 'Customer decision'];

export default function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const can = useCan();
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<null | 'authorize' | 'return' | 'reject'>(null);
  const [reason, setReason] = useState('');
  const { data: q, isLoading, error, refetch } = useQuery({ queryKey: ['quotation', id], queryFn: () => api.get<Quotation>(`/quotations/${id}`) });
  const inv = [['quotation', id], ['/quotations']];
  const submit = useAction(() => api.post(`/quotations/${id}/submit`), { success: 'Submitted for internal review', invalidate: inv });
  const hod = useAction(() => api.post(`/quotations/${id}/hod-review`), { success: 'Tests, methods & specifications confirmed', invalidate: inv });
  const send = useAction(() => api.post(`/quotations/${id}/send`), { success: 'Quotation sent to customer', invalidate: inv });
  const accept = useAction(() => api.post(`/quotations/${id}/decision`, { decision: 'ACCEPTED' }), { success: 'Marked accepted', invalidate: inv });
  const reject = useAction(() => api.post(`/quotations/${id}/decision`, { decision: 'REJECTED', reason }), { success: 'Marked rejected', invalidate: inv, onDone: () => setDialog(null) });
  const ret = useAction(() => api.post(`/quotations/${id}/return`, { reason }), { success: 'Returned to draft', invalidate: inv, onDone: () => setDialog(null) });

  if (isLoading) return <Loading />;
  if (error || !q) return <ErrorBox error={error} />;

  if (editing)
    return (
      <>
        <PageHead title={`Edit ${q.number}`} crumbs={[{ href: '/quotations', label: 'Quotations' }]} />
        <QuotationForm
          id={id}
          initial={{
            date: isoDate(q.date),
            validUntil: isoDate(q.validUntil),
            enquiryId: q.enquiryId,
            customerId: q.customerId,
            contactId: q.contactId ?? '',
            placeOfSupplyStateCode: q.placeOfSupplyStateCode ?? '',
            discountType: q.discountType ?? '',
            discountValue: q.discountValue ?? '',
            terms: q.terms ?? '',
            remarks: q.remarks ?? '',
            items: q.items.map((i) => ({ testId: i.testId, sampleDescription: i.sampleDescription ?? '', testName: i.testName, method: i.method ?? '', specification: i.specification ?? '', unit: i.unit ?? '', sectionId: i.sectionId, qty: i.qty, rate: i.rate })),
          }}
          onSaved={() => (setEditing(false), void refetch())}
          onCancel={() => setEditing(false)}
        />
      </>
    );

  const step = q.status === 'DRAFT' ? 0 : q.status === 'INTERNAL_REVIEW' ? (q.hodReviewedBy ? (q.authorizedBy ? 3 : 2) : 1) : q.status === 'SENT' ? 4 : 5;
  const inReview = q.status === 'INTERNAL_REVIEW';

  return (
    <>
      <PageHead
        title={
          <span className="row">
            {q.number} <Status s={q.status} />
          </span>
        }
        crumbs={[{ href: '/quotations', label: 'Quotations' }]}
        actions={
          <>
            <a className="btn" href={fileUrl(`/quotations/${id}/pdf`)} target="_blank" rel="noreferrer">
              PDF
            </a>
            {q.status === 'DRAFT' && can('quote.edit') && (
              <>
                <Btn onClick={() => setEditing(true)}>Edit</Btn>
                <Btn kind="pri" loading={submit.isPending} onClick={() => submit.mutate()}>
                  Submit for review
                </Btn>
              </>
            )}
            {inReview && !q.hodReviewedBy && can('quote.review') && (
              <Btn kind="pri" loading={hod.isPending} onClick={() => hod.mutate()}>
                Confirm tests & methods (HOD)
              </Btn>
            )}
            {inReview && q.hodReviewedBy && !q.authorizedBy && can('quote.authorize') && (
              <Btn kind="pri" onClick={() => setDialog('authorize')}>
                Authorize & sign
              </Btn>
            )}
            {inReview && q.authorizedBy && can('quote.edit') && (
              <Btn kind="pri" loading={send.isPending} onClick={() => send.mutate()}>
                Send to customer
              </Btn>
            )}
            {inReview && (can('quote.edit') || can('quote.review') || can('quote.authorize')) && <Btn onClick={() => (setReason(''), setDialog('return'))}>Return to draft</Btn>}
            {q.status === 'SENT' && (can('quote.edit') || can('po.record')) && (
              <>
                <Link className="btn pri" href={`/samples?quotationId=${id}`}>
                  Record PO
                </Link>
                <Btn onClick={() => accept.mutate()}>Mark accepted</Btn>
                <Btn kind="danger" onClick={() => (setReason(''), setDialog('reject'))}>
                  Mark rejected
                </Btn>
              </>
            )}
            {q.status === 'ACCEPTED' && can('po.record') && (
              <Link className="btn pri" href={`/samples?quotationId=${id}`}>
                {q.purchaseOrders.length ? 'Record sample receipt' : 'Record PO & sample'}
              </Link>
            )}
          </>
        }
      />
      <Card className="noprint">
        <Steps steps={STEPS} current={step} />
      </Card>
      <div className="split mt">
        <div>
          <Card title="Quotation">
            <div className="grid g2">
              <KV
                rows={[
                  ['Customer', q.customer.name],
                  ['GSTIN', q.customer.gstin],
                  ['Contact', q.contact ? `${q.contact.name}${q.contact.email ? ` · ${q.contact.email}` : ''}` : null],
                  ['Enquiry', q.enquiry ? <Link key="e" href={`/enquiries/${q.enquiry.id}`}>{q.enquiry.number}</Link> : null],
                ]}
              />
              <KV
                rows={[
                  ['Date', fmtDate(q.date)],
                  ['Valid until', fmtDate(q.validUntil)],
                  ['Place of supply', `${q.placeOfSupplyStateCode ?? '—'} · ${q.gstType === 'INTRA' ? 'CGST + SGST' : 'IGST'}`],
                  ['Prepared by', q.createdBy?.name],
                ]}
              />
            </div>
          </Card>
          <Card title="Tests, methods & pricing" flush className="mt">
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Sample / item</th>
                    <th>Test</th>
                    <th>Method</th>
                    <th>Specification</th>
                    <th className="num">Qty</th>
                    <th className="num">Rate</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {q.items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.sampleDescription ?? '—'}</td>
                      <td>{i.testName}</td>
                      <td>{i.method ?? '—'}</td>
                      <td>{i.specification ? `${i.specification} ${i.unit ?? ''}` : '—'}</td>
                      <td className="num">{i.qty}</td>
                      <td className="num">{formatINR(i.rate)}</td>
                      <td className="num">{formatINR(i.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: 16 }}>
              <TotalsBox t={{ ...q, taxTotal: q.cgst + q.sgst + q.igst, advance: 0, balanceDue: q.total, lineAmounts: [] }} />
            </div>
          </Card>
          {(q.remarks || q.terms) && (
            <Card title="Remarks & terms" className="mt">
              {q.remarks && <p className="pre">{q.remarks}</p>}
              <div className="pre small muted">{q.terms}</div>
            </Card>
          )}
        </div>
        <div>
          <Card title="Review & authorization">
            <KV
              rows={[
                ['HOD review', q.hodReviewedBy ? `${q.hodReviewedBy.name} · ${fmtDateTime(q.hodReviewedAt)}` : 'Pending'],
                ['Authorized by', q.authorizedBy ? `${q.authorizedBy.name} · ${fmtDateTime(q.authorizedAt)}` : 'Pending'],
                ['Sent', q.sentAt ? fmtDateTime(q.sentAt) : null],
                ['Decision note', q.decisionReason],
              ]}
            />
          </Card>
          {(q.purchaseOrders.length > 0 || q.receipts.length > 0) && (
            <Card title="PO & samples" className="mt">
              <KV rows={[...q.purchaseOrders.map((p): [string, string] => [`PO ${p.poNumber}`, `${fmtDate(p.poDate)}${p.poValue ? ` · ${formatINR(p.poValue)}` : ''}`]), ...q.receipts.map((r): [string, React.ReactNode] => [r.number, <Status key={r.id} s={r.status} />])]} />
            </Card>
          )}
          <div className="mt">
            <History entityType="Quotation" entityId={id} />
          </div>
        </div>
      </div>

      {dialog === 'authorize' && (
        <SignDialog title={`Authorize ${q.number}`} meaning={`You are authorizing quotation ${q.number} for ${formatINR(q.total)} as Authorized Signatory.`} onClose={() => setDialog(null)} onSign={async (password) => (await api.post(`/quotations/${id}/authorize`, { password }), await refetch())} confirmLabel="Authorize & sign" />
      )}
      {(dialog === 'return' || dialog === 'reject') && (
        <Modal
          title={dialog === 'return' ? 'Return to draft' : 'Customer rejected the quotation'}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Btn onClick={() => setDialog(null)}>Cancel</Btn>
              <Btn kind={dialog === 'reject' ? 'danger' : 'pri'} disabled={dialog === 'reject' && !reason.trim()} loading={ret.isPending || reject.isPending} onClick={() => (dialog === 'return' ? ret.mutate() : reject.mutate())}>
                Confirm
              </Btn>
            </>
          }
        >
          <Field label={dialog === 'return' ? 'What needs to change?' : 'Reason for rejection'} required={dialog === 'reject'}>
            <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </Modal>
      )}
    </>
  );
}
