'use client';

import Link from 'next/link';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { average, checkConformity, evaluateFormula, REPORT_TYPE_LABELS, roundTo, type ReportType } from '@lims/shared';
import { api, fileUrl } from '@/lib/api';
import { useAction, useMaster } from '@/lib/hooks';
import { fmtDate, fmtDateTime, TEMPLATE_LABELS } from '@/lib/format';
import { useCan, useMe, useToast } from '@/components/providers';
import { History } from '@/components/history';
import { SignDialog } from '@/components/sign';
import { Btn, Card, Check, ErrorBox, Field, Input, KV, Loading, PageHead, Select, Status, Textarea } from '@/components/ui';

type Val = number | string | null;
interface FormulaSnap {
  code: string;
  name: string;
  expression: string;
  displayExpression: string | null;
  variables: { key: string; label: string; unit?: string | null }[];
  resultUnit: string | null;
}
interface Attachment {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  size: number;
  caption: string | null;
  includeInReport: boolean;
  sha256: string;
  createdAt: string;
}
interface Test {
  id: string;
  testName: string;
  method: string;
  specification: string | null;
  unit: string | null;
  reportType: ReportType;
  replicates: number;
  decimals: number;
  nablAccredited: boolean;
  status: string;
  analystId: string | null;
  analyst: { name: string } | null;
  formulaSnapshot: FormulaSnap | null;
  observations: { replicates: Record<string, Val>[]; computed: { value: number | null; error?: string }[] } | null;
  rawData: string | null;
  readingNotes: string | null;
  environment: string | null;
  finalResult: string | null;
  calculatedValue: number | null;
  conformity: string | null;
  remarks: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewComments: string | null;
  section: { id: string; name: string };
  registration: { id: string; number: string; sampleName: string; sampleDescription: string | null; template: string; templateData: Record<string, string>; quantity: string | null; condition: string | null; customer: { name: string } };
  chemicals: { id: string; quantity: number | null; unit: string | null; lotNumber: string | null; remarks: string | null; createdAt: string; chemical: { code: string; name: string; kind: string; expiryDate: string | null } }[];
  equipment: { id: string; usedFrom: string | null; usedTo: string | null; calibrationDueAtUse: string | null; remarks: string | null; equipment: { code: string; name: string } }[];
  reviewEvents: { id: string; action: string; comments: string | null; byName: string; at: string }[];
  attachments: Attachment[];
}

const EDITABLE = ['ASSIGNED', 'IN_TESTING', 'CORRECTION_REQUIRED'];

