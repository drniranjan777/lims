'use client';

import Link from 'next/link';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, formatINR } from '@/lib/format';
import { Card, ErrorBox, Loading, PageHead, Status } from '@/components/ui';

interface Trace {
  registration: {
    id: string;
    number: string;
    sampleName: string;
    status: string;
    approvedAt: string | null;
    customer: { name: string };
    receipt: { number: string; receivedAt: string; status: string };
    tests: { id: string; testName: string; status: string; finalResult: string | null; unit: string | null; analyst: { name: string } | null; sectionId: string }[];
    sectionList: { id: string; name: string }[];
    reports: { id: string; number: string; status: string; releasedAt: string | null }[];
    retained: { status: string; receivedInStoreAt: string; plannedDisposalDate: string; disposedAt: string | null; disposalMethod: string | null; disposedByName: string | null } | null;
  };
  enquiry: { id: string; number: string; date: string; status: string } | null;
  quotation: { id: string; number: string; date: string; status: string; total: number } | null;
  purchaseOrders: { id: string; poNumber: string; poDate: string }[];
  dispatches: { id: string; number: string; dispatchDate: string; status: string; receivedDate: string | null; receivedByName: string | null; dispatchedByName: string }[];
  invoices: { id: string; number: string | null; draftNumber: string; status: string; total: number; date: string }[];
  signatures: { id: string; entityType: string; meaning: string; signedAt: string; user: { name: string } }[];
}

function Node({ title, children, href }: { title: string; children: React.ReactNode; href?: string }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="small muted">{title}</div>
      <div>{href ? <Link href={href}>{children}</Link> : children}</div>
    </div>
  );
}

/** §8 single traceable chain for one sample. */
export default function TracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error } = useQuery({ queryKey: ['trace', id], queryFn: () => api.get<Trace>(`/registrations/${id}/trace`) });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const r = data.registration;
  const sec = (sid: string) => r.sectionList.find((s) => s.id === sid)?.name ?? '';
  return (
    <>
      <PageHead title={`Traceability — ${r.number}`} sub={`${r.sampleName} · ${r.customer.name}`} crumbs={[{ href: '/registrations', label: 'Registration' }, { href: `/registrations/${id}`, label: r.number }]} />
      <Card title="Customer → Enquiry → Quotation → PO → Sample receipt → Registration">
        <div className="grid g3">
          <Node title="Customer">{r.customer.name}</Node>
          <Node title="Enquiry" href={data.enquiry ? `/enquiries/${data.enquiry.id}` : undefined}>
            {data.enquiry ? `${data.enquiry.number} · ${fmtDate(data.enquiry.date)}` : 'Direct quotation (no enquiry)'}
          </Node>
          <Node title="Quotation" href={data.quotation ? `/quotations/${data.quotation.id}` : undefined}>
            {data.quotation ? `${data.quotation.number} · ${formatINR(data.quotation.total)}` : '—'}
          </Node>
          <Node title="Purchase order">{data.purchaseOrders.map((p) => `${p.poNumber} (${fmtDate(p.poDate)})`).join(', ') || '—'}</Node>
          <Node title="Sample receipt">
            {r.receipt.number} · {fmtDateTime(r.receipt.receivedAt)}
          </Node>
          <Node title="Registration" href={`/registrations/${id}`}>
            {r.number} · registered {fmtDate(r.approvedAt)}
          </Node>
        </div>
      </Card>
      <Card title="Registration → Test group → Section → Analyst → Observations → Review" flush className="mt">
        <table className="t">
          <thead>
            <tr>
              <th>Test</th>
              <th>Section</th>
              <th>Analyst</th>
              <th>Final result</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {r.tests.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/tests/${t.id}`}>{t.testName}</Link>
                </td>
                <td>{sec(t.sectionId)}</td>
                <td>{t.analyst?.name ?? '—'}</td>
                <td>{t.finalResult ? `${t.finalResult} ${t.unit ?? ''}` : '—'}</td>
                <td>
                  <Status s={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid g3 mt">
        <Card title="Report → Dispatch">
          {r.reports.map((rep) => (
            <div key={rep.id} className="between">
              <Link href={`/reports/${rep.id}`}>{rep.number}</Link>
              <Status s={rep.status} />
            </div>
          ))}
          {data.dispatches.map((d) => (
            <div key={d.id} className="small mt">
              Dispatch {d.number} · {fmtDate(d.dispatchDate)} by {d.dispatchedByName}
              {d.receivedDate && ` · received ${fmtDate(d.receivedDate)} by ${d.receivedByName}`}
            </div>
          ))}
          {!r.reports.length && <span className="muted small">No report yet</span>}
        </Card>
        <Card title="Remnant sample → Retention → Disposal">
          {r.retained ? (
            <div className="small">
              <Status s={r.retained.status} /> In store {fmtDate(r.retained.receivedInStoreAt)} · planned disposal {fmtDate(r.retained.plannedDisposalDate)}
              {r.retained.disposedAt && (
                <div>
                  Disposed {fmtDate(r.retained.disposedAt)} by {r.retained.disposedByName} ({r.retained.disposalMethod})
                </div>
              )}
            </div>
          ) : (
            <span className="muted small">Not yet received in stores</span>
          )}
        </Card>
        <Card title="Final charges → Tax invoice">
          {data.invoices.length ? (
            data.invoices.map((i) => (
              <div key={i.id} className="between">
                <Link href={`/invoices/${i.id}`}>{i.number ?? i.draftNumber}</Link>
                <span className="row">
                  {formatINR(i.total)} <Status s={i.status} />
                </span>
              </div>
            ))
          ) : (
            <span className="muted small">Not yet invoiced</span>
          )}
        </Card>
      </div>
      <Card title="Electronic signatures" flush className="mt">
        <table className="t">
          <tbody>
            {data.signatures.map((s) => (
              <tr key={s.id}>
                <td>{s.meaning.toLowerCase()}</td>
                <td>{s.entityType.replace('RegistrationTest', 'Test')}</td>
                <td>{s.user.name}</td>
                <td>{fmtDateTime(s.signedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
