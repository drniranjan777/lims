'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Card, Loading } from './ui';

interface AuditRow {
  id: string;
  at: string;
  userName: string | null;
  action: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

const label = (a: string) => a.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Audit-trail history for one record (who did what, when, and why). */
export function History({ entityType, entityId, title = 'History' }: { entityType: string; entityId: string; title?: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['history', entityType, entityId], queryFn: () => api.get<AuditRow[]>(`/audit/entity/${entityType}/${entityId}`) });
  return (
    <Card title={title}>
      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <div className="small muted">No history yet.</div>
      ) : (
        <ul className="timeline">
          {data
            .slice()
            .reverse()
            .map((a) => {
              const status = a.after && typeof a.after.status === 'string' ? ` → ${String(a.after.status).replace(/_/g, ' ').toLowerCase()}` : '';
              return (
                <li key={a.id}>
                  <div>
                    <b>{label(a.action)}</b>
                    {status}
                  </div>
                  <div className="small muted">
                    {a.userName ?? 'System'} · {fmtDateTime(a.at)}
                  </div>
                  {a.reason && <div className="small pre">“{a.reason}”</div>}
                </li>
              );
            })}
        </ul>
      )}
    </Card>
  );
}
