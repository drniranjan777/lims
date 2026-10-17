'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@lims/shared';
import { api, type Paged } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useCan, useMe } from './providers';
import { Loading } from './ui';

type NavItem = { href: string; label: string; any: Permission[] | 'all' };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ href: '/', label: 'Dashboard', any: 'all' }] },
  {
    group: 'Customer & Commercial',
    items: [
      { href: '/customers', label: 'Customers', any: ['enq.create', 'masters.manage'] },
      { href: '/enquiries', label: 'CRM Enquiries', any: ['enq.create', 'quote.edit'] },
      { href: '/quotations', label: 'Quotations', any: ['quote.edit', 'quote.review', 'quote.authorize', 'invoice.edit'] },
      { href: '/samples', label: 'PO & Sample Receipt', any: ['po.record'] },
    ],
  },
  {
    group: 'Laboratory',
    items: [
      { href: '/registrations', label: 'Registration', any: ['reg.pre', 'reg.approve', 'test.editMethod', 'sec.assign'] },
      { href: '/section', label: 'Section Workbench', any: ['sec.assign'] },
      { href: '/analyst', label: 'Analyst Workbench', any: ['test.enter'] },
      { href: '/review', label: 'Review & Approval', any: ['test.review'] },
      { href: '/reports', label: 'Reports', any: ['report.release', 'report.editCustomer', 'dispatch.record'] },
    ],
  },
  {
    group: 'Closure',
    items: [
      { href: '/dispatch', label: 'Dispatch', any: ['dispatch.record'] },
      { href: '/stores', label: 'Stores · Retention', any: ['stores.manage'] },
      { href: '/invoices', label: 'Tax Invoices', any: ['invoice.edit', 'invoice.authorize'] },
    ],
  },
  {
    group: 'Administration',
    items: [
      { href: '/admin/masters', label: 'Master data', any: ['masters.manage'] },
      { href: '/admin/users', label: 'Users & roles', any: ['users.manage'] },
      { href: '/admin/settings', label: 'Lab settings', any: ['masters.manage'] },
      { href: '/admin/audit', label: 'Audit trail', any: ['audit.view'] },
      { href: '/admin/outbox', label: 'E-mail outbox', any: ['users.manage'] },
    ],
  },
];

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function Bell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: () => api.get<Paged<Notification> & { unread: number }>('/notifications?pageSize=12'),
    refetchInterval: 30_000,
  });
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const openItem = async (n: Notification) => {
    if (!n.readAt) await api.post(`/notifications/${n.id}/read`);
    qc.invalidateQueries({ queryKey: ['notifications'] });
    setOpen(false);
    if (n.link) router.push(n.link);
  };
  return (
    <div className="bell" ref={ref} style={{ position: 'relative' }}>
      <button className="btn ghost icon" aria-label={`Notifications (${data?.unread ?? 0} unread)`} onClick={() => setOpen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {!!data?.unread && <span className="dot">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <b>Notifications</b>
            <button
              className="btn ghost sm"
              onClick={async () => {
                await api.post('/notifications/read-all');
                qc.invalidateQueries({ queryKey: ['notifications'] });
              }}
            >
              Mark all read
            </button>
          </div>
          {data?.items.length ? (
            data.items.map((n) => (
              <a key={n.id} href={n.link ?? '#'} className={`item ${n.readAt ? '' : 'unread'}`} onClick={(e) => (e.preventDefault(), void openItem(n))}>
                <div className="bold">{n.title}</div>
                {n.body && <div className="small muted pre">{n.body}</div>}
                <div className="small faint">{fmtDateTime(n.createdAt)}</div>
              </a>
            ))
          ) : (
            <div className="empty small">No notifications</div>
          )}
          <Link href="/notifications" className="item small" onClick={() => setOpen(false)}>
            View all →
          </Link>
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error } = useMe();
  const can = useCan();
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => setNavOpen(false), [path]);
  useEffect(() => {
    if (error) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [error, router, path]);

  if (isLoading || !me) return <Loading label="Signing you in…" />;

  const visible = (i: NavItem) => i.any === 'all' || i.any.some((p) => can(p));
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  const logout = async () => {
    await api.post('/auth/logout');
    qc.clear();
    router.replace('/login');
  };

  return (
    <div className="shell">
      <aside className={`side ${navOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark">LL</div>
          <div>
            <b>Lucid Labs</b>
            <small>LIMS</small>
          </div>
        </div>
        {NAV.map((g) => {
          const items = g.items.filter(visible);
          if (!items.length) return null;
          return (
            <nav className="nav-group" key={g.group}>
              <div>{g.group}</div>
              {items.map((i) => (
                <Link key={i.href} href={i.href} className={`nav-link ${active(i.href) ? 'on' : ''}`} aria-current={active(i.href) ? 'page' : undefined}>
                  {i.label}
                </Link>
              ))}
            </nav>
          );
        })}
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon menu-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            ☰
          </button>
          <div className="grow small muted">{me.sections.length ? `Sections: ${me.sections.map((s) => s.name).join(', ')}` : ''}</div>
          <Bell />
          <div className="small" style={{ textAlign: 'right', lineHeight: 1.25 }}>
            <div className="bold">{me.name}</div>
            <div className="muted">{me.roleLabels.join(', ')}</div>
          </div>
          <Link className="btn sm" href="/account">
            Account
          </Link>
          <button className="btn sm" onClick={logout}>
            Sign out
          </button>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
