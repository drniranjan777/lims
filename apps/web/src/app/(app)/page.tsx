'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { statusLabel } from '@lims/shared';
import { api } from '@/lib/api';
import { useMe } from '@/components/providers';
import { Card, ErrorBox, Loading, PageHead } from '@/components/ui';

interface Dashboard {
  counts: Record<string, number>;
  workload: { section: { id: string; name: string }; byStatus: Record<string, number> }[];
  pipeline: { label: string; count: number }[];
}

/** Tile definitions — label, link and whether a non-zero value needs attention. */
const TILES: Record<string, [string, string, boolean?]> = {
  openEnquiries: ['Open enquiries', '/enquiries?status=NEW'],
  draftQuotations: ['Draft quotations', '/quotations?status=DRAFT'],
  quotationsSent: ['Quotations awaiting customer', '/quotations?status=SENT'],
  quotationsAwaitingHod: ['Quotations awaiting HOD review', '/quotations?status=INTERNAL_REVIEW', true],
  quotationsAwaitingAuthorization: ['Quotations awaiting authorization', '/quotations?status=INTERNAL_REVIEW', true],
  acceptedAwaitingSample: ['Accepted — awaiting sample', '/samples'],
  receiptsToPreRegister: ['Samples to pre-register', '/samples', true],
  registrationsAwaitingApproval: ['Registrations to verify', '/registrations?status=PRE_REGISTERED', true],
  sectionPendingReceipt: ['Samples to receive in section', '/section', true],
  testsUnassigned: ['Tests to allocate', '/section', true],
  myOpenTests: ['My open tests', '/analyst'],
  myCorrections: ['Corrections required', '/analyst', true],
  testsAwaitingReview: ['Tests awaiting review', '/review', true],
  registrationsReadyToReport: ['Registrations ready to report', '/reports', true],
  reportsInDraft: ['Reports in draft / preview', '/reports?status=DRAFT,PREVIEW'],
  reportsToDispatch: ['Released reports to dispatch', '/dispatch', true],
  invoicesToDispatch: ['Issued invoices to dispatch', '/dispatch'],
  awaitingCustomerReceipt: ['Dispatches awaiting receipt confirmation', '/dispatch'],
  awaitingStoreReceipt: ['Remnant samples to receive', '/stores'],
  dueForDisposal: ['Samples due for disposal', '/stores?status=DUE_FOR_DISPOSAL', true],
  disposalNext30Days: ['Disposal due in 30 days', '/stores'],
  draftInvoices: ['Draft invoices', '/invoices?status=DRAFT'],
  invoicesToIssue: ['Authorized invoices to issue', '/invoices?status=APPROVED', true],
  invoicesAwaitingAuthorization: ['Invoices awaiting authorization', '/invoices?status=DRAFT', true],
};

const PIPE_LINKS = ['/enquiries', '/quotations', '/samples', '/registrations?status=REGISTERED,IN_TESTING', '/reports', '/dispatch', '/invoices'];
const WORK_STATES = ['UNASSIGNED', 'ASSIGNED', 'IN_TESTING', 'SUBMITTED', 'CORRECTION_REQUIRED'];
const WORK_COLORS: Record<string, string> = { UNASSIGNED: 'var(--warn)', ASSIGNED: 'var(--info)', IN_TESTING: 'var(--primary)', SUBMITTED: 'var(--neutral)', CORRECTION_REQUIRED: 'var(--bad)' };

export default function DashboardPage() {
  const { data: me } = useMe();
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard'), refetchInterval: 60_000 });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return null;
  const tiles = Object.entries(data.counts).filter(([k]) => TILES[k]);

  return (
    <>
      <PageHead title={`Good day, ${me?.name.split(' ')[0] ?? ''}`} sub="Your pending work across the Lucid Labs workflow. Counts are live from the database." />
      <div className="grid g4">
        {tiles.map(([k, v]) => {
          const [label, href, attn] = TILES[k];
          return (
            <Link key={k} href={href} className={`stat ${attn && v > 0 ? 'attn' : ''}`}>
              <div className="v">{v}</div>
              <div className="l">{label}</div>
            </Link>
          );
        })}
      </div>

      <Card title="End-to-end pipeline" className="mt">
        <div className="pipeline">
          {data.pipeline.map((p, i) => (
            <Link key={p.label} href={PIPE_LINKS[i]}>
              <div className="v">{p.count}</div>
              <div className="l">{p.label}</div>
            </Link>
          ))}
        </div>
      </Card>

      {data.workload.length > 0 && (
        <Card title="Testing workload by section" className="mt" actions={<span className="small muted">Open tests (not yet approved)</span>}>
          <div className="grid">
            {data.workload.map((w) => {
              const total = WORK_STATES.reduce((a, s) => a + (w.byStatus[s] ?? 0), 0);
              return (
                <div key={w.section.id}>
                  <div className="between small">
                    <b>{w.section.name}</b>
                    <span className="muted">{total} open</span>
                  </div>
                  <div className="bar" style={{ marginTop: 4 }} role="img" aria-label={WORK_STATES.map((s) => `${statusLabel(s)} ${w.byStatus[s] ?? 0}`).join(', ')}>
                    {total > 0 && WORK_STATES.map((s) => (w.byStatus[s] ? <i key={s} style={{ width: `${((w.byStatus[s] ?? 0) / total) * 100}%`, background: WORK_COLORS[s] }} title={`${statusLabel(s)}: ${w.byStatus[s]}`} /> : null))}
                  </div>
                </div>
              );
            })}
            <div className="row small muted">
              {WORK_STATES.map((s) => (
                <span key={s} className="row" style={{ gap: 4 }}>
                  <i style={{ width: 10, height: 10, borderRadius: 2, background: WORK_COLORS[s], display: 'inline-block' }} /> {statusLabel(s)}
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
