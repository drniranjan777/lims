'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { fmtDate, TEMPLATE_LABELS } from '@/lib/format';
import { useMe } from '@/components/providers';
import { Btn, Card, Empty, ErrorBox, Loading, PageHead, Select, Status } from '@/components/ui';

interface QTest {
  id: string;
  testName: string;
  method: string;
  status: string;
  analyst: { id: string; name: string } | null;
}
interface QueueRow {
  registrationId: string;
  sectionId: string;
  status: string;
  receivedAt: string | null;
  section: { id: string; name: string };
  registration: { id: string; number: string; sampleName: string; template: string; approvedAt: string; customer: { name: string }; tests: QTest[] };
}
interface Analyst {
  id: string;
  name: string;
  openTests: number;
}

function QueueCard({ row }: { row: QueueRow }) {
  const [selected, setSelected] = useState<string[]>(row.registration.tests.filter((t) => t.status === 'UNASSIGNED').map((t) => t.id));
  const [analystId, setAnalystId] = useState('');
  const { data: analysts = [] } = useQuery({ queryKey: ['analysts', row.sectionId], queryFn: () => api.get<Analyst[]>(`/users/analysts${qs({ sectionId: row.sectionId })}`) });
  const inv = [['section-queue'], ['dashboard'], ['analysts']];
  const receive = useAction(() => api.post('/section/receive', { registrationId: row.registrationId, sectionId: row.sectionId }), { success: 'Sample received in section', invalidate: inv });
  const assign = useAction(() => api.post('/section/assign', { testIds: selected, analystId }), { success: 'Tests allocated — analyst notified', invalidate: inv, onDone: () => setSelected([]) });
  const assignable = row.registration.tests.filter((t) => ['UNASSIGNED', 'ASSIGNED'].includes(t.status));
  const r = row.registration;
  return (
    <Card
      title={
        <div>
          <div className="row">
            <Link href={`/registrations/${r.id}`} className="bold mono">
              {r.number}
            </Link>
            <Status s={row.status} />
            <span className="chip">{row.section.name}</span>
          </div>
          <div className="small muted">
            {r.sampleName} · {r.customer.name} · {TEMPLATE_LABELS[r.template]} · registered {fmtDate(r.approvedAt)}
          </div>
        </div>
      }
      actions={
        row.status === 'PENDING' && (
          <Btn kind="pri" loading={receive.isPending} onClick={() => receive.mutate()}>
            Receive in section
          </Btn>
        )
      }
      flush
    >
      <table className="t">
        <thead>
          <tr>
            <th style={{ width: 32 }} />
            <th>Test</th>
            <th>Method</th>
            <th>Analyst</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {r.tests.map((t) => {
            const can = ['UNASSIGNED', 'ASSIGNED'].includes(t.status);
            return (
              <tr key={t.id}>
                <td>
                  <input type="checkbox" disabled={!can} checked={selected.includes(t.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, t.id] : s.filter((x) => x !== t.id)))} aria-label={`Select ${t.testName}`} />
                </td>
                <td>{t.testName}</td>
                <td className="small">{t.method}</td>
                <td>{t.analyst?.name ?? '—'}</td>
                <td>
                  <Status s={t.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {assignable.length > 0 && (
        <div className="row" style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <Select value={analystId} onChange={(e) => setAnalystId(e.target.value)} placeholder="Select analyst…" options={analysts.map((a) => ({ value: a.id, label: `${a.name} (${a.openTests} open)` }))} aria-label="Analyst" />
          <Btn kind="pri" disabled={!selected.length || !analystId} loading={assign.isPending} onClick={() => assign.mutate()}>
            Allocate {selected.length || ''} test(s)
          </Btn>
          {!analysts.length && <span className="small muted">No analysts are assigned to {row.section.name}. Add them in Users & roles.</span>}
        </div>
      )}
    </Card>
  );
}

export default function SectionPage() {
  const { data: me } = useMe();
  const [sectionId, setSectionId] = useState('');
  const [status, setStatus] = useState('');
  const { data, isLoading, error } = useQuery({ queryKey: ['section-queue', sectionId, status], queryFn: () => api.get<QueueRow[]>(`/section/queue${qs({ sectionId, status })}`) });
  return (
    <>
      <PageHead
        title="Section Workbench"
        sub="Receive registered samples into your section and allocate the work to one or more analysts (§4.5)."
        actions={
          <>
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} placeholder="All my sections" options={(me?.sections ?? []).map((s) => ({ value: s.id, label: s.name }))} aria-label="Section" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Open work" options={[{ value: 'PENDING', label: 'To receive' }, { value: 'RECEIVED', label: 'Received' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'COMPLETED', label: 'Completed' }]} aria-label="Status" />
          </>
        }
      />
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : !data?.length ? <Card><Empty>No samples in the queue.</Empty></Card> : <div className="grid">{data.map((r) => <QueueCard key={`${r.registrationId}-${r.sectionId}`} row={r} />)}</div>}
    </>
  );
}
