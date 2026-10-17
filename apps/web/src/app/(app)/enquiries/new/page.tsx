'use client';

import { useRouter } from 'next/navigation';
import { EnquiryForm, emptyEnquiry } from '@/components/enquiry-form';
import { PageHead } from '@/components/ui';

export default function NewEnquiryPage() {
  const router = useRouter();
  return (
    <>
      <PageHead title="New enquiry" crumbs={[{ href: '/enquiries', label: 'CRM Enquiries' }]} />
      <EnquiryForm initial={emptyEnquiry()} onSaved={(r) => router.push(`/enquiries/${r.id}`)} onCancel={() => router.back()} />
    </>
  );
}
