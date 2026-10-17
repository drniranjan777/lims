/**
 * End-to-end LIMS workflow through the browser UI, one sample tested in two sections:
 * enquiry → quotation (submit, HOD review, signatory e-sign, send) → PO → sample receipt
 * → pre-registration (Pharma) → verify & register → section receive/allocate → analyst data
 * (LOD formula) + submit → review with return-for-correction, then approve → combined report
 * preview/release → invoice authorize/issue → dispatch (combined verification) → stores retention.
 */
import { expect, test, type Page } from '@playwright/test';
import { docNumber, expectStatus, expectToast, heading, selectContaining, sign, signIn, Users } from './helpers';

test.describe.configure({ mode: 'serial' });

test('role-based navigation: an analyst sees only Dashboard and Analyst Workbench', async ({ page }) => {
  await signIn(page, 'anchem@e2e.local');
  await expect(page.locator('aside .nav-link')).toHaveText(['Dashboard', 'Analyst Workbench']);
  await page.getByRole('link', { name: 'Analyst Workbench' }).click();
  await expect(heading(page)).toHaveText('Analyst Workbench');
});

test('role-based navigation: CRM sees the commercial screens but not administration', async ({ page }) => {
  await signIn(page, 'crm@e2e.local');
  const nav = page.locator('aside .nav-link');
  await expect(nav).toContainText(['Dashboard', 'Customers', 'CRM Enquiries', 'Quotations', 'PO & Sample Receipt', 'Registration', 'Reports', 'Dispatch']);
  await expect(nav.filter({ hasText: 'Analyst Workbench' })).toHaveCount(0);
  await expect(nav.filter({ hasText: 'Users & Roles' })).toHaveCount(0);
});

