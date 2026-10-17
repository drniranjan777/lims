import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';

// Every screen is per-user and data-driven — render on request, never prerender.
export const dynamic = 'force-dynamic';

export default function AppLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
