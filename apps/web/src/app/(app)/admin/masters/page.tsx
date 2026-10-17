'use client';

import { useState } from 'react';
import { formulaVariables, REPORT_TYPE_LABELS, REPORT_TYPES } from '@lims/shared';
import { api } from '@/lib/api';
import { useAction, useList, useMaster, type Section } from '@/lib/hooks';
import { fmtDate, formatINR, isoDate } from '@/lib/format';
import { Btn, Card, Check, Empty, ErrorBox, Field, fieldErr, Input, Loading, Modal, PageHead, Pager, Search, Select, Textarea } from '@/components/ui';

type Kind = 'sections' | 'tests' | 'formulas' | 'equipment' | 'chemicals';
type Row = Record<string, unknown> & { id: string; active: boolean };
type FieldDef = { key: string; label: string; type?: 'text' | 'number' | 'date' | 'bool' | 'textarea' | 'section' | 'formula' | 'reportType' | 'chemKind' | 'vars'; required?: boolean; hint?: string };

const DEFS: Record<Kind, { label: string; fields: FieldDef[]; columns: { key: string; label: string; render?: (r: Row) => React.ReactNode }[] }> = {
  sections: {
    label: 'Lab sections',
    fields: [{ key: 'code', label: 'Code', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'active', label: 'Active', type: 'bool' }],
    columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }],
  },
  tests: {
    label: 'Tests & methods',
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Test name', required: true },
      { key: 'sectionId', label: 'Section', type: 'section', required: true },
      { key: 'method', label: 'Method', required: true },
      { key: 'specification', label: 'Default specification', hint: 'e.g. 98.0 – 102.0, NMT 0.5, Min 410' },
      { key: 'unit', label: 'Unit' },
      { key: 'rate', label: 'Rate (₹)', type: 'number', required: true },
      { key: 'reportType', label: 'Report type', type: 'reportType' },
      { key: 'replicates', label: 'Replicates (1–5)', type: 'number' },
      { key: 'decimals', label: 'Result decimals', type: 'number' },
      { key: 'formulaId', label: 'Calculation formula', type: 'formula' },
      { key: 'nablAccredited', label: 'Within NABL scope', type: 'bool' },
      { key: 'active', label: 'Active', type: 'bool' },
    ],
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Test' },
      { key: 'method', label: 'Method' },
      { key: 'section', label: 'Section', render: (r) => (r.section as { name: string } | undefined)?.name },
      { key: 'rate', label: 'Rate', render: (r) => formatINR(r.rate as number) },
      { key: 'nablAccredited', label: 'NABL', render: (r) => (r.nablAccredited ? 'Yes' : 'No') },
    ],
  },
  formulas: {
    label: 'Formulas',
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Name', required: true },
      { key: 'expression', label: 'Expression', required: true, hint: 'Operators + − * / ^ ( ); functions avg, sum, min, max, abs, sqrt, round, ln, log10, exp' },
      { key: 'displayExpression', label: 'Display form', hint: 'Shown to analysts, e.g. LOD (%) = (W₁ − W₂) ÷ (W₁ − W₀) × 100' },
      { key: 'variables', label: 'Variables', type: 'vars' },
      { key: 'resultUnit', label: 'Result unit' },
      { key: 'active', label: 'Active', type: 'bool' },
    ],
    columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'expression', label: 'Expression', render: (r) => <code>{String(r.expression)}</code> }],
  },
  equipment: {
    label: 'Equipment',
    fields: [
      { key: 'code', label: 'Equipment ID', required: true },
      { key: 'name', label: 'Name', required: true },
      { key: 'make', label: 'Make / model' },
      { key: 'sectionId', label: 'Section', type: 'section' },
      { key: 'calibrationDue', label: 'Calibration due', type: 'date', hint: 'Equipment past this date cannot be used in tests' },
      { key: 'active', label: 'Active', type: 'bool' },
    ],
    columns: [
      { key: 'code', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'section', label: 'Section', render: (r) => (r.section as { name: string } | null)?.name ?? '—' },
      { key: 'calibrationDue', label: 'Calibration due', render: (r) => <span style={r.calibrationDue && isoDate(r.calibrationDue as string) < isoDate() ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{fmtDate(r.calibrationDue as string)}</span> },
    ],
  },
  chemicals: {
    label: 'Chemicals & standards',
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Name', required: true },
      { key: 'kind', label: 'Type', type: 'chemKind' },
      { key: 'lotNumber', label: 'Lot / batch' },
      { key: 'potency', label: 'Potency (%)', type: 'number' },
      { key: 'expiryDate', label: 'Expiry date', type: 'date', hint: 'Expired lots cannot be used in tests' },
      { key: 'active', label: 'Active', type: 'bool' },
    ],
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'kind', label: 'Type', render: (r) => String(r.kind).replace(/_/g, ' ').toLowerCase() },
      { key: 'lotNumber', label: 'Lot' },
      { key: 'expiryDate', label: 'Expiry', render: (r) => fmtDate(r.expiryDate as string) },
    ],
  },
};

