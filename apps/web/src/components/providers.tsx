'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { hasPermission, type Permission, type Role } from '@lims/shared';
import { api, ApiError } from '@/lib/api';
import { registerServiceWorker } from '@/lib/pwa';

export interface Me {
  id: string;
  name: string;
  email: string;
  designation: string | null;
  roles: Role[];
  roleLabels: string[];
  permissions: Permission[];
  sectionIds: string[];
  sections: { id: string; code: string; name: string }[];
}

// ---------------------------------------------------------------- toasts

interface Toast {
  id: number;
  text: string;
  tone?: 'bad';
}
const ToastCtx = createContext<(text: string, tone?: 'bad') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone?: 'bad') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone ?? ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- providers

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2, refetchOnWindowFocus: true },
        },
      }),
  );
  useEffect(registerServiceWorker, []);
  return (
    <QueryClientProvider client={client}>
      <ToastHost>{children}</ToastHost>
    </QueryClientProvider>
  );
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me'), staleTime: 60_000 });
}

/** Permission check for UI affordances. The API enforces the same rules server-side. */
export function useCan() {
  const { data } = useMe();
  return (p: Permission) => (data ? hasPermission(data.roles, p) : false);
}
