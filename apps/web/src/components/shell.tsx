'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@lims/shared';
import {
  Archive, Bell as BellIcon, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, ClipboardList, ClipboardPen, Database, FileText, FlaskConical, History,
  House, LayoutDashboard, LogOut, Mail, Menu, MessageSquareText, Network, PackageCheck, ReceiptIndianRupee, Search, Settings, ShieldCheck, Truck, UserCog, UserRound, Users,
  type LucideIcon,
} from 'lucide-react';
import { api, type Paged } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useCan, useMe } from './providers';
import { Loading, usePopover } from './ui';

type NavItem = { href: string; label: string; icon: LucideIcon; any: Permission[] | 'all' };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard, any: 'all' }] },
  {
    group: 'Customer & Commercial',
    items: [
      { href: '/customers', label: 'Customers', icon: Users, any: ['enq.create', 'masters.manage'] },
      { href: '/enquiries', label: 'CRM Enquiries', icon: MessageSquareText, any: ['enq.create', 'quote.edit'] },
      { href: '/quotations', label: 'Quotations', icon: FileText, any: ['quote.edit', 'quote.review', 'quote.authorize', 'invoice.edit'] },
      { href: '/samples', label: 'PO & Sample Receipt', icon: PackageCheck, any: ['po.record'] },
    ],
  },
  {
    group: 'Laboratory',
    items: [
      { href: '/registrations', label: 'Registration', icon: ClipboardPen, any: ['reg.pre', 'reg.approve', 'test.editMethod', 'sec.assign'] },
      { href: '/section', label: 'Section Workbench', icon: Network, any: ['sec.assign'] },
      { href: '/analyst', label: 'Analyst Workbench', icon: FlaskConical, any: ['test.enter'] },
      { href: '/review', label: 'Review & Approval', icon: ShieldCheck, any: ['test.review'] },
      { href: '/reports', label: 'Reports', icon: ClipboardList, any: ['report.release', 'report.editCustomer', 'dispatch.record'] },
    ],
  },
  {
    group: 'Closure',
    items: [
      { href: '/dispatch', label: 'Dispatch', icon: Truck, any: ['dispatch.record'] },
      { href: '/stores', label: 'Stores & Retention', icon: Archive, any: ['stores.manage'] },
      { href: '/invoices', label: 'Tax Invoices', icon: ReceiptIndianRupee, any: ['invoice.edit', 'invoice.authorize'] },
    ],
  },
  {
    group: 'Administration',
    items: [
      { href: '/admin/users', label: 'Users & Roles', icon: UserCog, any: ['users.manage'] },
      { href: '/admin/masters', label: 'Master Data', icon: Database, any: ['masters.manage'] },
      { href: '/admin/audit', label: 'Audit Trail', icon: History, any: ['audit.view'] },
      { href: '/admin/settings', label: 'Settings', icon: Settings, any: ['masters.manage'] },
      { href: '/admin/outbox', label: 'E-mail Outbox', icon: Mail, any: ['users.manage'] },
    ],
  },
];
const ALL_ITEMS = NAV.flatMap((g) => g.items);
const COLLAPSED_KEY = 'nlims.sidebar.collapsed';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function Bell() {
  const { open, setOpen, ref } = usePopover();
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: () => api.get<Paged<Notification> & { unread: number }>('/notifications?pageSize=12'),
    refetchInterval: 30_000,
  });
  const openItem = async (n: Notification) => {
    if (!n.readAt) await api.post(`/notifications/${n.id}/read`);
    qc.invalidateQueries({ queryKey: ['notifications'] });
    setOpen(false);
    if (n.link) router.push(n.link);
  };
  return (
    <div className="pop" ref={ref}>
      <button className="btn ghost icon bell" aria-label={`Notifications (${data?.unread ?? 0} unread)`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <BellIcon size={19} aria-hidden />
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

/** Sample search (registration number, sample name, customer) — Ctrl/⌘ + K focuses it. */
function SampleSearch() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <form
      className="top-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/registrations?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search size={17} aria-hidden />
      <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sample ID, sample, customer…" aria-label="Search samples" />
      <kbd aria-hidden>Ctrl K</kbd>
    </form>
  );
}

