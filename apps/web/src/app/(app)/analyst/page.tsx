'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Card, Empty, ErrorBox, Loading, PageHead, Select, Status } from '@/components/ui';

interface Row {
  id: string;
  testName: string;
  method: string;
  status: string;
  assignedAt: string | null;
  reviewComments: string | null;
  registration: { id: string; number: string; sampleName: string; customer: { name: string } };
}

export default function AnalystPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const { data, isLoading, error } = useQuery({ queryKey: ['my-tests', status], queryFn: () => api.get<Row[]>(`/tests/mine${qs({ status })}`) });
  return (
    <>
      <PageHead
        title="Analyst Workbench"
        sub="Tests assigned to you. Record observations, readings, chemicals, equipment and calculations, then submit for review (§4.6)."
        actions={<Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Open work" options={[{ value: 'ASSIGNED', label: 'Assigned' }, { value: 'IN_TESTING', label: 'In testing' }, { value: 'CORRECTION_REQUIRED', label: 'Correction required' }, { value: 'SUBMITTED', label: 'Submitted' }, { value: 'APPROVED', label: 'Approved' }]} aria-label="Status" />}
      />
      <Card flush>
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} />
        ) : !data?.length ? (
          <Empty>No tests in this view.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Sample</th>
                  <th>Test</th>
                  <th>Method</th>
                  <th>Assigned</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.id} className="click" onClick={() => router.push(`/tests/${t.id}`)}>
                    <td className="mono">
                      <Link href={`/tests/${t.id}`}>{t.registration.number}</Link>
                    </td>
                    <td>
                      {t.registration.sampleName}
                      <div className="small muted">{t.registration.customer.name}</div>
                    </td>
                    <td>{t.testName}</td>
                    <td className="small">{t.method}</td>
                    <td className="nowrap">{fmtDate(t.assignedAt)}</td>
                    <td>
                      <Status s={t.status} />
                      {t.status === 'CORRECTION_REQUIRED' && t.reviewComments && <div className="small" style={{ color: 'var(--bad)' }}>{t.reviewComments}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
