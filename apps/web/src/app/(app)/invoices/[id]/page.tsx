'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TAX_RELAXATION_LABELS, type TaxRelaxation } from '@lims/shared';
import { api, fileUrl } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { fmtDate, fmtDateTime, formatINR, isoDate } from '@/lib/format';
import { useCan } from '@/components/providers';
import { History } from '@/components/history';
import { SignDialog } from '@/components/sign';
import { InvoiceForm } from '@/components/invoice-form';
import { TotalsBox } from '@/components/quotation-form';
import { Btn, Card, ErrorBox, Field, KV, Loading, Modal, PageHead, Status, Steps, Textarea } from '@/components/ui';

interface Invoice {
  id: string;
  number: string | null;
  draftNumber: string;
  date: string;
  status: string;
  customerId: string;
  contactId: string | null;
  quotationId: string | null;
  purchaseOrderId: string | null;
  customerGstin: string | null;
  placeOfSupplyStateCode: string | null;
  gstType: string;
  taxRelaxation: TaxRelaxation;
  relaxationReference: string | null;
  discountType: 'PERCENT' | 'AMOUNT' | null;
  discountValue: number | null;
  advanceReceived: number;
  advanceReference: string | null;
  balanceDue: number;
  poValue: number | null;
  terms: string | null;
  remarks: string | null;
  cancelledReason: string | null;
  subtotal: number; discountAmount: number; taxable: number; cgstRate: number; sgstRate: number; igstRate: number; cgst: number; sgst: number; igst: number; roundOff: number; total: number;
  customer: { name: string };
  contact: { name: string } | null;
  quotation: { id: string; number: string } | null;
  purchaseOrder: { poNumber: string; poDate: string } | null;
  items: { id: string; registrationId: string | null; description: string; sacCode: string | null; qty: number; rate: number; amount: number; registration: { id: string; number: string } | null }[];
  dispatchItems: { dispatch: { number: string; dispatchDate: string; status: string } }[];
  createdBy: { name: string } | null;
  approvedBy: { name: string } | null;
  approvedAt: string | null;
  issuedAt: string | null;
}

