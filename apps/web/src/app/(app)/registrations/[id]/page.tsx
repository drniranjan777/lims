'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REPORT_TYPE_LABELS, REPORT_TYPES, type ReportType } from '@lims/shared';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { fmtDate, fmtDateTime, TEMPLATE_LABELS } from '@/lib/format';
import { useCan } from '@/components/providers';
import { History } from '@/components/history';
import { SignDialog } from '@/components/sign';
import { RegistrationForm, type RegTestDraft } from '@/components/registration-form';
import { Btn, Card, ErrorBox, Field, Input, KV, Loading, Modal, PageHead, Select, Status, Textarea } from '@/components/ui';

interface RegTest extends RegTestDraft {
  id: string;
  status: string;
  finalResult: string | null;
  conformity: string | null;
  analyst: { name: string } | null;
}
interface Registration {
  id: string;
  number: string;
  status: string;
  template: string;
  sampleName: string;
  sampleDescription: string | null;
  quantity: string | null;
  condition: string | null;
  templateData: Record<string, string>;
  remarks: string | null;
  preRegisteredAt: string;
  preRegisteredByName: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  customerNotifiedAt: string | null;
  customer: { name: string };
  contact: { name: string; email: string | null } | null;
  receipt: { id: string; number: string; receivedAt: string; quotation: { id: string; number: string; items: { id: string }[] }; purchaseOrder: { poNumber: string } | null };
  tests: RegTest[];
  sections: { sectionId: string; status: string; receivedAt: string | null; completedAt: string | null }[];
  sectionList: { id: string; name: string }[];
  reports: { id: string; number: string; status: string; sectionId: string | null }[];
  retained: { status: string; plannedDisposalDate: string } | null;
}

