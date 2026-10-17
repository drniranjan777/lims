'use client';

import { useState } from 'react';
import { useList } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/format';
import { Btn, Card, Empty, Loading, Modal, PageHead, Pager, Select, Status } from '@/components/ui';

interface Mail {
  id: string;
  to: string;
  subject: string;
  body: string;
  status: string;
  error: string | null;
  attempts: number;
  sentAt: string | null;
  createdAt: string;
}

export default function OutboxPage() {
  const list = useList<Mail>('/audit/email-outbox');
  const [open, setOpen] = useState<Mail | null>(null);
  return (
    <>
      <PageHead title="E-mail outbox" sub="Customer notifications (registration, quotation, dispatch). Messages show 'Not configured' until SMTP settings are provided in the server environment." />
      <Card flush title={<Select value={list.status} onChange={(e) => list.setStatus(e.target.value)} placeholder="All" options={['PENDING', 'SENT', 'FAILED', 'NOT_CONFIGURED'].map((s) => ({ value: s, label: s.replace('_', ' ').toLowerCase() }))} aria-label="Status filter" />}>
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty>No e-mails queued.</Empty>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Queued</th>
                <th>To</th>
                <th>Subject</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((m) => (
                <tr key={m.id}>
                  <td className="small nowrap">{fmtDateTime(m.createdAt)}</td>
                  <td>{m.to}</td>
                  <td>{m.subject}</td>
                  <td>
                    <Status s={m.status} label={m.status === 'NOT_CONFIGURED' ? 'Not configured' : undefined} />
                    {m.error && <div className="small" style={{ color: 'var(--bad)' }}>{m.error}</div>}
                  </td>
                  <td className="right">
                    <Btn size="sm" onClick={() => setOpen(m)}>
                      View
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {list.data && <Pager page={list.page} pages={list.data.pages} total={list.data.total} onPage={list.setPage} />}
      </Card>
      {open && (
        <Modal wide title={open.subject} onClose={() => setOpen(null)}>
          <div className="small muted">To {open.to}</div>
          <pre className="pre" style={{ fontFamily: 'inherit' }}>{open.body}</pre>
        </Modal>
      )}
    </>
  );
}
