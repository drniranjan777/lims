'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Btn, ErrorBox, Field } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/login', { email, password });
      qc.clear();
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form className="card login-card" onSubmit={submit}>
      <div className="bd grid">
        <div className="row" style={{ gap: 12 }}>
          <div className="brand-mark" aria-hidden>
            LL
          </div>
          <div>
            <h1>Lucid Labs LIMS</h1>
            <div className="small muted">Sign in to continue</div>
          </div>
        </div>
        <Field label="E-mail">
          <input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorBox error={error} />
        <Btn kind="pri" loading={busy} type="submit">
          Sign in
        </Btn>
        <p className="small faint" style={{ margin: 0 }}>
          Accounts are created by your LIMS administrator. Five failed attempts lock the account for 15 minutes.
        </p>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
