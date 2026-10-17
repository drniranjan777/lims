'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { RegistrationForm, type RegTestDraft } from '@/components/registration-form';
import { Card, ErrorBox, KV, Loading, PageHead } from '@/components/ui';

interface Prefill {
  receipt: {
    id: string;
    number: string;
    receivedAt: string;
    condition: string | null;
    numberOfSamples: number;
    quotation: { number: string; customer: { name: string }; items: { id: string }[] };
    purchaseOrder: { poNumber: string } | null;
    registrations: { number: string; sampleName: string }[];
  };
  tests: (RegTestDraft & { sampleDescription: string | null })[];
}

export default function NewRegistrationPage() {
  const router = useRouter();
  const receiptId = useSearchParams().get('receiptId');
  const { data, isLoading, error } = useQuery({ queryKey: ['prefill', receiptId], queryFn: () => api.get<Prefill>(`/registrations/prefill/${receiptId}`), enabled: Boolean(receiptId) });
  if (!receiptId) return <ErrorBox error={new Error('Open pre-registration from a sample receipt (PO & Sample Receipt screen).')} />;
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const r = data.receipt;
  return (
    <>
      <PageHead title="Pre-registration" sub="Create the registration against the quotation/PO. A Registration Reviewer verifies it and registers the sample to the lab section(s)." crumbs={[{ href: '/samples', label: 'PO & Sample Receipt' }]} />
      <Card title={`Receipt ${r.number}`}>
        <div className="grid g2">
          <KV rows={[['Customer', r.quotation.customer.name], ['Quotation', r.quotation.number], ['PO', r.purchaseOrder?.poNumber]]} />
          <KV rows={[['Received', fmtDateTime(r.receivedAt)], ['Samples', `${r.registrations.length} of ${r.numberOfSamples} registered`], ['Already registered', r.registrations.map((x) => `${x.number} (${x.sampleName})`).join(', ')]]} />
        </div>
      </Card>
      <div className="mt">
        <RegistrationForm
          receiptId={r.id}
          quotationItems={r.quotation.items.map((i) => i.id)}
          initial={{
            template: 'GEN',
            sampleName: data.tests[0]?.sampleDescription ?? '',
            sampleDescription: '',
            quantity: '',
            condition: r.condition ?? '',
            templateData: {},
            remarks: '',
            tests: data.tests.map(({ sampleDescription: _s, ...t }) => ({ ...t, specification: t.specification ?? '', unit: t.unit ?? '' })),
          }}
          onSaved={(x) => router.push(`/registrations/${x.id}`)}
          onCancel={() => router.back()}
        />
      </div>
    </>
  );
}
