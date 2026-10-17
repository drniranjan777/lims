'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Archive, Box, CalendarDays, ChartColumn, ClipboardCheck, ClipboardList, Cog, EllipsisVertical, FileCheck2, FileClock,
  FileText, FlaskConical, Microscope, Minus, Network, PackageCheck, ReceiptIndianRupee, RefreshCw, ShieldCheck, TestTubes, Truck, type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@lims/shared';
import { api } from '@/lib/api';
import { useCan, useMe } from '@/components/providers';
import { Card, Empty, ErrorBox, Loading, Status, usePopover } from '@/components/ui';

type Range = 'today' | 'week' | 'month';
interface Flow {
  value: number;
  current: number;
  previous: number;
  series: { day: string; n: number }[];
}
interface Activity {
  id: string;
  registrationId: string;
  testId: string | null;
  sampleId: string;
  customer: string;
  what: string;
  activity: string;
  status: string;
  at: string;
  by: string | null;
}
interface Dashboard {
  counts: Record<string, number>;
  kpis: Record<'openEnquiries' | 'activeSamples' | 'testsInProgress' | 'reportsAwaitingApproval', Flow>;
  pipeline: { key: string; count: number }[];
  sections: { id: string; name: string; index: number; done: number; total: number }[];
  recent: Activity[] | null;
}

const RANGES: Record<Range, { label: string; vs: string; period: string }> = {
  today: { label: 'Today', vs: 'vs. yesterday', period: 'Today' },
  week: { label: 'Last 7 days', vs: 'vs. prior 7 days', period: 'Last 7 days' },
  month: { label: 'Last 30 days', vs: 'vs. prior 30 days', period: 'Last 30 days' },
};

/** Tile tints, in fixed order — validated categorical palette (see globals.css --t-*). */
const TINTS = ['blue', 'green', 'violet', 'orange'] as const;

const KPIS: { key: keyof Dashboard['kpis']; label: string; flowLabel: string; icon: LucideIcon; tint: (typeof TINTS)[number]; href: string; any: Permission[] }[] = [
  { key: 'openEnquiries', label: 'Open enquiries', flowLabel: 'new enquiries', icon: FileText, tint: 'blue', href: '/enquiries', any: ['enq.create', 'quote.edit'] },
  { key: 'activeSamples', label: 'Active samples', flowLabel: 'samples registered', icon: FlaskConical, tint: 'green', href: '/registrations?status=REGISTERED,IN_TESTING,TESTING_COMPLETE', any: ['reg.pre', 'reg.approve', 'test.editMethod', 'sec.assign'] },
  { key: 'testsInProgress', label: 'Tests in progress', flowLabel: 'tests allocated', icon: Cog, tint: 'violet', href: '/section', any: ['sec.assign'] },
  { key: 'reportsAwaitingApproval', label: 'Reports awaiting approval', flowLabel: 'reports created', icon: FileClock, tint: 'orange', href: '/reports?status=DRAFT,PREVIEW', any: ['report.release', 'report.editCustomer', 'dispatch.record'] },
];

const PIPELINE: Record<string, { label: string; sub: (r: Range) => string; icon: LucideIcon; tint: string; href: string; any: Permission[] }> = {
  enquiries: { label: 'Enquiries', sub: () => 'Open enquiries', icon: FileText, tint: 'blue', href: '/enquiries', any: ['enq.create', 'quote.edit'] },
  quotations: { label: 'Quotations', sub: () => 'Draft / review', icon: ClipboardList, tint: 'violet', href: '/quotations?status=DRAFT,INTERNAL_REVIEW', any: ['quote.edit', 'quote.review', 'quote.authorize', 'invoice.edit'] },
  samplesReceived: { label: 'Samples received', sub: (r) => RANGES[r].period, icon: Box, tint: 'green', href: '/samples', any: ['po.record'] },
  testing: { label: 'Testing', sub: () => 'In progress', icon: FlaskConical, tint: 'orange', href: '/registrations?status=REGISTERED,IN_TESTING', any: ['reg.pre', 'reg.approve', 'test.editMethod', 'sec.assign'] },
  review: { label: 'Review', sub: () => 'Awaiting approval', icon: ShieldCheck, tint: 'red', href: '/review', any: ['test.review'] },
  reportsReleased: { label: 'Reports released', sub: (r) => RANGES[r].period, icon: FileCheck2, tint: 'blue', href: '/reports?status=RELEASED,DISPATCHED', any: ['report.release', 'report.editCustomer', 'dispatch.record'] },
  invoicing: { label: 'Invoicing', sub: () => 'Pending', icon: ReceiptIndianRupee, tint: 'violet', href: '/invoices?status=DRAFT,APPROVED', any: ['invoice.edit', 'invoice.authorize'] },
};