const DEFAULTS: Record<Kind, Record<string, unknown>> = {
  sections: { active: true },
  tests: { active: true, reportType: 'FINAL_RESULT', replicates: 1, decimals: 2, nablAccredited: false, rate: 0 },
  formulas: { active: true, variables: [{ key: '', label: '', unit: '' }] },
  equipment: { active: true },
  chemicals: { active: true, kind: 'CHEMICAL' },
};

function Editor({ kind, row, onClose }: { kind: Kind; row: Row | null; onClose: () => void }) {
  const def = DEFS[kind];
  const { data: sections = [] } = useMaster<Section>('sections');
  const { data: formulas = [] } = useMaster<{ id: string; name: string }>('formulas');
  const [f, setF] = useState<Record<string, unknown>>(() => {
    const base = { ...DEFAULTS[kind], ...(row ?? {}) };
    for (const fd of def.fields) if (fd.type === 'date' && base[fd.key]) base[fd.key] = isoDate(base[fd.key] as string);
    return base;
  });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const payload = () => {
    const out: Record<string, unknown> = {};
    for (const fd of def.fields) {
      let v = f[fd.key];
      if (fd.type === 'number') v = v === '' || v === undefined || v === null ? null : Number(v);
      if ((fd.type === 'date' || fd.type === 'formula' || fd.type === 'section') && !v) v = null;
      if (fd.type === 'vars') v = (v as { key: string }[]).filter((x) => x.key);
      out[fd.key] = v;
    }
    return out;
  };
  const save = useAction(() => (row ? api.put(`/masters/${kind}/${row.id}`, payload()) : api.post(`/masters/${kind}`, payload())), { success: 'Saved', invalidate: [[`/masters/${kind}`], ['master', kind]], onDone: onClose });
  let varHint = '';
  if (kind === 'formulas' && f.expression) {
    try {
      varHint = `Uses: ${formulaVariables(String(f.expression)).join(', ')}`;
    } catch (e) {
      varHint = `⚠ ${(e as Error).message}`;
    }
  }

  return (
    <Modal
      wide
      title={`${row ? 'Edit' : 'New'} — ${def.label}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="pri" loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Btn>
        </>
      }
    >
      <div className="grid g2">
        {def.fields.map((fd) => {
          const err = fieldErr(save.error, fd.key);
          const v = f[fd.key];
          if (fd.type === 'bool') return <div key={fd.key} style={{ paddingTop: 20 }}><Check label={fd.label} checked={Boolean(v)} onChange={(x) => set(fd.key, x)} /></div>;
          if (fd.type === 'vars') {
            const vars = (v as { key: string; label: string; unit?: string }[]) ?? [];
            return (
              <div key={fd.key} style={{ gridColumn: '1 / -1' }}>
                <div className="between">
                  <span className="small bold muted">Variables (one input per variable, per replicate)</span>
                  <Btn size="sm" onClick={() => set(fd.key, [...vars, { key: '', label: '', unit: '' }])}>
                    + Variable
                  </Btn>
                </div>
                {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}
                <table className="t">
                  <thead>
                    <tr>
                      <th>Key (used in expression)</th>
                      <th>Label</th>
                      <th>Unit</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {vars.map((x, i) => (
                      <tr key={i}>
                        {(['key', 'label', 'unit'] as const).map((k) => (
                          <td key={k}>
                            <Input value={x[k] ?? ''} onChange={(e) => set(fd.key, vars.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)))} aria-label={k} />
                          </td>
                        ))}
                        <td>
                          <Btn size="sm" kind="ghost" onClick={() => set(fd.key, vars.filter((_, j) => j !== i))} aria-label="Remove">
                            ✕
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          let input: React.ReactNode;
          if (fd.type === 'section') input = <Select value={String(v ?? '')} onChange={(e) => set(fd.key, e.target.value)} placeholder="—" options={sections.map((s) => ({ value: s.id, label: s.name }))} />;
          else if (fd.type === 'formula') input = <Select value={String(v ?? '')} onChange={(e) => set(fd.key, e.target.value)} placeholder="None (direct entry)" options={formulas.map((s) => ({ value: s.id, label: s.name }))} />;
          else if (fd.type === 'reportType') input = <Select value={String(v ?? '')} onChange={(e) => set(fd.key, e.target.value)} options={REPORT_TYPES.map((r) => ({ value: r, label: REPORT_TYPE_LABELS[r] }))} />;
          else if (fd.type === 'chemKind') input = <Select value={String(v ?? '')} onChange={(e) => set(fd.key, e.target.value)} options={['CHEMICAL', 'STANDARD', 'REFERENCE_STANDARD', 'MEDIA', 'REAGENT'].map((k) => ({ value: k, label: k.replace(/_/g, ' ').toLowerCase() }))} />;
          else if (fd.type === 'textarea') input = <Textarea value={String(v ?? '')} onChange={(e) => set(fd.key, e.target.value)} />;
          else input = <Input type={fd.type === 'number' ? 'number' : fd.type === 'date' ? 'date' : 'text'} step="any" value={v === null || v === undefined ? '' : String(v)} onChange={(e) => set(fd.key, e.target.value)} />;
          return (
            <Field key={fd.key} label={fd.label} required={fd.required} error={err} hint={fd.key === 'expression' && varHint ? varHint : fd.hint}>
              {input}
            </Field>
          );
        })}
      </div>
      <div className="mt">
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  );
}

function MasterTable({ kind }: { kind: Kind }) {
  const def = DEFS[kind];
  const list = useList<Row>(`/masters/${kind}`, { pageSize: 50 });
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  return (
    <Card title={<Search value={list.q} onChange={list.setQ} />} actions={<Btn kind="pri" onClick={() => setEditing('new')}>New</Btn>} flush>
      {list.isLoading ? (
        <Loading />
      ) : !list.data?.items.length ? (
        <Empty>No records.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                {def.columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((r) => (
                <tr key={r.id}>
                  {def.columns.map((c) => (
                    <td key={c.key}>{c.render ? c.render(r) : String(r[c.key] ?? '—')}</td>
                  ))}
                  <td>{r.active ? <span className="chip ok">Active</span> : <span className="chip">Inactive</span>}</td>
                  <td className="right">
                    <Btn size="sm" onClick={() => setEditing(r)}>
                      Edit
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.data && <Pager page={list.page} pages={list.data.pages} total={list.data.total} onPage={list.setPage} />}
      {editing && <Editor kind={kind} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

export default function MastersPage() {
  const [kind, setKind] = useState<Kind>('tests');
  return (
    <>
      <PageHead title="Master data" sub="Sections, tests & methods, formulas, equipment and chemicals/standards. Changes are recorded in the audit trail; formulas are frozen onto a test at registration." />
      <div className="tabs" role="tablist">
        {(Object.keys(DEFS) as Kind[]).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {DEFS[k].label}
          </button>
        ))}
      </div>
      <MasterTable key={kind} kind={kind} />
    </>
  );
}
