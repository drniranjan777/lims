'use client';

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { api, qs, type Paged } from './api';
import { useToast } from '@/components/providers';

/** Paged, searchable list with status filter. */
export function useList<T>(path: string, initial: { q?: string; status?: string; pageSize?: number; extra?: Record<string, string | undefined> } = {}) {
  const [q, setQ] = useState(initial.q ?? '');
  const [status, setStatus] = useState(initial.status ?? '');
  const [page, setPage] = useState(1);
  // A new ?q= (e.g. from the top-bar search while already on the page) replaces the current search.
  useEffect(() => {
    if (initial.q !== undefined) (setQ(initial.q), setPage(1));
  }, [initial.q]);
  const params = { q, status, page, pageSize: initial.pageSize ?? 25, ...initial.extra };
  const query = useQuery({ queryKey: [path, params], queryFn: () => api.get<Paged<T>>(`${path}${qs(params)}`), placeholderData: (prev) => prev });
  return {
    ...query,
    q,
    setQ: useCallback((v: string) => (setQ(v), setPage(1)), []),
    status,
    setStatus: useCallback((v: string) => (setStatus(v), setPage(1)), []),
    page,
    setPage,
  };
}

/** Full (unpaged) master list for selection inputs. */
export function useMaster<T = Record<string, unknown>>(kind: 'sections' | 'tests' | 'formulas' | 'equipment' | 'chemicals' | 'customers', extra: Record<string, string> = {}) {
  return useQuery({
    queryKey: ['master', kind, extra],
    queryFn: () => api.get<Paged<T>>(`/masters/${kind}${qs({ all: true, ...extra })}`).then((r) => r.items),
    staleTime: 60_000,
  });
}

/** Mutation that toasts success/failure and invalidates the given query keys. */
export function useAction<TArgs = void, TRes = unknown>(fn: (a: TArgs) => Promise<TRes>, opts: { success?: string; invalidate?: QueryKey[]; onDone?: (r: TRes) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts.success) toast(opts.success);
      for (const k of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: k });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['history'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      opts.onDone?.(r);
    },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
}

export interface Section {
  id: string;
  code: string;
  name: string;
  active: boolean;
}
export interface TestMaster {
  id: string;
  code: string;
  name: string;
  sectionId: string;
  method: string;
  specification: string | null;
  unit: string | null;
  rate: number;
  nablAccredited: boolean;
  reportType: string;
  replicates: number;
  decimals: number;
  formulaId: string | null;
  active: boolean;
  section?: { id: string; name: string };
}
export interface Contact {
  id: string;
  name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}
export interface Customer {
  id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  contacts: Contact[];
}