type Priority = 'high' | 'medium' | 'low';
const PRIORITY_LABEL: Record<Priority, string> = { high: 'High priority', medium: 'Medium', low: 'Low' };
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
/** Pending-action rows, one per dashboard count: [singular, plural, description, priority, icon, tint, link]. */
const ACTIONS: Record<string, [string, string, string, Priority, LucideIcon, string, string]> = {
  registrationsAwaitingApproval: ['registration to verify', 'registrations to verify', 'New sample registrations awaiting your review', 'high', ClipboardCheck, 'red', '/registrations?status=PRE_REGISTERED'],
  receiptsToPreRegister: ['sample to pre-register', 'samples to pre-register', 'Received samples without a registration', 'high', PackageCheck, 'red', '/samples'],
  sectionPendingReceipt: ['sample to receive in section', 'samples to receive in section', 'Registered samples waiting for your section', 'high', Network, 'red', '/section'],
  testsUnassigned: ['test to allocate', 'tests to allocate', 'Tests not yet assigned to an analyst', 'high', Network, 'red', '/section'],
  myCorrections: ['test returned for correction', 'tests returned for correction', 'Reviewer comments need your attention', 'high', FlaskConical, 'red', '/analyst'],
  dueForDisposal: ['sample due for disposal', 'samples due for disposal', 'Retention period has ended', 'high', Archive, 'red', '/stores?status=DUE_FOR_DISPOSAL'],
  testsAwaitingReview: ['test awaiting review', 'tests awaiting review', 'Completed tests pending technical review', 'medium', FlaskConical, 'orange', '/review'],
  myOpenTests: ['open test assigned to you', 'open tests assigned to you', 'Record observations and submit for review', 'medium', FlaskConical, 'orange', '/analyst'],
  registrationsReadyToReport: ['sample ready for reporting', 'samples ready for reporting', 'All tests approved — create the report', 'medium', FileText, 'blue', '/reports'],
  reportsInDraft: ['report ready for release', 'reports ready for release', 'Draft or previewed reports awaiting authorization', 'medium', FileCheck2, 'blue', '/reports?status=DRAFT,PREVIEW'],
  quotationsAwaitingHod: ['quotation awaiting HOD review', 'quotations awaiting HOD review', 'Confirm tests, methods and specifications', 'medium', ClipboardList, 'orange', '/quotations?status=INTERNAL_REVIEW'],
  quotationsAwaitingAuthorization: ['quotation awaiting authorization', 'quotations awaiting authorization', 'HOD-confirmed quotations to sign', 'medium', ClipboardList, 'orange', '/quotations?status=INTERNAL_REVIEW'],
  reportsToDispatch: ['released report to dispatch', 'released reports to dispatch', 'Send to the customer and record the docket', 'medium', Truck, 'blue', '/dispatch'],
  invoicesToIssue: ['authorized invoice to issue', 'authorized invoices to issue', 'Assign the statutory invoice number', 'medium', ReceiptIndianRupee, 'violet', '/invoices?status=APPROVED'],
  awaitingStoreReceipt: ['remnant sample to receive', 'remnant samples to receive', 'Tested samples to take into retention', 'medium', Archive, 'orange', '/stores'],
  invoicesAwaitingAuthorization: ['invoice awaiting authorization', 'invoices awaiting authorization', 'Draft invoices pending your approval', 'low', ReceiptIndianRupee, 'violet', '/invoices?status=DRAFT'],
  draftInvoices: ['draft invoice', 'draft invoices', 'Complete and send for authorization', 'low', ReceiptIndianRupee, 'violet', '/invoices?status=DRAFT'],
  acceptedAwaitingSample: ['accepted quotation awaiting sample', 'accepted quotations awaiting sample', 'Customer PO received — sample not yet in', 'low', PackageCheck, 'green', '/samples'],
  draftQuotations: ['draft quotation', 'draft quotations', 'Finish and submit for review', 'low', ClipboardList, 'violet', '/quotations?status=DRAFT'],
  quotationsSent: ['quotation awaiting customer', 'quotations awaiting customer', 'Sent — waiting for the customer PO', 'low', ClipboardList, 'blue', '/quotations?status=SENT'],
  openEnquiries: ['open enquiry', 'open enquiries', 'Follow up or prepare a quotation', 'low', FileText, 'blue', '/enquiries'],
  invoicesToDispatch: ['issued invoice to dispatch', 'issued invoices to dispatch', 'Send with the report or separately', 'low', Truck, 'blue', '/dispatch'],
  awaitingCustomerReceipt: ['dispatch awaiting confirmation', 'dispatches awaiting confirmation', 'Record the customer’s receipt', 'low', Truck, 'blue', '/dispatch'],
  disposalNext30Days: ['sample due for disposal in 30 days', 'samples due for disposal in 30 days', 'Plan disposal with the customer', 'low', Archive, 'orange', '/stores'],
};

function sectionIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (n.includes('chem')) return FlaskConical;
  if (n.includes('instrument')) return ChartColumn;
  if (n.includes('micro')) return Microscope;
  if (n.includes('mech')) return Cog;
  return TestTubes;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
function fmtWhen(iso: string) {
  const d = new Date(iso);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return days === 0 ? `Today, ${time}` : days === 1 ? `Yesterday, ${time}` : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`;
}

/** Daily-flow sparkline with a hover read-out of the day under the pointer. */
function Sparkline({ series, label }: { series: Flow['series']; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 120;
  const H = 40;
  const max = Math.max(1, ...series.map((p) => p.n));
  const x = (i: number) => (series.length < 2 ? W / 2 : (i / (series.length - 1)) * (W - 4) + 2);
  const y = (n: number) => H - 3 - (n / max) * (H - 8);
  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join(' ');
  const last = series.length - 1;
  const shown = hover ?? last;
  const total = series.reduce((a, p) => a + p.n, 0);
  return (
    <div className="spark">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: ${total} over the last ${series.length} days`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(last, Math.round(((e.clientX - r.left) / r.width) * last))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <path d={`${line} L${x(last)},${H} L${x(0)},${H} Z`} className="area" />
        <path d={line} className="line" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={2} y2={H} className="guide" />}
        <path d={`M${x(shown)},${y(series[shown]!.n)}h0`} className="dot" />
      </svg>
      {hover !== null && (
        <span className="spark-tip">
          {fmtDay(series[hover]!.day)}: <b>{series[hover]!.n}</b>
        </span>
      )}
    </div>
  );
}

