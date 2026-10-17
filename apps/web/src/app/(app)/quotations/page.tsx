'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { QUOTATION_STATUS, statusLabel } from '@lims/shared';
import { useList } from '@/lib/hooks';
import { fmtDate, formatINR } from '@/lib/format';
import { useCan } from '@/components/providers';
import { Card, Empty, Loading, PageHead, Pager, Search, Select, Status } from '@/components/ui';

interface Row {
  id: string;
  number: string;
  date: string;
  validUntil: string | null;
  status: string;
  total: number;
  hodReviewedById: string | null;
  authorizedById: string | null;
  customer: { name: string };
  purchaseOrders: { poNumber: string }[];
  _count: { items: number; receipts: number };
}

export default function QuotationsPage() {
  const can = useCan();
  const router = useRouter();
  const list = useList<Row>('/quotations', { status: useSearchParams().get('status') ?? '' });
  return (
    <>
      <PageHead title="Quotations" sub="Draft → Internal Review (HOD + authorization) → Sent → Accepted / Rejected / Expired (§4.2)." actions={can('quote.edit') && <Link className="btn pri" href="/quotations/new">New quotation</Link>} />
      <Card
        flush
        title={
          <div className="row">
            <Search value={list.q} onChange={list.setQ} placeholder="Search number or customer" />
            <Select value={list.status} onChange={(e) => list.setStatus(e.target.value)} placeholder="All statuses" options={QUOTATION_STATUS.map((s) => ({ value: s, label: statusLabel(s) }))} aria-label="Status filter" />
          </div>
        }
      >
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty>No quotations found.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Quotation no.</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th className="num">Lines</th>
                  <th className="num">Total</th>
                  <th>Valid until</th>
                  <th>PO</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((q) => (
                  <tr key={q.id} className="click" onClick={() => router.push(`/quotations/${q.id}`)}>
                    <td className="mono">
                      <Link href={`/quotations/${q.id}`}>{q.number}</Link>
                    </td>
                    <td className="nowrap">{fmtDate(q.date)}</td>
                    <td>{q.customer.name}</td>
                    <td className="num">{q._count.items}</td>
                    <td className="num">{formatINR(q.total)}</td>
                    <td className="nowrap">{fmtDate(q.validUntil)}</td>
                    <td className="small">{q.purchaseOrders.map((p) => p.poNumber).join(', ') || '—'}</td>
                    <td>
                      <Status s={q.status} />
                      {q.status === 'INTERNAL_REVIEW' && <div className="small muted">{!q.hodReviewedById ? 'Awaiting HOD' : !q.authorizedById ? 'Awaiting signatory' : 'Ready to send'}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && <Pager page={list.page} pages={list.data.pages} total={list.data.total} onPage={list.setPage} />}
      </Card>
    </>
  );
}