function SectionsMenu({ sections }: { sections: { id: string; name: string }[] }) {
  const { open, setOpen, ref } = usePopover();
  const can = useCan();
  return (
    <div className="pop crumb-sections" ref={ref}>
      <button className="crumb-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="truncate">Sections: {sections.map((s) => s.name).join(', ')}</span>
        <ChevronDown size={15} aria-hidden />
      </button>
      {open && (
        <div className="dropdown narrow">
          <div className="item small muted">Your sections</div>
          {sections.map((s) =>
            can('sec.assign') ? (
              <Link key={s.id} href="/section" className="item" onClick={() => setOpen(false)}>
                {s.name}
              </Link>
            ) : (
              <div key={s.id} className="item">
                {s.name}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function UserMenu({ name, roles }: { name: string; roles: string[] }) {
  const { open, setOpen, ref } = usePopover();
  const router = useRouter();
  const qc = useQueryClient();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  const logout = async () => {
    await api.post('/auth/logout');
    qc.clear();
    router.replace('/login');
  };
  return (
    <div className="pop" ref={ref}>
      <button className="user-btn" aria-label={`Account menu for ${name}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" aria-hidden>
          {initials}
        </span>
        <span className="who">
          <b>{name}</b>
          <small>{roles.join(', ')}</small>
        </span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <div className="dropdown narrow">
          <Link href="/account" className="item row" onClick={() => setOpen(false)}>
            <UserRound size={16} aria-hidden /> Account
          </Link>
          <button className="item row" onClick={logout}>
            <LogOut size={16} aria-hidden /> Sign out
          </button>
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
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setNavOpen(false), [path]);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      /* storage unavailable — keep the default */
    }
  }, []);
  useEffect(() => {
    if (error) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [error, router, path]);

  if (isLoading || !me) return <Loading label="Signing you in…" />;

  const visible = (i: NavItem) => i.any === 'all' || i.any.some((p) => can(p));
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  const current = ALL_ITEMS.filter((i) => active(i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable — the choice lasts for this page only */
    }
  };
  // On small screens the menu button opens the off-canvas sidebar; on desktop it collapses it to icons.
  const menuToggle = () => (window.matchMedia('(max-width: 900px)').matches ? setNavOpen(true) : toggleCollapsed());

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className={`side ${navOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="side-head">
          <Link href="/" className="brand">
            <img src="/logo-on-dark.png" alt="NLIMS — Lab Management System" width={640} height={152} />
          </Link>
          <button className="side-toggle" onClick={() => (navOpen ? setNavOpen(false) : toggleCollapsed())} aria-label={navOpen ? 'Close menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed && !navOpen ? <ChevronsRight size={16} aria-hidden /> : <ChevronsLeft size={16} aria-hidden />}
          </button>
        </div>
        {NAV.map((g) => {
          const items = g.items.filter(visible);
          if (!items.length) return null;
          return (
            <nav className="nav-group" key={g.group} aria-label={g.group}>
              <div>{g.group}</div>
              {items.map((i) => (
                <Link key={i.href} href={i.href} title={collapsed ? i.label : undefined} className={`nav-link ${active(i.href) ? 'on' : ''}`} aria-current={active(i.href) ? 'page' : undefined}>
                  <i.icon size={18} strokeWidth={1.8} aria-hidden />
                  <span>{i.label}</span>
                </Link>
              ))}
            </nav>
          );
        })}
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon" aria-label="Toggle menu" onClick={menuToggle}>
            <Menu size={19} aria-hidden />
          </button>
          <nav className="crumbs-top" aria-label="Breadcrumb">
            <Link href={current?.href ?? '/'} className="crumb-home">
              <House size={17} aria-hidden />
              <span>{current?.label ?? 'Dashboard'}</span>
            </Link>
            {me.sections.length > 0 && (
              <>
                <ChevronRight size={15} className="faint" aria-hidden />
                <SectionsMenu sections={me.sections} />
              </>
            )}
          </nav>
          {can('reg.pre') || can('reg.approve') || can('sec.assign') ? <SampleSearch /> : <div className="grow" />}
          <Bell />
          <UserMenu name={me.name} roles={me.roleLabels} />
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
