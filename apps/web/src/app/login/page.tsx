'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChartColumn, Eye, EyeOff, FileText, FlaskConical, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Btn, ErrorBox } from '@/components/ui';

const FEATURES = [
  { icon: FlaskConical, label: 'Sample management' },
  { icon: FileText, label: 'Test processing' },
  { icon: ChartColumn, label: 'Results & reporting' },
  { icon: ShieldCheck, label: 'Secure & compliant' },
];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showReset, setShowReset] = useState(false);
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
    <form className="login-card" onSubmit={submit}>
      <h1 className="login-logo">
        <img className="logo-light" src="/logo.png" alt="NLIMS — Lab Management System" width={640} height={152} />
        <img className="logo-dark" src="/logo-on-dark.png" alt="" aria-hidden width={640} height={152} />
      </h1>
      <div className="login-field">
        <label htmlFor="login-email">E-mail</label>
        <div className="input-icon">
          <Mail size={19} aria-hidden />
          <input id="login-email" type="email" autoComplete="username" required autoFocus placeholder="Enter your e-mail address" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="login-field">
        <label htmlFor="login-password">Password</label>
        <div className="input-icon">
          <LockKeyhole size={19} aria-hidden />
          <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="reveal" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
            {showPassword ? <EyeOff size={19} aria-hidden /> : <Eye size={19} aria-hidden />}
          </button>
        </div>
        <button type="button" className="forgot" onClick={() => setShowReset((v) => !v)} aria-expanded={showReset}>
          Forgot password?
        </button>
        {showReset && (
          <div className="alert info small" role="status">
            Passwords are reset by your LIMS administrator (Users &amp; Roles). Ask them for a new password, then change it under Account.
          </div>
        )}
      </div>
      <ErrorBox error={error} />
      <Btn kind="pri" className="btn pri login-submit" loading={busy} type="submit">
        Sign in <ArrowRight size={20} aria-hidden />
      </Btn>
      <p className="login-note">
        <LockKeyhole size={18} aria-hidden />
        <span>Accounts are created by your LIMS administrator. Five failed attempts lock the account for 15 minutes.</span>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <section className="login-hero" aria-label="About NLIMS">
        <svg className="hero-art" viewBox="0 0 400 520" aria-hidden>
          {/* microscope */}
          <path d="M150 60l40-22 70 120-40 22z M175 112l-35 20 M205 165l-40 23 M230 182v38 M196 238h120a20 20 0 0 1 0 40H196 M300 278v60 M150 400h220 M250 338h100v62H250z M120 300a110 110 0 0 0 130 100" />
          <circle cx="230" cy="232" r="10" />
          {/* test tubes */}
          <path d="M60 330v130a18 18 0 0 0 36 0V330 M54 330h48 M60 410h36 M120 360v100a16 16 0 0 0 32 0V360 M114 360h44 M120 420h32" />
        </svg>
        <div className="hero-body">
          <img className="hero-logo" src="/logo-on-dark.png" alt="NLIMS — Lab Management System" width={640} height={152} />
          <h2>
            Precision in
            <br />
            every <span>sample.</span>
          </h2>
          <p>Laboratory workflows, results and reporting in one secure workspace.</p>
          <i className="hero-rule" aria-hidden />
        </div>
        <ul className="hero-features">
          {FEATURES.map((f) => (
            <li key={f.label}>
              <f.icon size={30} strokeWidth={1.5} aria-hidden />
              <span>{f.label}</span>
            </li>
          ))}
        </ul>
      </section>
      <main className="login-side">
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
