'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useMe } from '@/components/providers';
import { Btn, Card, ErrorBox, Field, fieldErr, KV, PageHead } from '@/components/ui';

export default function AccountPage() {
  const { data: me } = useMe();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const save = useAction(() => api.post('/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword }), { success: 'Password changed', onDone: () => setF({ currentPassword: '', newPassword: '', confirm: '' }) });
  const mismatch = f.confirm && f.confirm !== f.newPassword;
  return (
    <>
      <PageHead title="My account" />
      <div className="grid g2">
        <Card title="Profile">
          {me && (
            <KV
              rows={[
                ['Name', me.name],
                ['E-mail', me.email],
                ['Designation', me.designation],
                ['Roles', me.roleLabels.join(', ')],
                ['Sections', me.sections.map((s) => s.name).join(', ')],
              ]}
            />
          )}
        </Card>
        <Card
          title="Change password"
          footer={
            <Btn kind="pri" disabled={!f.currentPassword || !f.newPassword || Boolean(mismatch)} loading={save.isPending} onClick={() => save.mutate()}>
              Change password
            </Btn>
          }
        >
          <div className="grid">
            <Field label="Current password">
              <input type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} />
            </Field>
            <Field label="New password" hint="At least 10 characters. Other sessions are signed out." error={fieldErr(save.error, 'newPassword')}>
              <input type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />
            </Field>
            <Field label="Confirm new password" error={mismatch ? 'Passwords do not match' : undefined}>
              <input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
            </Field>
            <ErrorBox error={save.error} />
          </div>
        </Card>
      </div>
    </>
  );
}