function ObservationEditor({ t, editable, onSaved }: { t: Test; editable: boolean; onSaved: () => void }) {
  const f = t.formulaSnapshot;
  const cols = f ? f.variables : [{ key: 'value', label: `Reading${t.unit ? ` (${t.unit})` : ''}` }];
  const blank = () => Object.fromEntries(cols.map((c) => [c.key, ''])) as Record<string, Val>;
  const initialRows = t.observations?.replicates?.length ? t.observations.replicates : Array.from({ length: t.replicates }, blank);
  const [rows, setRows] = useState<Record<string, Val>[]>(initialRows);
  const [form, setForm] = useState({ rawData: t.rawData ?? '', readingNotes: t.readingNotes ?? '', environment: t.environment ?? '', remarks: t.remarks ?? '', finalResult: '' });
  const [override, setOverride] = useState(Boolean(t.finalResult && t.calculatedValue === null && t.finalResult));
  useEffect(() => {
    if (override) setForm((x) => ({ ...x, finalResult: x.finalResult || t.finalResult || '' }));
  }, [override, t.finalResult]);

  // Live preview with the same engine the server uses; the server recomputes and stores the result.
  const preview = useMemo(() => {
    const vals = rows.map((r) => {
      try {
        if (f) {
          const vars: Record<string, number> = {};
          for (const v of f.variables) {
            if (r[v.key] === '' || r[v.key] === null || r[v.key] === undefined) return { v: null as number | null };
            vars[v.key] = Number(r[v.key]);
          }
          return { v: evaluateFormula(f.expression, vars) };
        }
        return { v: r.value === '' || r.value === null ? null : Number(r.value) };
      } catch (e) {
        return { v: null, err: (e as Error).message };
      }
    });
    const mean = average(vals.map((x) => x.v).filter((x): x is number => x !== null && Number.isFinite(x)));
    const result = mean === null ? null : roundTo(mean, t.decimals);
    return { vals, result, conformity: checkConformity(t.specification, result) };
  }, [rows, f, t.decimals, t.specification]);

  const save = useAction(
    () =>
      api.put(`/tests/${t.id}/observations`, {
        replicates: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : v]))),
        rawData: form.rawData,
        readingNotes: form.readingNotes,
        environment: form.environment,
        remarks: form.remarks,
        finalResult: override ? form.finalResult : null,
      }),
    { success: 'Observations saved', onDone: onSaved },
  );

  return (
    <Card
      title="Observations & calculation"
      actions={<span className="small muted">{REPORT_TYPE_LABELS[t.reportType]} · {t.replicates} replicate(s)</span>}
      footer={
        editable && (
          <Btn kind="pri" loading={save.isPending} onClick={() => save.mutate()}>
            Save observations
          </Btn>
        )
      }
    >
      <div className="grid">
        {f && (
          <div>
            <div className="small muted">Formula ({f.name})</div>
            <span className="formula">{f.displayExpression || f.expression}</span>
          </div>
        )}
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>#</th>
                {cols.map((c) => (
                  <th key={c.key}>
                    {c.label}
                    {'unit' in c && c.unit ? ` (${c.unit})` : ''}
                  </th>
                ))}
                {f && <th className="num">Calculated{f.resultUnit ? ` (${f.resultUnit})` : ''}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>R{i + 1}</td>
                  {cols.map((c) => (
                    <td key={c.key}>
                      <Input type="number" step="any" disabled={!editable} value={r[c.key] ?? ''} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, [c.key]: e.target.value } : x)))} aria-label={`${c.label} replicate ${i + 1}`} />
                    </td>
                  ))}
                  {f && (
                    <td className="num">
                      {preview.vals[i]?.err ? <span style={{ color: 'var(--bad)' }}>{preview.vals[i].err}</span> : preview.vals[i]?.v !== null && preview.vals[i]?.v !== undefined ? roundTo(preview.vals[i].v as number, t.decimals + 2) : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid g3">
          <div className="stat">
            <div className="l">{t.replicates > 1 ? 'Mean result' : 'Result'}</div>
            <div className="v">
              {override ? form.finalResult || '—' : preview.result ?? '—'} <span className="small muted">{t.unit}</span>
            </div>
          </div>
          <div className="stat">
            <div className="l">Specification</div>
            <div className="v" style={{ fontSize: 18 }}>
              {t.specification ?? '—'} <span className="small muted">{t.unit}</span>
            </div>
          </div>
          <div className="stat">
            <div className="l">Conformity</div>
            <div className="v" style={{ fontSize: 18 }}>{override ? <span className="muted small">Stated in remarks</span> : <Status s={preview.conformity} />}</div>
          </div>
        </div>
        {editable && <Check label="Enter the final result as text (e.g. 'Complies', 'Absent', '< 10 cfu/g')" checked={override} onChange={setOverride} />}
        {override && (
          <Field label="Final result (reported to customer)">
            <Input disabled={!editable} value={form.finalResult} onChange={(e) => setForm({ ...form, finalResult: e.target.value })} />
          </Field>
        )}
        <div className="grid g2">
          <Field label="Raw data / observations" hint="Retained against the registration — not printed on the report">
            <Textarea rows={4} disabled={!editable} value={form.rawData} onChange={(e) => setForm({ ...form, rawData: e.target.value })} />
          </Field>
          <Field label="Reading sheet notes">
            <Textarea rows={4} disabled={!editable} value={form.readingNotes} onChange={(e) => setForm({ ...form, readingNotes: e.target.value })} />
          </Field>
          <Field label="Environmental conditions">
            <Input disabled={!editable} value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })} placeholder="e.g. 23 °C, 48 % RH" />
          </Field>
          <Field label="Test remarks / comments" hint="Printed on the report under the test">
            <Input disabled={!editable} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Field>
        </div>
        <ErrorBox error={save.error} />
      </div>
    </Card>
  );
}

