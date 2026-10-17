'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { isoDate } from '@/lib/format';
import { InvoiceForm, type InvoiceDraft } from '@/components/invoice-form';
import { useLabSettings } from '@/components/quotation-form';
import { Btn, Card, Empty, ErrorBox, Loading, PageHead, Status } from '@/components/ui';

interface Billable {
  id: string;
  number: string;
  sampleName: string;
  status: string;
  customerId: string;
  customer: { name: string };
  receipt: { quotation: { number: string }; purchaseOrder: { poNumber: string } | null };
}
interface Prefill {
  customerId: string;
  contactId: string | null;
  quotationId: string | null;
  purchaseOrderId: string | null;
  discountType: 'PERCENT' | 'AMOUNT' | null;
  discountValue: number | null;
  items: { registrationId: string; description: string; qty: number; rate: number }[];
}

export default function NewInvoicePage() {
  const router = useRouter();
  const { data: lab } = useLabSettings();
  const billable = useQuery({ queryKey: ['billable'], queryFn: () => api.get<Billable[]>('/invoices/billable') });
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [error, setError] = useState<unknown>(null);
  const customerOf = useMemo(() => billable.data?.find((b) => b.id === selected[0])?.customerId, [billable.data, selected]);

  const blank = (): InvoiceDraft => ({ date: isoDate(), customerId: '', contactId: '', quotationId: null, purchaseOrderId: null, placeOfSupplyStateCode: '', taxRelaxation: 'NONE', relaxationReference: '', discountType: '', discountValue: '', advanceReceived: '', advanceReference: '', terms: lab?.invoiceTerms ?? '', remarks: '', items: [] });
  const prefill = async () => {
    setError(null);
    try {
      const p = await api.get<Prefill>(`/invoices/prefill?registrationIds=${selected.join(',')}`);
      setDraft({ ...blank(), customerId: p.customerId, contactId: p.contactId ?? '', quotationId: p.quotationId, purchaseOrderId: p.purchaseOrderId, discountType: p.discountType ?? '', discountValue: p.discountValue ?? '', items: p.items.map((i) => ({ ...i, sacCode: lab?.sacCode ?? '998346' })) });
    } catch (e) {
      setError(e);
    }
  };

  if (draft)
    return (
      <>
        <PageHead title="New tax invoice" sub="Charges are prefilled from the quotation rates. A draft gets its statutory invoice number only when it is issued." crumbs={[{ href: '/invoices', label: 'Tax Invoices' }]} />
        <InvoiceForm initial={draft} onSaved={(r) => router.push(`/invoices/${r.id}`)} onCancel={() => setDraft(null)} />
      </>
    );

  return (
    <>
      <PageHead title="New tax invoice" sub="Select the tested samples to bill (one customer per invoice), or start a blank invoice." crumbs={[{ href: '/invoices', label: 'Tax Invoices' }]} actions={<Btn onClick={() => setDraft(blank())}>Blank invoice</Btn>} />
      <Card title="Billable registrations" flush footer={<Btn kind="pri" disabled={!selected.length} onClick={prefill}>Prepare invoice for {selected.length || ''} sample(s)</Btn>}>
        {billable.isLoading ? (
          <Loading />
        ) : !billable.data?.length ? (
          <Empty>No un-invoiced samples with results.</Empty>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th />
                <th>Registration</th>
                <th>Sample</th>
                <th>Customer</th>
                <th>Quotation / PO</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {billable.data.map((b) => {
                const disabled = Boolean(customerOf && customerOf !== b.customerId);
                return (
                  <tr key={b.id} style={disabled ? { opacity: 0.5 } : undefined}>
                    <td>
                      <input type="checkbox" disabled={disabled} checked={selected.includes(b.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, b.id] : s.filter((x) => x !== b.id)))} aria-label={`Select ${b.number}`} />
                    </td>
                    <td className="mono">{b.number}</td>
                    <td>{b.sampleName}</td>
                    <td>{b.customer.name}</td>
                    <td className="small">
                      {b.receipt.quotation.number}
                      {b.receipt.purchaseOrder && ` / ${b.receipt.purchaseOrder.poNumber}`}
                    </td>
                    <td>
                      <Status s={b.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <div className="mt">
        <ErrorBox error={error} />
      </div>
    </>
  );
}
