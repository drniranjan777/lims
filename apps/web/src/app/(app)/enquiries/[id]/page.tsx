'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ENQUIRY_TRANSITIONS, statusLabel, type EnquiryStatus } from '@lims/shared';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { fmtDate, formatINR, isoDate, SOURCE_LABELS } from '@/lib/format';
import { useCan } from '@/components/providers';
import { EnquiryForm } from '@/components/enquiry-form';
import { History } from '@/components/history';
import { Btn, Card, ErrorBox, KV, Loading, PageHead, Status } from '@/components/ui';

interface Enquiry {
  id: string;
  number: string;
  date: string;
  source: string;
  status: EnquiryStatus;
  customerId: string;
  contactId: string | null;
  queryReference: string | null;
  projectReference: string | null;
  receiptDetails: string | null;
  courierDetails: string | null;
  description: string | null;
  customer: { id: string; name: string; gstin: string | null };
  contact: { name: string; email: string | null; phone: string | null } | null;
  tests: { testId: string }[];
  testDetails: { id: string; name: string; method: string; rate: number; section: { name: string } }[];
  quotations: { id: string; number: string; status: string; total: number; date: string }[];
  createdByName: string;
}

export default function EnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const can = useCan();
  const [editing, setEditing] = useState(false);
  const { data: e, isLoading, error, refetch } = useQuery({ queryKey: ['enquiry', id], queryFn: () => api.get<Enquiry>(`/enquiries/${id}`) });
  const move = useAction((status: EnquiryStatus) => api.post(`/enquiries/${id}/status`, { status }), { success: 'Status updated', invalidate: [['enquiry', id], ['/enquiries']] });

  if (isLoading) return <Loading />;
  if (error || !e) return <ErrorBox error={error} />;

  if (editing)
    return (
      <>
        <PageHead title={`Edit ${e.number}`} crumbs={[{ href: '/enquiries', label: 'CRM Enquiries' }]} />
        <EnquiryForm
          id={id}
          initial={{
            date: isoDate(e.date),
            source: e.source,
            customerId: e.customerId,
            contactId: e.contactId ?? '',
            queryReference: e.queryReference ?? '',
            projectReference: e.projectReference ?? '',
            receiptDetails: e.receiptDetails ?? '',
            courierDetails: e.courierDetails ?? '',
            description: e.description ?? '',
            testIds: e.tests.map((t) => t.testId),
          }}
          onSaved={() => (setEditing(false), void refetch())}
          onCancel={() => setEditing(false)}
        />
      </>
    );

  const next = ENQUIRY_TRANSITIONS[e.status].filter((s) => s !== 'QUOTATION_PREPARED');
  return (
    <>
      <PageHead
        title={
          <span className="row">
            {e.number} <Status s={e.status} />
          </span>
        }
        crumbs={[{ href: '/enquiries', label: 'CRM Enquiries' }]}
        actions={
          <>
            {can('enq.create') && e.status !== 'CLOSED' && <Btn onClick={() => setEditing(true)}>Edit</Btn>}
            {can('enq.create') &&
              next.map((s) => (
                <Btn key={s} onClick={() => move.mutate(s)} loading={move.isPending}>
                  Mark {statusLabel(s).toLowerCase()}
                </Btn>
              ))}
            {can('quote.edit') && e.status !== 'CLOSED' && (
              <Link className="btn pri" href={`/quotations/new?enquiryId=${e.id}`}>
                Prepare quotation
              </Link>
            )}
          </>
        }
      />
      <div className="split">
        <div>
          <Card title="Enquiry">
            <div className="grid g2">
              <KV
                rows={[
                  ['Customer', <Link key="c" href={`/customers`}>{e.customer.name}</Link>],
                  ['GSTIN', e.customer.gstin],
                  ['Contact', e.contact ? `${e.contact.name}${e.contact.email ? ` · ${e.contact.email}` : ''}${e.contact.phone ? ` · ${e.contact.phone}` : ''}` : null],
                  ['Source', SOURCE_LABELS[e.source]],
                  ['Date', fmtDate(e.date)],
                ]}
              />
              <KV
                rows={[
                  ['Query reference', e.queryReference],
                  ['Project reference', e.projectReference],
                  ['Receipt details', e.receiptDetails],
                  ['Courier details', e.courierDetails],
                  ['Recorded by', e.createdByName],
                ]}
              />
            </div>
            {e.description && <p className="pre">{e.description}</p>}
          </Card>
          <Card title="Required tests" flush className="mt">
            {e.testDetails.length ? (
              <table className="t">
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Method</th>
                    <th>Section</th>
                    <th className="num">List rate</th>
                  </tr>
                </thead>
                <tbody>
                  {e.testDetails.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{t.method}</td>
                      <td>{t.section.name}</td>
                      <td className="num">{formatINR(t.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty small">No tests linked yet.</div>
            )}
          </Card>
          <Card title="Quotations" flush className="mt">
            {e.quotations.length ? (
              <table className="t">
                <tbody>
                  {e.quotations.map((q) => (
                    <tr key={q.id}>
                      <td className="mono">
                        <Link href={`/quotations/${q.id}`}>{q.number}</Link>
                      </td>
                      <td>{fmtDate(q.date)}</td>
                      <td className="num">{formatINR(q.total)}</td>
                      <td>
                        <Status s={q.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty small">No quotation prepared yet.</div>
            )}
          </Card>
        </div>
        <History entityType="Enquiry" entityId={id} />
      </div>
    </>
  );
}
