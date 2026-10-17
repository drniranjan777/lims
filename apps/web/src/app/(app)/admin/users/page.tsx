'use client';

import { useState } from 'react';
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, ROLES, type Role } from '@lims/shared';
import { api } from '@/lib/api';
import { useAction, useList, useMaster, type Section } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/format';
import { Btn, Card, Check, Empty, ErrorBox, Field, fieldErr, Input, Loading, Modal, PageHead, Pager, Search } from '@/components/ui';

interface User {
  id: string;
  name: string;
  email: string;
  designation: string | null;
  active: boolean;
  lastLoginAt: string | null;
  roles: Role[];
  sections: { id: string; name: string }[];
}

function UserForm({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { data: sections = [] } = useMaster<Section>('sections');
  const [f, setF] = useState({ name: user?.name ?? '', email: user?.email ?? '', designation: user?.designation ?? '', password: '', roles: user?.roles ?? ([] as Role[]), sectionIds: user?.sections.map((s) => s.id) ?? [], active: user?.active ?? true });
  const save = useAction(
    () => {
      const body: Record<string, unknown> = { ...f };
      if (user && !f.password) delete body.password;
      return user ? api.patch(`/users/${user.id}`, body) : api.post('/users', body);
    },
    { success: 'User saved', invalidate: [['/users']], onDone: onClose },
  );
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const scoped = f.roles.some((r) => r === 'SECTION_APPROVER' || r === 'ANALYST');
  return (
    <Modal
      wide
      title={user ? `Edit ${user.name}` : 'New user'}
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
        <div className="grid g3">
          <Field label="Full name" required error={fieldErr(save.error, 'name')}>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="E-mail (sign-in)" required error={fieldErr(save.error, 'email')}>
            <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Designation">
            <Input value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} />
          </Field>
        </div>
        <Field label={user ? 'Reset password (leave blank to keep)' : 'Initial password'} required={!user} error={fieldErr(save.error, 'password')} hint="Minimum 10 characters. Share it securely and ask the user to change it under Account.">
          <Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <div>
          <div className="small bold muted">Roles</div>
          {fieldErr(save.error, 'roles') && <div className="small" style={{ color: 'var(--bad)' }}>Select at least one role</div>}
          <div className="grid g3" style={{ gap: 6, marginTop: 6 }}>
            {ROLES.map((r) => (
              <Check key={r} label={ROLE_LABELS[r]} checked={f.roles.includes(r)} onChange={() => setF({ ...f, roles: toggle(f.roles, r) })} />
            ))}
          </div>
        </div>
        <div>
          <div className="small bold muted">Lab sections {scoped ? '(required for Section Approvers & Analysts)' : ''}</div>
          <div className="row" style={{ marginTop: 6 }}>
            {sections.map((s) => (
              <Check key={s.id} label={s.name} checked={f.sectionIds.includes(s.id)} onChange={() => setF({ ...f, sectionIds: toggle(f.sectionIds, s.id) })} />
            ))}
          </div>
        </div>
        {user && <Check label="Active (can sign in)" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />}
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const list = useList<User>('/users', { pageSize: 50 });
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [matrix, setMatrix] = useState(false);
  return (
    <>
      <PageHead
        title="Users & roles"
        sub="Role-based access per §3 and §9. Section Approvers and Analysts only see the sections assigned to them."
        actions={
          <>
            <Btn onClick={() => setMatrix((m) => !m)}>{matrix ? 'Hide' : 'Show'} permission matrix</Btn>
            <Btn kind="pri" onClick={() => setEditing('new')}>
              New user
            </Btn>
          </>
        }
      />
      {matrix && (
        <Card title="Role permission matrix" flush>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Permission</th>
                  {ROLES.map((r) => (
                    <th key={r} className="small" style={{ whiteSpace: 'normal' }}>
                      {ROLE_LABELS[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(PERMISSIONS).map(([p, label]) => (
                  <tr key={p}>
                    <td className="small">{label}</td>
                    {ROLES.map((r) => (
                      <td key={r} style={{ textAlign: 'center' }}>
                        {ROLE_PERMISSIONS[r].includes(p as keyof typeof PERMISSIONS) ? '✓' : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card title={<Search value={list.q} onChange={list.setQ} placeholder="Search name or e-mail" />} flush className="mt">
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty>No users.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>E-mail</th>
                  <th>Roles</th>
                  <th>Sections</th>
                  <th>Last sign-in</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.name}</b>
                      <div className="small muted">{u.designation}</div>
                    </td>
                    <td>{u.email}</td>
                    <td className="small">{u.roles.map((r) => ROLE_LABELS[r]).join(', ')}</td>
                    <td className="small">{u.sections.map((s) => s.name).join(', ') || '—'}</td>
                    <td className="small nowrap">{fmtDateTime(u.lastLoginAt)}</td>
                    <td>{u.active ? <span className="chip ok">Active</span> : <span className="chip">Inactive</span>}</td>
                    <td className="right">
                      <Btn size="sm" onClick={() => setEditing(u)}>
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
      </Card>
      {editing && <UserForm user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
