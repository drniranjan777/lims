'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { REGISTRATION_STATUS, statusLabel } from '@lims/shared';
import { useList } from '@/lib/hooks';
import { fmtDate, TEMPLATE_LABELS } from '@/lib/format';
import { Card, Empty, Loading, PageHead, Pager, Search, Select, Status } from '@/components/ui';
import { useSectionName } from '@/components/pickers';

interface Row {
  id: string;
  number: string;
  sampleName: string;
  template: string;
  status: string;
  createdAt: string;
  customer: { name: string };
  sections: { sectionId: string; status: string }[];
  tests: { status: string }[];
  receipt: { number: string; quotation: { number: string } };
}

export default function RegistrationsPage() {
  const router = useRouter();
  const sectionName = useSectionName();
  const params = useSearchParams();
  const list = useList<Row>('/registrations', { q: params.get('q') ?? undefined, status: params.get('status') ?? '' });
  return (
    <>
      <PageHead title="Registration" sub="Pre-registered and registered samples with section progress (§4.4). New pre-registrations start from PO & Sample Receipt." />
      <Card
        flush
        title={
          <div className="row">
            <Search value={list.q} onChange={list.setQ} placeholder="Search registration, sample, customer" />
            <Select value={list.status} onChange={(e) => list.setStatus(e.target.value)} placeholder="All statuses" options={REGISTRATION_STATUS.map((s) => ({ value: s, label: statusLabel(s) }))} aria-label="Status filter" />
          </div>
        }
      >
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty>No registrations found.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Sample</th>
                  <th>Customer</th>
                  <th>Template</th>
                  <th>Quotation / receipt</th>
                  <th>Sections</th>
                  <th className="num">Tests approved</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((r) => (
                  <tr key={r.id} className="click" onClick={() => router.push(`/registrations/${r.id}`)}>
                    <td className="mono">
                      <Link href={`/registrations/${r.id}`}>{r.number}</Link>
                      <div className="small faint">{fmtDate(r.createdAt)}</div>
                    </td>
                    <td>{r.sampleName}</td>
                    <td>{r.customer.name}</td>
                    <td>{TEMPLATE_LABELS[r.template]}</td>
                    <td className="small mono">
                      {r.receipt.quotation.number}
                      <br />
                      {r.receipt.number}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {r.sections.map((s) => (
                          <Status key={s.sectionId} s={s.status} label={sectionName(s.sectionId)} />
                        ))}
                      </div>
                    </td>
                    <td className="num">
                      {r.tests.filter((t) => t.status === 'APPROVED').length}/{r.tests.length}
                    </td>
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
    </>
  );
}
