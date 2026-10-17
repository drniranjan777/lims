'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { INVOICE_STATUS, statusLabel } from '@lims/shared';
import { useList } from '@/lib/hooks';
import { fmtDate, formatINR } from '@/lib/format';
import { useCan } from '@/components/providers';
import { Card, Empty, Loading, PageHead, Pager, Search, Select, Status } from '@/components/ui';

interface Row {
  id: string;
  number: string | null;
  draftNumber: string;
  date: string;
  status: string;
  total: number;
  balanceDue: number;
  taxRelaxation: string;
  customer: { name: string };
}

export default function InvoicesPage() {
  const can = useCan();
  const router = useRouter();
  const list = useList<Row>('/invoices', { status: useSearchParams().get('status') ?? '' });
  return (
    <>
      <PageHead title="Tax Invoices" sub="Draft → Approved (authorized signatory) → Issued (statutory number) → Dispatched (§4.13)." actions={can('invoice.edit') && <Link className="btn pri" href="/invoices/new">New invoice</Link>} />
      <Card
        flush
        title={
          <div className="row">
            <Search value={list.q} onChange={list.setQ} placeholder="Search invoice or customer" />
            <Select value={list.status} onChange={(e) => list.setStatus(e.target.value)} placeholder="All statuses" options={INVOICE_STATUS.map((s) => ({ value: s, label: statusLabel(s) }))} aria-label="Status filter" />
          </div>
        }
      >
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty>No invoices found.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Invoice no.</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th className="num">Total</th>
                  <th className="num">Balance due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((i) => (
                  <tr key={i.id} className="click" onClick={() => router.push(`/invoices/${i.id}`)}>
                    <td className="mono">
                      <Link href={`/invoices/${i.id}`}>{i.number ?? i.draftNumber}</Link>
                      {!i.number && <div className="small faint">draft</div>}
                    </td>
                    <td className="nowrap">{fmtDate(i.date)}</td>
                    <td>{i.customer.name}</td>
                    <td className="num">{formatINR(i.total)}</td>
                    <td className="num">{formatINR(i.balanceDue)}</td>
                    <td>
                      <Status s={i.status} />
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
