'use client';

import { useState } from 'react';
import { stateCodeFromGstin } from '@lims/shared';
import { api } from '@/lib/api';
import { useAction, type Contact, type Customer } from '@/lib/hooks';
import { Btn, Check, ErrorBox, Field, fieldErr, Input, Modal, Textarea } from './ui';

type ContactDraft = Omit<Contact, 'id'> & { id?: string };

export function CustomerForm({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved?: (c: Customer) => void }) {
  const [f, setF] = useState({
    name: customer?.name ?? '',
    address: customer?.address ?? '',
    city: customer?.city ?? '',
    state: customer?.state ?? '',
    stateCode: customer?.stateCode ?? '',
    pincode: customer?.pincode ?? '',
    gstin: customer?.gstin ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    active: customer?.active ?? true,
  });
  const [contacts, setContacts] = useState<ContactDraft[]>(customer?.contacts.length ? customer.contacts : [{ name: '', designation: '', email: '', phone: '', isPrimary: true }]);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const setC = (i: number, k: keyof ContactDraft, v: string | boolean) => setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: v } : k === 'isPrimary' && v ? { ...c, isPrimary: false } : c)));

  const save = useAction(
    () => {
      const payload = { ...f, contacts: contacts.filter((c) => c.name.trim()) };
      return customer ? api.put<Customer>(`/masters/customers/${customer.id}`, payload) : api.post<Customer>('/masters/customers', payload);
    },
    { success: customer ? 'Customer updated' : 'Customer created', invalidate: [['/masters/customers'], ['master', 'customers']], onDone: (c) => (onSaved?.(c), onClose()) },
  );
  const err = (k: string) => fieldErr(save.error, k);

  return (
    <Modal
      wide
      title={customer ? `Edit ${customer.name}` : 'New customer'}
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
      <div className="grid">
        <div className="grid g2">
          <Field label="Customer name" required error={err('name')}>
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="GSTIN" error={err('gstin')} hint="State code is taken from the GSTIN for CGST/SGST vs IGST">
            <Input
              value={f.gstin}
              onChange={(e) => {
                const v = e.target.value.toUpperCase();
                set('gstin', v);
                const sc = stateCodeFromGstin(v);
                if (sc) set('stateCode', sc);
              }}
            />
          </Field>
        </div>
        <Field label="Address" error={err('address')}>
          <Textarea value={f.address} onChange={(e) => set('address', e.target.value)} rows={2} />
        </Field>
        <div className="grid g4">
          <Field label="City">
            <Input value={f.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="State">
            <Input value={f.state} onChange={(e) => set('state', e.target.value)} />
          </Field>
          <Field label="State code" error={err('stateCode')} hint="e.g. 27 = Maharashtra">
            <Input value={f.stateCode} maxLength={2} onChange={(e) => set('stateCode', e.target.value)} />
          </Field>
          <Field label="PIN code">
            <Input value={f.pincode} onChange={(e) => set('pincode', e.target.value)} />
          </Field>
        </div>
        <div className="grid g2">
          <Field label="E-mail" error={err('email')}>
            <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>
        <div className="between">
          <h3>Contact persons</h3>
          <Btn size="sm" onClick={() => setContacts((c) => [...c, { name: '', designation: '', email: '', phone: '', isPrimary: c.length === 0 }])}>
            + Add contact
          </Btn>
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Name</th>
                <th>Designation</th>
                <th>E-mail</th>
                <th>Phone</th>
                <th>Primary</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => (
                <tr key={c.id ?? i}>
                  <td>
                    <Input value={c.name} onChange={(e) => setC(i, 'name', e.target.value)} aria-label="Contact name" />
                  </td>
                  <td>
                    <Input value={c.designation ?? ''} onChange={(e) => setC(i, 'designation', e.target.value)} aria-label="Designation" />
                  </td>
                  <td>
                    <Input type="email" value={c.email ?? ''} onChange={(e) => setC(i, 'email', e.target.value)} aria-label="Contact e-mail" />
                    {err(`contacts.${i}.email`) && <div className="small" style={{ color: 'var(--bad)' }}>{err(`contacts.${i}.email`)}</div>}
                  </td>
                  <td>
                    <Input value={c.phone ?? ''} onChange={(e) => setC(i, 'phone', e.target.value)} aria-label="Contact phone" />
                  </td>
                  <td>
                    <input type="radio" name="primary" checked={c.isPrimary} onChange={() => setC(i, 'isPrimary', true)} aria-label="Primary contact" />
                  </td>
                  <td>
                    <Btn size="sm" kind="ghost" onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))} aria-label="Remove contact">
                      ✕
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {customer && <Check label="Active" checked={f.active} onChange={(v) => set('active', v)} />}
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  );
}