const STEPS = ['Draft', 'Approved', 'Issued', 'Dispatched'];

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const can = useCan();
  const [mode, setMode] = useState<null | 'edit' | 'approve' | 'cancel'>(null);
  const [reason, setReason] = useState('');
  const { data: inv, isLoading, error, refetch } = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<Invoice>(`/invoices/${id}`) });
  const invKeys = [['invoice', id], ['/invoices']];
  const issue = useAction(() => api.post(`/invoices/${id}/issue`), { success: 'Invoice issued', invalidate: invKeys });
  const revert = useAction(() => api.post(`/invoices/${id}/revert`, {}), { success: 'Returned to draft', invalidate: invKeys });
  const cancel = useAction(() => api.post(`/invoices/${id}/cancel`, { reason }), { success: 'Invoice cancelled', invalidate: invKeys, onDone: () => setMode(null) });

  if (isLoading) return <Loading />;
  if (error || !inv) return <ErrorBox error={error} />;

  if (mode === 'edit')
    return (
      <>
        <PageHead title={`Edit ${inv.draftNumber}`} crumbs={[{ href: '/invoices', label: 'Tax Invoices' }]} />
        <InvoiceForm
          id={id}
          initial={{
            date: isoDate(inv.date),
            customerId: inv.customerId,
            contactId: inv.contactId ?? '',
            quotationId: inv.quotationId,
            purchaseOrderId: inv.purchaseOrderId,
            placeOfSupplyStateCode: inv.placeOfSupplyStateCode ?? '',
            taxRelaxation: inv.taxRelaxation,
            relaxationReference: inv.relaxationReference ?? '',
            discountType: inv.discountType ?? '',
            discountValue: inv.discountValue ?? '',
            advanceReceived: inv.advanceReceived || '',
            advanceReference: inv.advanceReference ?? '',
            terms: inv.terms ?? '',
            remarks: inv.remarks ?? '',
            items: inv.items.map((i) => ({ registrationId: i.registrationId, description: i.description, sacCode: i.sacCode ?? '', qty: i.qty, rate: i.rate })),
          }}
          onSaved={() => (setMode(null), void refetch())}
          onCancel={() => setMode(null)}
        />
      </>
    );

  const step = Math.max(0, STEPS.findIndex((s) => s.toUpperCase() === inv.status));
  return (
    <>
      <PageHead
        title={
          <span className="row">
            {inv.number ?? inv.draftNumber} <Status s={inv.status} />
          </span>
        }
        sub={inv.customer.name}
        crumbs={[{ href: '/invoices', label: 'Tax Invoices' }]}
        actions={
          <>
            <a className="btn" href={fileUrl(`/invoices/${id}/pdf`)} target="_blank" rel="noreferrer">
              PDF
            </a>
            {inv.status === 'DRAFT' && can('invoice.edit') && <Btn onClick={() => setMode('edit')}>Edit</Btn>}
            {inv.status === 'DRAFT' && can('invoice.authorize') && (
              <Btn kind="pri" onClick={() => setMode('approve')}>
                Authorize & sign
              </Btn>
            )}
            {inv.status === 'APPROVED' && (can('invoice.edit') || can('invoice.authorize')) && (
              <>
                <Btn onClick={() => revert.mutate()}>Return to draft</Btn>
                <Btn kind="pri" loading={issue.isPending} onClick={() => issue.mutate()}>
                  Issue invoice
                </Btn>
              </>
            )}
            {inv.status === 'ISSUED' && can('dispatch.record') && (
              <Link className="btn pri" href="/dispatch">
                Dispatch
              </Link>
            )}
            {['DRAFT', 'APPROVED', 'ISSUED'].includes(inv.status) && can('invoice.authorize') && (
              <Btn kind="danger" onClick={() => (setReason(''), setMode('cancel'))}>
                Cancel invoice
              </Btn>
            )}
          </>
        }
      />
      {inv.status !== 'CANCELLED' ? (
        <Card>
          <Steps steps={STEPS} current={step} />
        </Card>
      ) : (
        <div className="alert bad">Cancelled: {inv.cancelledReason}</div>
      )}
      <div className="split mt">
        <div>
          <Card title="Invoice">
            <div className="grid g2">
              <KV
                rows={[
                  ['Customer', inv.customer.name],
                  ['GSTIN', inv.customerGstin],
                  ['Contact', inv.contact?.name],
                  ['Place of supply', `${inv.placeOfSupplyStateCode ?? '—'} · ${inv.gstType === 'INTRA' ? 'CGST + SGST' : 'IGST'}`],
                  ['Tax relaxation', inv.taxRelaxation !== 'NONE' ? `${TAX_RELAXATION_LABELS[inv.taxRelaxation]} · ${inv.relaxationReference}` : 'None'],
                ]}
              />
              <KV
                rows={[
                  ['Date', fmtDate(inv.date)],
                  ['Quotation', inv.quotation ? <Link key="q" href={`/quotations/${inv.quotation.id}`}>{inv.quotation.number}</Link> : null],
                  ['Customer PO', inv.purchaseOrder ? `${inv.purchaseOrder.poNumber} (${fmtDate(inv.purchaseOrder.poDate)})` : null],
                  ['PO value', inv.poValue ? formatINR(inv.poValue) : null],
                  ['Advance', inv.advanceReceived ? `${formatINR(inv.advanceReceived)}${inv.advanceReference ? ` · ${inv.advanceReference}` : ''}` : null],
                ]}
              />
            </div>
          </Card>
          <Card title="Charges" flush className="mt">
            <table className="t">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Registration</th>
                  <th>SAC</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.description}</td>
                    <td className="mono small">{i.registration ? <Link href={`/registrations/${i.registration.id}`}>{i.registration.number}</Link> : '—'}</td>
                    <td>{i.sacCode}</td>
                    <td className="num">{i.qty}</td>
                    <td className="num">{formatINR(i.rate)}</td>
                    <td className="num">{formatINR(i.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: 16 }}>
              <TotalsBox
                t={{ ...inv, taxTotal: inv.cgst + inv.sgst + inv.igst, advance: inv.advanceReceived, lineAmounts: [] }}
                extra={
                  inv.advanceReceived > 0 && (
                    <>
                      <tr>
                        <td>Less: advance</td>
                        <td className="num">− {formatINR(inv.advanceReceived)}</td>
                      </tr>
                      <tr>
                        <td className="bold">Balance due</td>
                        <td className="num bold">{formatINR(inv.balanceDue)}</td>
                      </tr>
                    </>
                  )
                }
              />
            </div>
          </Card>
        </div>
        <div>
          <Card title="Authorization">
            <KV
              rows={[
                ['Prepared by', inv.createdBy?.name],
                ['Authorized by', inv.approvedBy ? `${inv.approvedBy.name} · ${fmtDateTime(inv.approvedAt)}` : 'Pending'],
                ['Issued', inv.issuedAt ? fmtDateTime(inv.issuedAt) : null],
                ['Dispatch', inv.dispatchItems.map((d) => `${d.dispatch.number} · ${fmtDate(d.dispatch.dispatchDate)}`).join(', ') || null],
              ]}
            />
          </Card>
          <div className="mt">
            <History entityType="Invoice" entityId={id} />
          </div>
        </div>
      </div>
      {mode === 'approve' && <SignDialog title={`Authorize ${inv.draftNumber}`} meaning={`You authorize this tax invoice for ${formatINR(inv.total)} to ${inv.customer.name}.`} confirmLabel="Authorize & sign" onClose={() => setMode(null)} onSign={async (password) => (await api.post(`/invoices/${id}/approve`, { password }), await refetch())} />}
      {mode === 'cancel' && (
        <Modal
          title="Cancel invoice"
          onClose={() => setMode(null)}
          footer={
            <>
              <Btn onClick={() => setMode(null)}>Back</Btn>
              <Btn kind="danger" disabled={!reason.trim()} loading={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel invoice
              </Btn>
            </>
          }
        >
          <Field label="Reason" required>
            <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <ErrorBox error={cancel.error} />
        </Modal>
      )}
    </>
  );
}
