'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { emptyQuotation, QuotationForm, useLabSettings, type QuotationDraft } from '@/components/quotation-form';
import { Loading, PageHead } from '@/components/ui';

interface EnquiryPrefill {
  id: string;
  number: string;
  customerId: string;
  contactId: string | null;
  testDetails: { id: string; name: string; method: string; specification: string | null; unit: string | null; sectionId: string; rate: number }[];
}

export default function NewQuotationPage() {
  const router = useRouter();
  const enquiryId = useSearchParams().get('enquiryId');
  const { data: lab, isLoading: labLoading } = useLabSettings();
  const { data: enq, isLoading } = useQuery({ queryKey: ['enquiry', enquiryId], queryFn: () => api.get<EnquiryPrefill>(`/enquiries/${enquiryId}`), enabled: Boolean(enquiryId) });
  if (labLoading || (enquiryId && isLoading)) return <Loading />;

  const initial: QuotationDraft = { ...emptyQuotation(lab?.quotationTerms ?? '') };
  if (enq) {
    initial.enquiryId = enq.id;
    initial.customerId = enq.customerId;
    initial.contactId = enq.contactId ?? '';
    initial.items = enq.testDetails.map((t) => ({ testId: t.id, sampleDescription: '', testName: t.name, method: t.method, specification: t.specification ?? '', unit: t.unit ?? '', sectionId: t.sectionId, qty: 1, rate: Number(t.rate) }));
  }
  return (
    <>
      <PageHead title="New quotation" sub={enq ? `Prepared against enquiry ${enq.number}. Tests are copied from the enquiry — confirm methods and pricing.` : 'Coordinate tests, methods and specifications with the Lab HOD before submitting for review.'} crumbs={[{ href: '/quotations', label: 'Quotations' }]} />
      <QuotationForm initial={initial} onSaved={(r) => router.push(`/quotations/${r.id}`)} onCancel={() => router.back()} />
    </>
  );
}