test('full workflow from enquiry to sample retention', async ({ browser }) => {
  const users = new Users(browser);
  let quotationUrl = '';
  let regUrl = '';
  let regNumber = '';
  let reportNumber = '';
  let invoiceNumber = '';

  await test.step('CRM records an enquiry with two tests', async () => {
    const crm = await users.as('crm');
    await crm.goto('/enquiries/new');
    await selectContaining(crm.locator('label.field', { hasText: 'Customer' }).locator('select'), 'Sunrise Pharma');
    await crm.getByLabel('Query reference').fill('Q-E2E-1');
    const picker = crm.getByLabel('Add test');
    for (const t of ['Loss on Drying', 'Brinell Hardness']) {
      await selectContaining(picker, t);
      await crm.getByRole('button', { name: 'Add', exact: true }).click();
    }
    await crm.getByRole('button', { name: 'Save enquiry' }).click();
    await expect(crm).toHaveURL(/\/enquiries\/[^/]+$/);
    expect(await docNumber(crm)).toMatch(/^ENQ\//);
    await expectStatus(crm, 'New');
  });

  await test.step('CRM prepares the quotation and submits it for review', async () => {
    const crm = await users.as('crm');
    await crm.getByRole('link', { name: 'Prepare quotation' }).click();
    await expect(crm.getByLabel('Test name')).toHaveCount(2);
    await crm.getByRole('button', { name: 'Save draft' }).click();
    await expect(crm).toHaveURL(/\/quotations\/(?!new)[^/]+$/);
    quotationUrl = new URL(crm.url()).pathname;
    await expectStatus(crm, 'Draft');
    await crm.getByRole('button', { name: 'Submit for review' }).click();
    await expectStatus(crm, 'Internal review');
  });

  await test.step('HOD confirms tests & methods', async () => {
    const hod = await users.as('hod');
    await hod.goto(quotationUrl);
    await hod.getByRole('button', { name: 'Confirm tests & methods (HOD)' }).click();
    await expectToast(hod, 'Tests, methods & specifications confirmed');
    await expect(hod.getByRole('button', { name: 'Confirm tests & methods (HOD)' })).toBeHidden();
  });

  await test.step('Signatory authorizes with password re-entry (wrong password rejected)', async () => {
    const sig = await users.as('sig');
    await sig.goto(quotationUrl);
    await sig.getByRole('button', { name: 'Authorize & sign' }).click();
    await sign(sig, 'Authorize & sign', { password: 'not-my-password' });
    await expect(sig.getByRole('dialog').getByRole('alert')).toBeVisible();
    await sign(sig, 'Authorize & sign');
    await expect(sig.getByRole('button', { name: 'Authorize & sign' })).toBeHidden();
  });

  await test.step('CRM sends the quotation and records the customer PO', async () => {
    const crm = await users.as('crm');
    await crm.goto(quotationUrl);
    await crm.getByRole('button', { name: 'Send to customer' }).click();
    await expectStatus(crm, 'Sent');
    await crm.getByRole('link', { name: 'Record PO' }).click();
    const dialog = crm.getByRole('dialog');
    await expect(dialog).toContainText('Record customer PO');
    await dialog.getByLabel('PO number').fill('PO-E2E-77');
    await dialog.getByRole('button', { name: 'Save PO' }).click();
    await expect(dialog).toBeHidden();
    await expectToast(crm, /PO recorded/);
  });

  await test.step('CRM records the sample receipt', async () => {
    const crm = await users.as('crm');
    const row = crm.locator('tr', { hasText: 'Sunrise Pharma' }).filter({ hasText: 'PO-E2E-77' });
    await expect(row.locator('.chip')).toHaveText('Accepted');
    await row.getByRole('button', { name: 'Receive sample' }).click();
    const dialog = crm.getByRole('dialog');
    await dialog.getByLabel('Courier name').fill('BlueDart');
    await dialog.getByLabel('Docket / AWB no.').fill('BD123');
    await dialog.getByRole('button', { name: 'Record receipt' }).click();
    await expect(dialog).toBeHidden();
    await expectToast(crm, 'Sample receipt recorded');
  });

  await test.step('CRM pre-registers the sample with the Pharma template', async () => {
    const crm = await users.as('crm');
    await crm.getByRole('link', { name: 'Pre-register' }).click();
    await expect(heading(crm)).toHaveText('Pre-registration');
    await crm.getByRole('radio', { name: 'Pharma' }).click();
    await crm.getByLabel('Sample name').fill('Paracetamol API');
    await crm.getByLabel('Batch No.').fill('B-101');
    await expect(crm.getByLabel('Test name')).toHaveCount(2);
    await crm.getByRole('button', { name: 'Pre-register sample' }).click();
    await expect(crm).toHaveURL(/\/registrations\/(?!new)[^/]+$/);
    regUrl = new URL(crm.url()).pathname;
    regNumber = await docNumber(crm);
    await expectStatus(crm, 'Pre-registered');
  });

  await test.step('Registration reviewer verifies and registers to both sections', async () => {
    const reg = await users.as('reg');
    await reg.goto(regUrl);
    await reg.getByRole('button', { name: 'Verify & register' }).click();
    await sign(reg, 'Register & sign');
    await expectStatus(reg, 'Registered');
  });

  await test.step('Section approvers receive the sample and allocate to analysts', async () => {
    for (const [approver, testName, analyst] of [
      ['appchem', 'Loss on Drying', 'E2E anchem'],
      ['appmech', 'Brinell Hardness', 'E2E anmech'],
    ]) {
      const page = await users.as(approver);
      await page.goto('/section');
      const card = page.locator('section.card', { hasText: regNumber });
      await card.getByRole('button', { name: 'Receive in section' }).click();
      await expect(card.getByRole('button', { name: 'Receive in section' })).toBeHidden();
      await card.getByLabel(`Select ${testName}`).check();
      await selectContaining(card.getByLabel('Analyst'), analyst);
      await card.getByRole('button', { name: /Allocate/ }).click();
      await expect(card.locator('tr', { hasText: testName })).toContainText(analyst);
    }
  });

  const openMyTest = async (page: Page, testName: string) => {
    await page.goto('/analyst');
    await page.locator('tr', { hasText: testName }).getByRole('link', { name: regNumber }).click();
    await expect(heading(page)).toContainText(testName);
  };
  const openForReview = async (page: Page, testName: string) => {
    await page.goto('/review');
    await page.locator('tr', { hasText: testName }).getByRole('link', { name: regNumber }).click();
    await expect(heading(page)).toContainText(testName);
  };

  await test.step('Chemical analyst records LOD observations (formula) and submits', async () => {
    const an = await users.as('anchem');
    await openMyTest(an, 'Loss on Drying');
    await an.getByLabel('Empty replicate 1').fill('24.1021');
    await an.getByLabel('Before replicate 1').fill('26.1043');
    await an.getByLabel('After replicate 1').fill('26.0997');
    // Live preview uses the same formula engine as the server: (W1 − W2) / (W1 − W0) × 100
    await expect(an.locator('.stat', { hasText: 'Result' }).locator('.v')).toContainText('0.23');
    await expect(an.locator('.stat', { hasText: 'Conformity' })).toContainText('Complies');
    await an.getByLabel('Raw data / observations').fill('Dried at 105 °C for 3 h');
    await an.getByRole('button', { name: 'Save observations' }).click();
    await expectToast(an, 'Observations saved');
    await an.getByRole('button', { name: 'Submit for review' }).click();
    await sign(an, 'Submit & sign');
    await expectStatus(an, 'Submitted for review');
  });

  await test.step('Chemical approver returns the data for correction', async () => {
    const ap = await users.as('appchem');
    await openForReview(ap, 'Loss on Drying');
    await ap.getByRole('button', { name: 'Return for correction' }).click();
    await sign(ap, 'Return & sign', { comment: 'Attach balance printout' });
    await expectStatus(ap, 'Correction required');
  });

  await test.step('Analyst corrects and resubmits', async () => {
    const an = await users.as('anchem');
    await openMyTest(an, 'Loss on Drying');
    await expectStatus(an, 'Correction required');
    await expect(an.locator('.alert.warn')).toContainText('Attach balance printout');
    await an.getByLabel('Raw data / observations').fill('Dried at 105 °C for 3 h — balance printout attached');
    await an.getByRole('button', { name: 'Save observations' }).click();
    await expectToast(an, 'Observations saved');
    await an.getByRole('button', { name: 'Submit for review' }).click();
    await sign(an, 'Submit & sign');
    await expectStatus(an, 'Submitted for review');
  });

  await test.step('Chemical approver approves', async () => {
    const ap = await users.as('appchem');
    await openForReview(ap, 'Loss on Drying');
    await ap.getByRole('button', { name: 'Approve' }).click();
    await sign(ap, 'Approve & sign');
    await expectStatus(ap, 'Approved');
  });

  await test.step('Mechanical test is entered, submitted and approved', async () => {
    const an = await users.as('anmech');
    await openMyTest(an, 'Brinell Hardness');
    await an.getByLabel('Reading (HBW) replicate 1').fill('152');
    await an.getByRole('button', { name: 'Save observations' }).click();
    await expectToast(an, 'Observations saved');
    await an.getByRole('button', { name: 'Submit for review' }).click();
    await sign(an, 'Submit & sign');
    await expectStatus(an, 'Submitted for review');

    const ap = await users.as('appmech');
    await openForReview(ap, 'Brinell Hardness');
    await ap.getByRole('button', { name: 'Approve' }).click();
    await sign(ap, 'Approve & sign');
    await expectStatus(ap, 'Approved');
  });

  await test.step('Signatory creates, previews and releases the combined report', async () => {
    const sig = await users.as('sig');
    await sig.goto('/reports');
    await sig.locator('tr', { hasText: regNumber }).getByRole('button', { name: 'Create report' }).click();
    const dialog = sig.getByRole('dialog');
    await expect(dialog.getByLabel('Scope').locator('option:checked')).toHaveText('Combined — all 2 sections');
    await dialog.getByRole('button', { name: 'Create report' }).click();
    await expect(sig).toHaveURL(/\/reports\/[^/]+$/);
    await expectStatus(sig, 'Draft');
    await expect(sig.getByText('Combined report (all sections)')).toBeVisible();

    const release = sig.getByRole('button', { name: 'Release report' });
    await expect(release).toBeDisabled();
    const popup = sig.waitForEvent('popup');
    await sig.getByRole('button', { name: 'Preview PDF' }).click();
    await (await popup).close();
    // Opening the preview marks the report as previewed; the page refetches shortly after.
    await expect(async () => {
      await sig.reload();
      await expect(release).toBeEnabled({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await expectStatus(sig, 'Preview');
    await release.click();
    await sign(sig, 'Release & sign');
    await expectStatus(sig, 'Released');
    reportNumber = await docNumber(sig);
    expect(reportNumber).toMatch(/^TR\//);
  });

  await test.step('Accounts drafts the invoice, signatory authorizes, accounts issues it', async () => {
    const acc = await users.as('acc');
    await acc.goto('/invoices/new');
    await acc.getByLabel(`Select ${regNumber}`).check();
    await acc.getByRole('button', { name: /Prepare invoice for/ }).click();
    await expect(acc.getByLabel('Description')).toHaveCount(2);
    await acc.getByRole('button', { name: 'Save draft invoice' }).click();
    await expect(acc).toHaveURL(/\/invoices\/(?!new)[^/]+$/);
    await expectStatus(acc, 'Draft');
    const invoiceUrl = new URL(acc.url()).pathname;

    const sig = await users.as('sig');
    await sig.goto(invoiceUrl);
    await sig.getByRole('button', { name: 'Authorize & sign' }).click();
    await sign(sig, 'Authorize & sign');
    await expectStatus(sig, 'Approved');

    await acc.reload();
    await acc.getByRole('button', { name: 'Issue invoice' }).click();
    await expectStatus(acc, 'Issued');
    invoiceNumber = await docNumber(acc);
    expect(invoiceNumber).toMatch(/^INV\//);
  });

  await test.step('CRM dispatches report and invoice; combined verification is enforced', async () => {
    const crm = await users.as('crm');
    await crm.goto('/dispatch');
    await selectContaining(crm.locator('label.field', { hasText: 'Customer' }).locator('select'), 'Sunrise Pharma');
    await crm.getByLabel(reportNumber).check();
    await crm.getByLabel(invoiceNumber).check();
    await expect(crm.getByText('Combined', { exact: true })).toBeVisible();
    await crm.getByLabel('Courier', { exact: true }).fill('BlueDart');
    await crm.getByLabel('Docket / AWB no.').fill('BD999');
    const record = crm.getByRole('button', { name: 'Record dispatch' });
    await record.click();
    await expect(crm.locator('main').getByRole('alert')).toContainText('combined report');
    await crm.getByLabel(/I have verified that the complete combined report/).check();
    await record.click();
    const row = crm.locator('tr', { hasText: 'BD999' });
    await expect(row).toContainText('Combined verified');
  });

  await test.step('Stores receives the remnant sample for retention', async () => {
    const st = await users.as('stores');
    await st.goto('/stores');
    await st.locator('tr', { hasText: regNumber }).getByRole('button', { name: 'Receive' }).click();
    const dialog = st.getByRole('dialog');
    await dialog.getByLabel('Storage location').fill('Rack A-3');
    await dialog.getByRole('button', { name: 'Receive into store' }).click();
    await expect(dialog).toBeHidden();
    await expectToast(st, 'Remnant sample received into stores');
    await expect(st.locator('tr', { hasText: 'Rack A-3' })).toContainText('Retention active');
  });

  await test.step('Registration shows the completed lifecycle', async () => {
    const reg = await users.as('reg');
    await reg.goto(regUrl);
    await expectStatus(reg, 'Reported');
  });

  await test.step('Top-bar search finds the sample by its registration number', async () => {
    const reg = await users.as('reg');
    await reg.goto('/');
    // The shortcut is registered once the signed-in shell has rendered.
    await expect(reg.getByLabel('Search samples')).toBeVisible();
    await reg.keyboard.press('Control+k');
    await expect(reg.getByLabel('Search samples')).toBeFocused();
    await reg.keyboard.type(regNumber);
    await reg.keyboard.press('Enter');
    await expect(reg).toHaveURL(/\/registrations\?q=/);
    await expect(reg.locator('table.t tbody tr')).toHaveCount(1);
    await expect(reg.locator('table.t tbody')).toContainText(regNumber);
  });

  await test.step('Dashboard shows live KPIs, section progress and recent activity', async () => {
    const sig = await users.as('sig');
    await sig.goto('/');
    await expect(sig.locator('.kpi')).toHaveCount(4);
    // The only sample is already reported, so no sample is active any more.
    await expect(sig.locator('.kpi', { hasText: 'Active samples' }).locator('.kpi-value')).toHaveText('0');
    await expect(sig.locator('.flow > li')).toHaveCount(7);
    // Both tests were approved but the sample is now reported, so no section has active tests.
    await expect(sig.locator('.workload li', { hasText: 'Chemical' })).toContainText('No active tests');
    const recent = sig.locator('.card', { hasText: 'Recent activity' });
    await expect(recent.locator('tbody tr').first()).toContainText(regNumber);
    await expect(recent.locator('tbody tr').first()).toContainText('Report released');
    await sig.getByLabel('Date range').selectOption('week');
    await expect(sig.locator('.flow > li', { hasText: 'Reports released' }).locator('.flow-count')).toHaveText('1');
    await expect(sig.locator('.flow > li', { hasText: 'Reports released' })).toContainText('Last 7 days');
  });

  await users.close();
});
