import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { PASSWORD } from './env';

/** One signed-in browser context per user, reused across the steps of a test. */
export class Users {
  private pages = new Map<string, Page>();
  constructor(private browser: Browser) {}

  async as(key: string): Promise<Page> {
    const cached = this.pages.get(key);
    if (cached) return cached;
    const page = await (await this.browser.newContext()).newPage();
    await signIn(page, `${key}@e2e.local`);
    this.pages.set(key, page);
    return page;
  }

  async close() {
    for (const p of this.pages.values()) await p.context().close();
  }
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: /^Account menu for/ })).toBeVisible();
}

/** The page heading — document number followed by its status chip. */
export const heading = (page: Page) => page.locator('main h1');

/** Document number shown in the heading (text before the status chip). */
export async function docNumber(page: Page) {
  await expect(heading(page).locator('.row')).toBeVisible();
  return heading(page)
    .locator('.row')
    .evaluate((el) => (el.firstChild?.textContent ?? '').trim());
}

export async function expectStatus(page: Page, label: string) {
  await expect(heading(page).locator('.chip').last()).toHaveText(label);
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator('.toasts')).toContainText(text);
}

/** Pick the option of a <select> whose text contains `text` (options may load asynchronously). */
export async function selectContaining(select: Locator, text: string) {
  const option = select.locator('option', { hasText: text });
  await expect(option).toHaveCount(1);
  await select.selectOption((await option.getAttribute('value'))!);
}

/** Complete the e-signature dialog: password re-entry plus optional comment. */
export async function sign(page: Page, confirmLabel: string, opts: { comment?: string; password?: string } = {}) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (opts.comment !== undefined) await dialog.locator('textarea').fill(opts.comment);
  await dialog.getByLabel('Password').fill(opts.password ?? PASSWORD);
  await dialog.getByRole('button', { name: confirmLabel }).click();
  if (opts.password === undefined) await expect(dialog).toBeHidden();
}
