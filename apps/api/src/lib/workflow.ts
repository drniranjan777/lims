import type { Tx } from './prisma';
import { notifyRoles } from './notify';

/**
 * Recompute section and registration completion after a test is approved (§4.10).
 * - a section is COMPLETED when all of its tests on the registration are APPROVED
 * - a registration is TESTING_COMPLETE when every section is COMPLETED
 * Sends "ready for release" and "combined report awaiting other sections" notifications (§7).
 */
export async function refreshCompletion(tx: Tx, registrationId: string, sectionId: string) {
  const reg = await tx.registration.findUniqueOrThrow({
    where: { id: registrationId },
    include: { tests: { select: { sectionId: true, status: true } }, sections: true },
  });
  const sectionTests = reg.tests.filter((t) => t.sectionId === sectionId);
  const sectionDone = sectionTests.length > 0 && sectionTests.every((t) => t.status === 'APPROVED');
  if (sectionDone) {
    await tx.registrationSection.update({
      where: { registrationId_sectionId: { registrationId, sectionId } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }
  const allDone = reg.tests.length > 0 && reg.tests.every((t) => t.status === 'APPROVED');
  if (allDone && reg.status !== 'REPORTED') {
    await tx.registration.update({ where: { id: registrationId }, data: { status: 'TESTING_COMPLETE' } });
  }
  if (!sectionDone) return { sectionDone, allDone };

  const section = await tx.section.findUnique({ where: { id: sectionId }, select: { name: true } });
  const multiSection = reg.sections.length > 1;
  if (allDone) {
    await notifyRoles(tx, ['SECTION_APPROVER'], { type: 'REPORT_READY', title: `${reg.number} — all results approved, report ready for release`, body: reg.sampleName, link: `/reports?registration=${registrationId}` }, sectionId);
    await notifyRoles(tx, ['SIGNATORY'], { type: 'REPORT_READY', title: `${reg.number} — report ready for release`, body: reg.sampleName, link: `/reports?registration=${registrationId}` });
  } else if (multiSection) {
    const pending = reg.sections.filter((s) => s.sectionId !== sectionId && s.status !== 'COMPLETED').map((s) => s.sectionId);
    const names = await tx.section.findMany({ where: { id: { in: pending } }, select: { name: true } });
    await notifyRoles(tx, ['SECTION_APPROVER', 'CRM'], {
      type: 'COMBINED_PENDING',
      title: `${reg.number} — ${section?.name} complete; combined report awaiting ${names.map((n) => n.name).join(', ')}`,
      link: `/registrations/${registrationId}`,
    });
    await notifyRoles(tx, ['SECTION_APPROVER'], { type: 'REPORT_READY', title: `${reg.number} — ${section?.name} results approved; section report can be released`, link: `/reports?registration=${registrationId}` }, sectionId);
  }
  return { sectionDone, allDone };
}