function Kpi({ k, data, range }: { k: (typeof KPIS)[number]; data: Flow; range: Range }) {
  const can = useCan();
  const delta = data.current - data.previous;
  const Trend = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const body = (
    <>
      <div className="kpi-top">
        <span className={`tile-icon t-${k.tint}`}>
          <k.icon size={24} strokeWidth={1.8} aria-hidden />
        </span>
        <div>
          <div className="kpi-label">{k.label}</div>
          <div className="kpi-value">{data.value}</div>
        </div>
      </div>
      <div className="kpi-foot">
        <span className={`delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`} title={`${data.current} ${k.flowLabel} (${RANGES[range].period.toLowerCase()}), ${data.previous} in the previous period`}>
          <Trend size={16} aria-hidden />
          {delta === 0 ? 'No change' : delta > 0 ? `+${delta} new` : `${delta} new`}
          <span className="muted"> {RANGES[range].vs}</span>
        </span>
        <Sparkline series={data.series} label={`Daily ${k.flowLabel}`} />
      </div>
    </>
  );
  return k.any.some((p) => can(p)) ? (
    <Link href={k.href} className={`kpi tint-${k.tint}`}>
      {body}
    </Link>
  ) : (
    <div className={`kpi tint-${k.tint}`}>{body}</div>
  );
}

function ViewAll({ href, children = 'View all' }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="view-all">
      {children} <ArrowRight size={15} aria-hidden />
    </Link>
  );
}

