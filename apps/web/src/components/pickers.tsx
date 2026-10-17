'use client';

import { useState } from 'react';
import { useMaster, type Customer, type Section, type TestMaster } from '@/lib/hooks';
import { formatINR } from '@/lib/format';
import { useCan } from './providers';
import { Btn, Field, Select } from './ui';
import { CustomerForm } from './customer-form';

/** Customer + contact selection with inline "new customer". */
export function CustomerContactPicker({
  customerId,
  contactId,
  onChange,
  errors = {},
  disabled,
}: {
  customerId: string;
  contactId: string;
  onChange: (customerId: string, contactId: string, customer?: Customer) => void;
  errors?: { customerId?: string; contactId?: string };
  disabled?: boolean;
}) {
  const can = useCan();
  const { data: customers = [], refetch } = useMaster<Customer>('customers', { active: 'true' });
  const [creating, setCreating] = useState(false);
  const customer = customers.find((c) => c.id === customerId);
  return (
    <div className="grid g2">
      <Field label="Customer" required error={errors.customerId}>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <Select
            style={{ flex: 1 }}
            disabled={disabled}
            value={customerId}
            placeholder="Select customer…"
            options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
            onChange={(e) => {
              const c = customers.find((x) => x.id === e.target.value);
              onChange(e.target.value, c?.contacts.find((x) => x.isPrimary)?.id ?? c?.contacts[0]?.id ?? '', c);
            }}
          />
          {(can('enq.create') || can('masters.manage')) && !disabled && (
            <Btn onClick={() => setCreating(true)} title="New customer">
              + New
            </Btn>
          )}
        </div>
      </Field>
      <Field label="Contact person" error={errors.contactId} hint={customer?.gstin ? `GSTIN ${customer.gstin}` : customer ? 'No GSTIN on file' : undefined}>
        <Select
          disabled={disabled || !customer}
          value={contactId}
          placeholder="—"
          options={(customer?.contacts ?? []).map((c) => ({ value: c.id, label: `${c.name}${c.designation ? ` · ${c.designation}` : ''}` }))}
          onChange={(e) => onChange(customerId, e.target.value, customer)}
        />
      </Field>
      {creating && (
        <CustomerForm
          customer={null}
          onClose={() => setCreating(false)}
          onSaved={async (c) => {
            await refetch();
            onChange(c.id, c.contacts[0]?.id ?? '', c);
          }}
        />
      )}
    </div>
  );
}

/** Test master picker grouped by section. */
export function TestPicker({ onPick, exclude = [], label = 'Add test' }: { onPick: (t: TestMaster) => void; exclude?: string[]; label?: string }) {
  const { data: tests = [] } = useMaster<TestMaster>('tests', { active: 'true' });
  const { data: sections = [] } = useMaster<Section>('sections');
  const [v, setV] = useState('');
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <select value={v} onChange={(e) => setV(e.target.value)} style={{ minWidth: 280, flex: 1 }} aria-label={label}>
        <option value="">{label}…</option>
        {sections.map((s) => (
          <optgroup key={s.id} label={s.name}>
            {tests
              .filter((t) => t.sectionId === s.id && !exclude.includes(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.method} ({formatINR(t.rate)})
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <Btn
        disabled={!v}
        onClick={() => {
          const t = tests.find((x) => x.id === v);
          if (t) onPick(t);
          setV('');
        }}
      >
        Add
      </Btn>
    </div>
  );
}

export function useSectionName() {
  const { data: sections = [] } = useMaster<Section>('sections');
  return (id: string | null | undefined) => sections.find((s) => s.id === id)?.name ?? '—';
}
