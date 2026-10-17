'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAction, useList, type Customer } from '@/lib/hooks';
import { useCan } from '@/components/providers';
import { Btn, Card, Empty, Loading, PageHead, Pager, Search } from '@/components/ui';
import { CustomerForm } from '@/components/customer-form';

export default function CustomersPage() {
  const can = useCan();
  const list = useList<Customer>('/masters/customers');
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const canEdit = can('enq.create') || can('masters.manage');
  const toggle = useAction((c: Customer) => api.put(`/masters/customers/${c.id}`, { ...c, active: !c.active }), { success: 'Customer updated', invalidate: [['/masters/customers']] });

  return (
    <>
      <PageHead title="Customers" sub="Customer master with GST details and contact persons (§4.1)." actions={canEdit && <Btn kind="pri" onClick={() => setEditing('new')}>New customer</Btn>} />
      <Card title={<Search value={list.q} onChange={list.setQ} placeholder="Search name, code, GSTIN, city" />} flush>
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty>No customers yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>City / State</th>
                  <th>GSTIN</th>
                  <th>Contacts</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.code}</td>
                    <td className="bold">{c.name}</td>
                    <td>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className="mono">{c.gstin ?? '—'}</td>
                    <td className="small">{c.contacts.map((x) => x.name).join(', ') || '—'}</td>
                    <td>{c.active ? <span className="chip ok">Active</span> : <span className="chip">Inactive</span>}</td>
                    <td className="right nowrap">
                      {canEdit && (
                        <>
                          <Btn size="sm" onClick={() => setEditing(c)}>
                            Edit
                          </Btn>{' '}
                          <Btn size="sm" kind="ghost" onClick={() => toggle.mutate(c)}>
                            {c.active ? 'Deactivate' : 'Activate'}
                          </Btn>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && <Pager page={list.page} pages={list.data.pages} total={list.data.total} onPage={list.setPage} />}
      </Card>
      {editing && <CustomerForm customer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