function UsagePanels({ t, editable, refresh }: { t: Test; editable: boolean; refresh: () => void }) {
  const { data: chems = [] } = useMaster<{ id: string; code: string; name: string; lotNumber: string | null; expiryDate: string | null; kind: string }>('chemicals', { active: 'true' });
  const { data: equip = [] } = useMaster<{ id: string; code: string; name: string; calibrationDue: string | null; sectionId: string | null }>('equipment', { active: 'true' });
  const [c, setC] = useState({ chemicalId: '', quantity: '', unit: '', remarks: '' });
  const [e, setE] = useState({ equipmentId: '', usedFrom: '', usedTo: '', remarks: '' });
  const addC = useAction(() => api.post(`/tests/${t.id}/chemicals`, { ...c, quantity: c.quantity === '' ? null : Number(c.quantity) }), { success: 'Usage recorded', onDone: () => (setC({ chemicalId: '', quantity: '', unit: '', remarks: '' }), refresh()) });
  const addE = useAction(() => api.post(`/tests/${t.id}/equipment`, { ...e, usedFrom: e.usedFrom ? new Date(e.usedFrom + '+05:30').toISOString() : null, usedTo: e.usedTo ? new Date(e.usedTo + '+05:30').toISOString() : null }), { success: 'Equipment usage recorded', onDone: () => (setE({ equipmentId: '', usedFrom: '', usedTo: '', remarks: '' }), refresh()) });
  const del = useAction((p: string) => api.del(`/tests/${t.id}/${p}`), { success: 'Removed', onDone: refresh });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid g2 mt">
      <Card title="Chemical & standard usage" flush>
        <table className="t">
          <thead>
            <tr>
              <th>Chemical / standard</th>
              <th>Lot</th>
              <th className="num">Qty</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.chemicals.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.chemical.name}
                  <div className="small faint">{u.chemical.code}</div>
                </td>
                <td className="small">{u.lotNumber ?? '—'}</td>
                <td className="num">
                  {u.quantity ?? '—'} {u.unit}
                </td>
                <td>{editable && <Btn size="sm" kind="ghost" onClick={() => del.mutate(`chemicals/${u.id}`)} aria-label="Remove">✕</Btn>}</td>
              </tr>
            ))}
            {!t.chemicals.length && (
              <tr>
                <td colSpan={4} className="empty small">
                  None recorded
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {editable && (
          <div className="grid" style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
            <Select value={c.chemicalId} onChange={(x) => setC({ ...c, chemicalId: x.target.value })} placeholder="Select chemical / standard…" options={chems.map((x) => ({ value: x.id, label: `${x.name} · lot ${x.lotNumber ?? '—'}${x.expiryDate && x.expiryDate.slice(0, 10) < today ? ' (EXPIRED)' : ''}` }))} aria-label="Chemical" />
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Input type="number" step="any" placeholder="Qty" value={c.quantity} onChange={(x) => setC({ ...c, quantity: x.target.value })} aria-label="Quantity" />
              <Input placeholder="Unit" value={c.unit} onChange={(x) => setC({ ...c, unit: x.target.value })} aria-label="Unit" style={{ width: 90 }} />
              <Btn disabled={!c.chemicalId} loading={addC.isPending} onClick={() => addC.mutate()}>
                Add
              </Btn>
            </div>
          </div>
        )}
      </Card>
      <Card title="Equipment usage" flush>
        <table className="t">
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Used</th>
              <th>Calibration due</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.equipment.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.equipment.name}
                  <div className="small faint">{u.equipment.code}</div>
                </td>
                <td className="small">{u.usedFrom ? `${fmtDateTime(u.usedFrom)}${u.usedTo ? ` → ${fmtDateTime(u.usedTo)}` : ''}` : '—'}</td>
                <td className="small">{fmtDate(u.calibrationDueAtUse)}</td>
                <td>{editable && <Btn size="sm" kind="ghost" onClick={() => del.mutate(`equipment/${u.id}`)} aria-label="Remove">✕</Btn>}</td>
              </tr>
            ))}
            {!t.equipment.length && (
              <tr>
                <td colSpan={4} className="empty small">
                  None recorded
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {editable && (
          <div className="grid" style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
            <Select value={e.equipmentId} onChange={(x) => setE({ ...e, equipmentId: x.target.value })} placeholder="Select equipment…" options={equip.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}${x.calibrationDue && x.calibrationDue.slice(0, 10) < today ? ' (CALIBRATION OVERDUE)' : x.calibrationDue ? ` · cal. due ${fmtDate(x.calibrationDue)}` : ''}` }))} aria-label="Equipment" />
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Input type="datetime-local" value={e.usedFrom} onChange={(x) => setE({ ...e, usedFrom: x.target.value })} aria-label="Used from" />
              <Input type="datetime-local" value={e.usedTo} onChange={(x) => setE({ ...e, usedTo: x.target.value })} aria-label="Used to" />
              <Btn disabled={!e.equipmentId} loading={addE.isPending} onClick={() => addE.mutate()}>
                Add
              </Btn>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Attachments({ t, editable, refresh }: { t: Test; editable: boolean; refresh: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState({ kind: 'IMAGE', caption: '', includeInReport: ['INSTRUMENT', 'VALIDATION'].includes(t.reportType) });
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('files', f);
    fd.append('kind', meta.kind);
    fd.append('caption', meta.caption);
    fd.append('includeInReport', String(meta.includeInReport));
    setBusy(true);
    try {
      await api.post(`/tests/${t.id}/attachments`, fd);
      toast(`${files.length} file(s) uploaded`);
      setMeta((m) => ({ ...m, caption: '' }));
      refresh();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const patch = useAction((a: { id: string; includeInReport: boolean }) => api.patch(`/tests/${t.id}/attachments/${a.id}`, { includeInReport: a.includeInReport }), { onDone: refresh });
  const del = useAction((id: string) => api.del(`/tests/${t.id}/attachments/${id}`), { success: 'File removed', onDone: refresh });
  return (
    <Card title="Images, peaks, graphs & raw-data files" className="mt">
      {editable && (
        <div className="row" style={{ marginBottom: 12 }}>
          <Select value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value })} options={[{ value: 'IMAGE', label: 'Image' }, { value: 'PEAK', label: 'Chromatogram / peak' }, { value: 'GRAPH', label: 'Graph' }, { value: 'RAW_DATA', label: 'Raw-data export' }, { value: 'DOCUMENT', label: 'Document' }]} aria-label="File type" />
          <Input placeholder="Caption" value={meta.caption} onChange={(e) => setMeta({ ...meta, caption: e.target.value })} aria-label="Caption" />
          <Check label="Include in report" checked={meta.includeInReport} onChange={(v) => setMeta({ ...meta, includeInReport: v })} />
          <input ref={input} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} accept="image/png,image/jpeg,image/gif,image/webp,image/tiff,application/pdf,text/csv,text/plain,.xlsx,.xls,.docx,.doc" />
          <Btn kind="pri" loading={busy} onClick={() => input.current?.click()}>
            Upload files
          </Btn>
        </div>
      )}
      {!t.attachments.length ? (
        <div className="small muted">No files attached.</div>
      ) : (
        <div className="thumbs">
          {t.attachments.map((a) => (
            <div className="thumb" key={a.id}>
              {a.mimeType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(`/attachments/${a.id}`)} alt={a.caption ?? a.fileName} />
              ) : (
                <div style={{ height: 110, display: 'grid', placeItems: 'center' }} className="muted">
                  {a.fileName.split('.').pop()?.toUpperCase()}
                </div>
              )}
              <div className="cap">
                <a href={fileUrl(`/attachments/${a.id}`)} target="_blank" rel="noreferrer" className="bold">
                  {a.caption || a.fileName}
                </a>
                <div className="faint">
                  {a.kind.toLowerCase().replace('_', ' ')} · {(a.size / 1024).toFixed(0)} KB
                </div>
                {a.mimeType.startsWith('image/') && <Check label="In report" disabled={!editable} checked={a.includeInReport} onChange={(v) => patch.mutate({ id: a.id, includeInReport: v })} />}
                {editable && (
                  <Btn size="sm" kind="ghost" onClick={() => del.mutate(a.id)}>
                    Remove
                  </Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const can = useCan();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<null | 'submit' | 'approve' | 'return'>(null);
  const { data: t, isLoading, error, refetch } = useQuery({ queryKey: ['test', id], queryFn: () => api.get<Test>(`/tests/${id}`) });
  if (isLoading) return <Loading />;
  if (error || !t) return <ErrorBox error={error} />;

  const mine = t.analystId === me?.id;
  const editable = mine && can('test.enter') && EDITABLE.includes(t.status);
  const reviewable = t.status === 'SUBMITTED' && can('test.review') && !mine;
  const refresh = () => {
    void refetch();
    qc.invalidateQueries({ queryKey: ['history', 'RegistrationTest', id] });
  };
  const afterSign = async () => {
    refresh();
    qc.invalidateQueries({ queryKey: ['my-tests'] });
    qc.invalidateQueries({ queryKey: ['review-queue'] });
  };

  return (
    <>
      <PageHead
        title={
          <span className="row">
            {t.testName} <Status s={t.status} />
          </span>
        }
        sub={`${t.registration.number} · ${t.registration.sampleName} · ${t.section.name}`}
        crumbs={[{ href: mine ? '/analyst' : '/review', label: mine ? 'Analyst Workbench' : 'Review & Approval' }, { href: `/registrations/${t.registration.id}`, label: t.registration.number }]}
        actions={
          <>
            {editable && (
              <Btn kind="pri" onClick={() => setDialog('submit')}>
                Submit for review
              </Btn>
            )}
            {reviewable && (
              <>
                <Btn kind="danger" onClick={() => setDialog('return')}>
                  Return for correction
                </Btn>
                <Btn kind="pri" onClick={() => setDialog('approve')}>
                  Approve
                </Btn>
              </>
            )}
          </>
        }
      />
      {t.status === 'CORRECTION_REQUIRED' && t.reviewComments && (
        <div className="alert warn" style={{ marginBottom: 16 }}>
          <b>Correction required:</b> {t.reviewComments}
        </div>
      )}
      {t.status === 'SUBMITTED' && mine && <div className="alert info" style={{ marginBottom: 16 }}>Submitted for review — data entry is locked until the reviewer approves or returns it.</div>}
      {t.status === 'SUBMITTED' && can('test.review') && mine && <div className="alert info" style={{ marginBottom: 16 }}>You performed this test, so another reviewer must approve it.</div>}
      <div className="split">
        <div>
          <ObservationEditor key={`${t.status}-${t.submittedAt}-${t.reviewedAt}`} t={t} editable={editable} onSaved={refresh} />
          <UsagePanels t={t} editable={editable} refresh={refresh} />
          <Attachments t={t} editable={editable} refresh={refresh} />
        </div>
        <div>
          <Card title="Test & sample">
            <KV
              rows={[
                ['Method', t.method],
                ['Specification', t.specification ? `${t.specification} ${t.unit ?? ''}` : null],
                ['Report type', REPORT_TYPE_LABELS[t.reportType]],
                ['NABL scope', t.nablAccredited ? 'Yes' : 'No'],
                ['Analyst', t.analyst?.name],
                ['Started', fmtDateTime(t.startedAt)],
                ['Sample', t.registration.sampleName],
                ['Template', TEMPLATE_LABELS[t.registration.template]],
                ...Object.entries(t.registration.templateData ?? {}).map(([k, v]): [string, string] => [k, v]),
                ['Customer', t.registration.customer.name],
              ]}
            />
            <div className="mt">
              <Link href={`/registrations/${t.registration.id}`}>Open registration →</Link>
            </div>
          </Card>
          <Card title="Review trail" className="mt">
            {!t.reviewEvents.length ? (
              <div className="small muted">Not yet submitted.</div>
            ) : (
              <ul className="timeline">
                {t.reviewEvents.map((e) => (
                  <li key={e.id}>
                    <b>{e.action === 'SUBMIT' ? 'Submitted' : e.action === 'RETURN' ? 'Returned for correction' : 'Approved'}</b>
                    <div className="small muted">
                      {e.byName} · {fmtDateTime(e.at)}
                    </div>
                    {e.comments && <div className="small pre">“{e.comments}”</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="mt">
            <History entityType="RegistrationTest" entityId={id} title="Audit trail" />
          </div>
        </div>
      </div>

      {dialog === 'submit' && (
        <SignDialog title="Submit for review" meaning={`You confirm the observations, calculations and final result (${t.finalResult ?? 'not yet saved'} ${t.unit ?? ''}) for ${t.testName} are complete and correct. Save your latest changes first.`} confirmLabel="Submit & sign" onClose={() => setDialog(null)} onSign={async (password) => (await api.post(`/tests/${id}/submit`, { password }), await afterSign())} />
      )}
      {dialog === 'approve' && (
        <SignDialog title="Approve test data" meaning={`You have verified the observations, calculations, attachments, equipment/chemical details and final result (${t.finalResult} ${t.unit ?? ''}).`} commentLabel="Review comments (optional)" confirmLabel="Approve & sign" onClose={() => setDialog(null)} onSign={async (password, comments) => (await api.post(`/tests/${id}/review`, { decision: 'APPROVE', comments, password }), await afterSign())} />
      )}
      {dialog === 'return' && (
        <SignDialog title="Return for correction" meaning="The analyst will be notified and can correct and resubmit the data." commentLabel="Correction required" commentRequired confirmLabel="Return & sign" onClose={() => setDialog(null)} onSign={async (password, comments) => (await api.post(`/tests/${id}/review`, { decision: 'RETURN', comments, password }), await afterSign())} />
      )}
    </>
  );
}
