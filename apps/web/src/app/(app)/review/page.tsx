'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useMe } from '@/components/providers';
import { useSectionName } from '@/components/pickers';
import { Card, Empty, ErrorBox, Loading, PageHead } from '@/components/ui';

interface Row {
  id: string;
  testName: string;
  sectionId: string;
  analystId: string;
  finalResult: string | null;
  unit: string | null;
  conformity: string | null;
  submittedAt: string;
  analyst: { name: string } | null;
  registration: { id: string; number: string; sampleName: string; customer: { name: string } };
}

export default function ReviewPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const section = useSectionName();
  const { data, isLoading, error } = useQuery({ queryKey: ['review-queue'], queryFn: () => api.get<Row[]>('/tests/review-queue'), refetchInterval: 60_000 });
  return (
    <>
      <PageHead title="Review & Approval" sub="Verify observations, calculations, attachments, equipment/chemical details and the final result; approve or return to the analyst (§4.7)." />
      <Card flush>
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} />
        ) : !data?.length ? (
          <Empty>Nothing is waiting for your review.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Test</th>
                  <th>Section</th>
                  <th>Analyst</th>
                  <th>Result</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.id} className="click" onClick={() => router.push(`/tests/${t.id}`)}>
                    <td className="mono">
                      <Link href={`/tests/${t.id}`}>{t.registration.number}</Link>
                      <div className="small muted">{t.registration.sampleName}</div>
                    </td>
                    <td>{t.testName}</td>
                    <td>{section(t.sectionId)}</td>
                    <td>
                      {t.analyst?.name}
                      {t.analystId === me?.id && <div className="small faint">your test — needs another reviewer</div>}
                    </td>
                    <td>
                      {t.finalResult} {t.unit}
                      {t.conformity === 'DOES_NOT_COMPLY' && <div className="chip bad">Does not comply</div>}
                    </td>
                    <td className="nowrap">{fmtDateTime(t.submittedAt)}</td>
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