function RowMenu({ a }: { a: Activity }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="pop" ref={ref}>
      <button className="btn ghost icon sm" aria-label={`Actions for ${a.sampleId}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <EllipsisVertical size={16} aria-hidden />
      </button>
      {open && (
        <div className="dropdown narrow">
          {a.testId && (
            <Link href={`/tests/${a.testId}`} className="item">
              Open test
            </Link>
          )}
          <Link href={`/registrations/${a.registrationId}`} className="item">
            Open registration
          </Link>
          <Link href={`/registrations/${a.registrationId}/trace`} className="item">
            Traceability
          </Link>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { data: me } = useMe();
  const can = useCan();
  const [range, setRange] = useState<Range>('today');
  const [allActions, setAllActions] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ['dashboard', range], queryFn: () => api.get<Dashboard>(`/dashboard?range=${range}`), refetchInterval: 60_000, placeholderData: (prev) => prev });
  const canAny = (perms: Permission[]) => perms.some((p) => can(p));

  const actions = Object.entries(data?.counts ?? {})
    .filter(([k, v]) => v > 0 && ACTIONS[k])
    .map(([k, v]) => ({ key: k, n: v, def: ACTIONS[k]! }))
    .sort((a, b) => PRIORITY_RANK[a.def[3]] - PRIORITY_RANK[b.def[3]] || b.n - a.n);
  const shownActions = allActions ? actions : actions.slice(0, 4);

  return (
    <>
      <section className="dash-hero">
        <div className="dash-head">
          <div>
            <h1>
              {greeting()}, {me?.name}
            </h1>
            <p className="muted">Your laboratory operations at a glance. Here’s what’s happening {range === 'today' ? 'today' : `over the ${RANGES[range].label.toLowerCase()}`}.</p>
          </div>
          <div className="dash-tagline" aria-hidden>
            <span>
              Accurate results
              <br />
              for a healthier tomorrow
            </span>
          </div>
          <div className="dash-actions">
            <label className="range-select">
              <CalendarDays size={17} aria-hidden />
              <select value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label="Date range">
                {(Object.keys(RANGES) as Range[]).map((r) => (
                  <option key={r} value={r}>
                    {RANGES[r].label}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn pri" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw size={16} className={isFetching ? 'spin' : undefined} aria-hidden /> Refresh
            </button>
          </div>
        </div>
        {data && (
          <div className="kpis">
            {KPIS.map((k) => (
              <Kpi key={k.key} k={k} data={data.kpis[k.key]} range={range} />
            ))}
          </div>
        )}
      </section>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : data ? (
        <>
          <Card title="End-to-end workflow pipeline" className="mt" actions={canAny(['reg.pre', 'reg.approve', 'sec.assign']) && <ViewAll href="/registrations">View registrations</ViewAll>}>
            <ol className="flow">
              {data.pipeline.map((p) => {
                const s = PIPELINE[p.key]!;
                const inner = (
                  <>
                    <span className={`tile-icon sm t-${s.tint}`}>
                      <s.icon size={20} strokeWidth={1.8} aria-hidden />
                    </span>
                    <span>
                      <span className="flow-label">{s.label}</span>
                      <span className="flow-count">{p.count}</span>
                      <span className="flow-sub">{s.sub(range)}</span>
                    </span>
                  </>
                );
                return <li key={p.key}>{canAny(s.any) ? <Link href={s.href}>{inner}</Link> : <div>{inner}</div>}</li>;
              })}
            </ol>
          </Card>

          <div className="dash-split mt">
            <Card title="Testing workload by section" actions={can('sec.assign') && <ViewAll href="/section" />}>
              {data.sections.length === 0 ? (
                <Empty>No laboratory sections assigned to you.</Empty>
              ) : (
                <ul className="workload">
                  {data.sections.map((s) => {
                    const Icon = sectionIcon(s.name);
                    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
                    const tint = TINTS[s.index % TINTS.length];
                    return (
                      <li key={s.id} className={`tint-${tint}`}>
                        <span className={`tile-icon sm t-${tint}`}>
                          <Icon size={20} strokeWidth={1.8} aria-hidden />
                        </span>
                        <span className="wl-name">{s.name}</span>
                        <span className="meter" role="meter" aria-valuemin={0} aria-valuemax={s.total} aria-valuenow={s.done} aria-label={`${s.name}: ${s.done} of ${s.total} tests approved`}>
                          <i style={{ width: `${pct}%` }} />
                        </span>
                        <span className="wl-count">{s.total ? `${s.done} / ${s.total} tests` : 'No active tests'}</span>
                        <span className="pill">{pct}%</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="small faint" style={{ margin: '12px 0 0' }}>
                Approved tests out of all tests on samples currently registered or in testing.
              </p>
            </Card>

            <Card
              title="Pending actions"
              actions={
                actions.length > 4 && (
                  <button className="view-all" onClick={() => setAllActions((v) => !v)}>
                    {allActions ? 'Show fewer' : `View all (${actions.length})`} <ArrowRight size={15} aria-hidden />
                  </button>
                )
              }
            >
              {actions.length === 0 ? (
                <Empty>You’re all caught up — nothing is waiting on you.</Empty>
              ) : (
                <ul className="actions-list">
                  {shownActions.map(({ key, n, def: [one, many, desc, priority, Icon, tint, href] }) => (
                    <li key={key}>
                      <Link href={href}>
                        <span className={`tile-icon sm t-${tint}`}>
                          <Icon size={20} strokeWidth={1.8} aria-hidden />
                        </span>
                        <span className="grow">
                          <b>
                            {n} {n === 1 ? one : many}
                          </b>
                          <span className="small muted">{desc}</span>
                        </span>
                        <span className={`prio ${priority}`}>{PRIORITY_LABEL[priority]}</span>
                        <ArrowRight size={16} className="faint" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {data.recent && (
            <Card title="Recent activity" className="mt" flush actions={can('audit.view') && <ViewAll href="/admin/audit" />}>
              {data.recent.length === 0 ? (
                <Empty>No sample activity yet.</Empty>
              ) : (
                <div className="table-wrap">
                  <table className="t recent-table">
                    <thead>
                      <tr>
                        <th>Sample ID</th>
                        <th>Customer</th>
                        <th>Test / Section</th>
                        <th>Activity</th>
                        <th>Status</th>
                        <th>Updated at</th>
                        <th>By</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((a) => (
                        <tr key={a.id}>
                          <td className="mono">
                            <Link href={a.testId ? `/tests/${a.testId}` : `/registrations/${a.registrationId}`}>{a.sampleId}</Link>
                          </td>
                          <td>{a.customer}</td>
                          <td>{a.what}</td>
                          <td>{a.activity}</td>
                          <td>
                            <Status s={a.status} />
                          </td>
                          <td className="nowrap">{fmtWhen(a.at)}</td>
                          <td>{a.by ?? '—'}</td>
                          <td className="right">
                            <RowMenu a={a} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      ) : null}
    </>
  );
}
