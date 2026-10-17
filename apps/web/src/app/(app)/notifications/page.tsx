'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useList } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/format';
import { Btn, Card, Empty, Loading, PageHead, Pager } from '@/components/ui';

interface N {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const list = useList<N>('/notifications', { pageSize: 30 });
  const read = async (id?: string) => {
    await api.post(id ? `/notifications/${id}/read` : '/notifications/read-all');
    qc.invalidateQueries({ queryKey: ['/notifications'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return (
    <>
      <PageHead title="Notifications" sub="Assignments, review requests, corrections, report readiness and combined-report status (§7)." actions={<Btn onClick={() => read()}>Mark all read</Btn>} />
      <Card flush>
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty>No notifications.</Empty>
        ) : (
          <table className="t">
            <tbody>
              {list.data.items.map((n) => (
                <tr key={n.id} style={n.readAt ? { opacity: 0.65 } : undefined}>
                  <td>
                    <div className="bold">{n.link ? <Link href={n.link} onClick={() => !n.readAt && void read(n.id)}>{n.title}</Link> : n.title}</div>
                    {n.body && <div className="small muted pre">{n.body}</div>}
                  </td>
                  <td className="small nowrap muted">{fmtDateTime(n.createdAt)}</td>
                  <td className="right">
                    {!n.readAt && (
                      <Btn size="sm" kind="ghost" onClick={() => read(n.id)}>
                        Mark read
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {list.data && <Pager page={list.page} pages={list.data.pages} total={list.data.total} onPage={list.setPage} />}
      </Card>
    </>
  );
}
