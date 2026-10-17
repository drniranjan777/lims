'use client';

import { useState } from 'react';
import { useList } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/format';
import { Btn, Card, Empty, Loading, Modal, PageHead, Pager, Search, Select } from '@/components/ui';

interface Row {
  id: string;
  at: string;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
}

const ENTITIES = ['Customer', 'Enquiry', 'Quotation', 'PurchaseOrder', 'SampleReceipt', 'Registration', 'RegistrationTest', 'Report', 'Dispatch', 'RetainedSample', 'Invoice', 'User', 'TestMaster', 'Formula', 'Equipment', 'Chemical', 'Section', 'Setting'];

export default function AuditPage() {
  const [entityType, setEntityType] = useState('');
  const list = useList<Row>('/audit', { pageSize: 50, extra: { entityType } });
  const [open, setOpen] = useState<Row | null>(null);
  return (
    <>
      <PageHead title="Audit trail" sub="Immutable record of every create, change, signature and sign-in — who, what, when, old and new values." />
      <Card
        flush
        title={
          <div className="row">
            <Search value={list.q} onChange={list.setQ} placeholder="Search action or user" />
            <Select value={entityType} onChange={(e) => (setEntityType(e.target.value), list.setPage(1))} placeholder="All record types" options={ENTITIES.map((e) => ({ value: e, label: e }))} aria-label="Record type" />
          </div>
        }
      >
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty>No entries.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="nowrap small">{fmtDateTime(a.at)}</td>
                    <td>{a.userName ?? 'System'}</td>
                    <td className="mono small">{a.action}</td>
                    <td className="small">
                      {a.entityType}
                      <div className="faint mono">{a.entityId?.slice(0, 40)}</div>
                    </td>
                    <td className="small">{a.reason ?? ''}</td>
                    <td className="right">
                      {(a.before || a.after) ? (
                        <Btn size="sm" onClick={() => setOpen(a)}>
                          Details
                        </Btn>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && <Pager page={list.page} pages={list.data.pages} total={list.data.total} onPage={list.setPage} />}
      </Card>
      {open && (
        <Modal wide title={`${open.action} · ${open.entityType}`} onClose={() => setOpen(null)}>
          <div className="small muted">
            {open.userName} · {fmtDateTime(open.at)} · IP {open.ip ?? '—'}
          </div>
          <div className="grid g2 mt">
            <div>
              <h3>Before</h3>
              <pre className="mono small" style={{ whiteSpace: 'pre-wrap', background: 'var(--panel2)', padding: 10, borderRadius: 6 }}>{JSON.stringify(open.before, null, 2) ?? '—'}</pre>
            </div>
            <div>
              <h3>After</h3>
              <pre className="mono small" style={{ whiteSpace: 'pre-wrap', background: 'var(--panel2)', padding: 10, borderRadius: 6 }}>{JSON.stringify(open.after, null, 2) ?? '—'}</pre>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