function EditTestDialog({ t, regId, onClose }: { t: RegTest; regId: string; onClose: () => void }) {
  const [f, setF] = useState({ testName: t.testName, method: t.method, specification: t.specification ?? '', unit: t.unit ?? '', reportType: t.reportType, replicates: t.replicates, nablAccredited: t.nablAccredited, decimals: t.decimals, reason: '' });
  const save = useAction(() => api.patch(`/registrations/tests/${t.id}`, f), { success: 'Test / method updated', invalidate: [['registration', regId], ['history']], onDone: onClose });
  return (
    <Modal
      title="Edit / modify test & method"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="pri" disabled={!f.reason.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Btn>
        </>
      }
    >
      <div className="grid">
        <Field label="Test">
          <Input value={f.testName} onChange={(e) => setF({ ...f, testName: e.target.value })} />
        </Field>
        <Field label="Method">
          <Input value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} />
        </Field>
        <div className="grid g2">
          <Field label="Specification">
            <Input value={f.specification} onChange={(e) => setF({ ...f, specification: e.target.value })} />
          </Field>
          <Field label="Unit">
            <Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
          </Field>
          <Field label="Report type">
            <Select value={f.reportType} onChange={(e) => setF({ ...f, reportType: e.target.value })} options={REPORT_TYPES.map((r) => ({ value: r, label: REPORT_TYPE_LABELS[r] }))} />
          </Field>
          <Field label="Replicates">
            <Input type="number" min={1} max={5} value={f.replicates} onChange={(e) => setF({ ...f, replicates: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Reason for change" required hint="Recorded in the audit trail">
          <Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        </Field>
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  );
}

export default function RegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const can = useCan();
  const [mode, setMode] = useState<null | 'edit' | 'approve' | 'cancel'>(null);
  const [editTest, setEditTest] = useState<RegTest | null>(null);
  const [reason, setReason] = useState('');
  const { data: r, isLoading, error, refetch } = useQuery({ queryKey: ['registration', id], queryFn: () => api.get<Registration>(`/registrations/${id}`) });
  const cancel = useAction(() => api.post(`/registrations/${id}/cancel`, { reason }), { success: 'Registration cancelled', invalidate: [['registration', id]], onDone: () => setMode(null) });

  if (isLoading) return <Loading />;
  if (error || !r) return <ErrorBox error={error} />;
  const sec = (sid: string) => r.sectionList.find((s) => s.id === sid)?.name ?? '—';

  if (mode === 'edit')
    return (
      <>
        <PageHead title={`Edit ${r.number}`} crumbs={[{ href: '/registrations', label: 'Registration' }]} />
        <RegistrationForm
          id={id}
          quotationItems={r.receipt.quotation.items.map((i) => i.id)}
          initial={{
            template: r.template,
            sampleName: r.sampleName,
            sampleDescription: r.sampleDescription ?? '',
            quantity: r.quantity ?? '',
            condition: r.condition ?? '',
            templateData: r.templateData ?? {},
            remarks: r.remarks ?? '',
            tests: r.tests.map((t) => ({ id: t.id, testId: t.testId, sourceQuotationItemId: t.sourceQuotationItemId, sectionId: t.sectionId, testName: t.testName, method: t.method, specification: t.specification ?? '', unit: t.unit ?? '', reportType: t.reportType, replicates: t.replicates, nablAccredited: t.nablAccredited, formulaId: t.formulaId, decimals: t.decimals })),
          }}
          onSaved={() => (setMode(null), void refetch())}
          onCancel={() => setMode(null)}
        />
      </>
    );

  const pre = r.status === 'PRE_REGISTERED';
  return (
    <>
      <PageHead
        title={
          <span className="row">
            {r.number} <Status s={r.status} />
          </span>
        }
        sub={`${r.sampleName} · ${r.customer.name}`}
        crumbs={[{ href: '/registrations', label: 'Registration' }]}
        actions={
          <>
            <Link className="btn" href={`/registrations/${id}/trace`}>
              Traceability
            </Link>
            {pre && (can('reg.pre') || can('reg.approve')) && <Btn onClick={() => setMode('edit')}>Edit</Btn>}
            {pre && can('reg.approve') && (
              <Btn kind="pri" onClick={() => setMode('approve')}>
                Verify & register
              </Btn>
            )}
            {['PRE_REGISTERED', 'REGISTERED'].includes(r.status) && can('reg.approve') && (
              <Btn kind="danger" onClick={() => (setReason(''), setMode('cancel'))}>
                Cancel
              </Btn>
            )}
          </>
        }
      />
      <div className="split">
        <div>
          <Card title="Sample">
            <div className="grid g2">
              <KV
                rows={[
                  ['Template', TEMPLATE_LABELS[r.template]],
                  ['Sample', r.sampleName],
                  ['Quantity', r.quantity],
                  ['Condition', r.condition],
                  ...Object.entries(r.templateData ?? {}).map(([k, v]): [string, string] => [k, v]),
                ]}
              />
              <KV
                rows={[
                  ['Customer', r.customer.name],
                  ['Contact', r.contact ? `${r.contact.name}${r.contact.email ? ` · ${r.contact.email}` : ''}` : null],
                  ['Quotation', <Link key="q" href={`/quotations/${r.receipt.quotation.id}`}>{r.receipt.quotation.number}</Link>],
                  ['PO', r.receipt.purchaseOrder?.poNumber],
                  ['Receipt', `${r.receipt.number} · ${fmtDateTime(r.receipt.receivedAt)}`],
                ]}
              />
            </div>
            {r.sampleDescription && <p className="pre">{r.sampleDescription}</p>}
          </Card>
          <Card title="Tests" flush className="mt">
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Method</th>
                    <th>Section</th>
                    <th>Report type</th>
                    <th>Analyst</th>
                    <th>Result</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {r.tests.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.testName}
                        {t.nablAccredited && <span className="chip pri" style={{ marginLeft: 6 }}>NABL</span>}
                      </td>
                      <td className="small">{t.method}</td>
                      <td>{sec(t.sectionId)}</td>
                      <td className="small">{REPORT_TYPE_LABELS[t.reportType as ReportType]}</td>
                      <td>{t.analyst?.name ?? '—'}</td>
                      <td>
                        {t.finalResult ? `${t.finalResult} ${t.unit ?? ''}` : '—'} {t.conformity && <Status s={t.conformity} />}
                      </td>
                      <td>
                        <Status s={t.status} />
                      </td>
                      <td className="right nowrap">
                        {t.status !== 'UNASSIGNED' && (
                          <Link className="btn sm" href={`/tests/${t.id}`}>
                            Open
                          </Link>
                        )}{' '}
                        {!pre && can('test.editMethod') && !['SUBMITTED', 'APPROVED'].includes(t.status) && (
                          <Btn size="sm" onClick={() => setEditTest(t)}>
                            Edit method
                          </Btn>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {r.remarks && (
            <Card title="Remarks" className="mt">
              <p className="pre">{r.remarks}</p>
            </Card>
          )}
        </div>
        <div>
          <Card title="Registration">
            <KV
              rows={[
                ['Pre-registered', `${r.preRegisteredByName ?? ''} · ${fmtDateTime(r.preRegisteredAt)}`],
                ['Registered by', r.approvedAt ? `${r.approvedByName} · ${fmtDateTime(r.approvedAt)}` : 'Awaiting verification'],
                ['Customer notified', r.customerNotifiedAt ? fmtDateTime(r.customerNotifiedAt) : null],
                ['Remnant sample', r.retained ? `${r.retained.status.replace(/_/g, ' ').toLowerCase()} · dispose by ${fmtDate(r.retained.plannedDisposalDate)}` : null],
              ]}
            />
          </Card>
          {r.sections.length > 0 && (
            <Card title="Section progress" className="mt">
              <div className="grid">
                {r.sections.map((s) => {
                  const ts = r.tests.filter((t) => t.sectionId === s.sectionId);
                  return (
                    <div key={s.sectionId} className="between">
                      <div>
                        <b>{sec(s.sectionId)}</b>
                        <div className="small muted">
                          {ts.filter((t) => t.status === 'APPROVED').length}/{ts.length} approved{s.completedAt ? ` · completed ${fmtDate(s.completedAt)}` : ''}
                        </div>
                      </div>
                      <Status s={s.status} />
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
          {r.reports.length > 0 && (
            <Card title="Reports" className="mt">
              {r.reports.map((rep) => (
                <div key={rep.id} className="between">
                  <Link href={`/reports/${rep.id}`}>{rep.number}</Link>
                  <span className="row">
                    <span className="small muted">{rep.sectionId ? sec(rep.sectionId) : 'Combined'}</span>
                    <Status s={rep.status} />
                  </span>
                </div>
              ))}
            </Card>
          )}
          <div className="mt">
            <History entityType="Registration" entityId={id} />
          </div>
        </div>
      </div>

      {mode === 'approve' && (
        <SignDialog
          title={`Register ${r.number}`}
          meaning={`You verify the registration details and register the sample to: ${[...new Set(r.tests.map((t) => sec(t.sectionId)))].join(', ')}. The customer contact will be notified.`}
          confirmLabel="Register & sign"
          onClose={() => setMode(null)}
          onSign={async (password) => (await api.post(`/registrations/${id}/approve`, { password }), await refetch())}
        />
      )}
      {mode === 'cancel' && (
        <Modal
          title={`Cancel ${r.number}`}
          onClose={() => setMode(null)}
          footer={
            <>
              <Btn onClick={() => setMode(null)}>Back</Btn>
              <Btn kind="danger" disabled={!reason.trim()} loading={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel registration
              </Btn>
            </>
          }
        >
          <Field label="Reason" required>
            <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <ErrorBox error={cancel.error} />
        </Modal>
      )}
      {editTest && <EditTestDialog t={editTest} regId={id} onClose={() => setEditTest(null)} />}
    </>
  );
}
