'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ENQUIRY_STATUS, statusLabel } from '@lims/shared';
import { useList } from '@/lib/hooks';
import { fmtDate, SOURCE_LABELS } from '@/lib/format';
import { useCan } from '@/components/providers';
import { Card, Empty, Loading, PageHead, Pager, Search, Select, Status } from '@/components/ui';

interface Row {
  id: string;
  number: string;
  date: string;
  source: string;
  status: string;
  queryReference: string | null;
  customer: { name: string };
  tests: unknown[];
  quotations: { id: string; number: string; status: string }[];
}

export default function EnquiriesPage() {
  const can = useCan();
  const router = useRouter();
  const params = useSearchParams();
  const list = useList<Row>('/enquiries', { status: params.get('status') ?? '' });
  return (
    <>
      <PageHead
        title="CRM Enquiries"
        sub="Customer queries received by phone, mail, walk-in or reference (§4.1)."
        actions={can('enq.create') && <Link className="btn pri" href="/enquiries/new">New enquiry</Link>}
      />
      <Card
        flush
        title={
          <div className="row">
            <Search value={list.q} onChange={list.setQ} placeholder="Search number, customer, reference" />
            <Select value={list.status} onChange={(e) => list.setStatus(e.target.value)} placeholder="All statuses" options={ENQUIRY_STATUS.map((s) => ({ value: s, label: statusLabel(s) }))} aria-label="Status filter" />
          </div>
        }
      >
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty>No enquiries found.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Enquiry no.</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Source</th>
                  <th>Reference</th>
                  <th className="num">Tests</th>
                  <th>Quotation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((e) => (
                  <tr key={e.id} className="click" onClick={() => router.push(`/enquiries/${e.id}`)}>
                    <td className="mono">
                      <Link href={`/enquiries/${e.id}`}>{e.number}</Link>
                    </td>
                    <td className="nowrap">{fmtDate(e.date)}</td>
                    <td>{e.customer.name}</td>
                    <td>{SOURCE_LABELS[e.source]}</td>
                    <td>{e.queryReference ?? '—'}</td>
                    <td className="num">{e.tests.length}</td>
                    <td className="mono small">{e.quotations.map((q) => q.number).join(', ') || '—'}</td>
                    <td>
                      <Status s={e.status} />
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
