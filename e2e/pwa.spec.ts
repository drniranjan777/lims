/**
 * Desktop-PWA plumbing. The service worker itself registers only in production builds; here we check
 * that everything an installing browser fetches is served to signed-out visitors and is well-formed.
 */
import { expect, test } from '@playwright/test';

test('manifest, icons, service worker and offline page are public and well-formed', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: 'NLIMS — Lab Management System', short_name: 'NLIMS', start_url: '/', display: 'standalone', theme_color: '#062852' });
  expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`)).toEqual(['192x192:any', '512x512:any', '512x512:maskable']);
  for (const icon of [...manifest.icons.map((i: { src: string }) => i.src), '/icons/apple-touch-icon.png']) {
    const r = await request.get(icon);
    expect(r.status(), icon).toBe(200);
    expect(r.headers()['content-type']).toBe('image/png');
  }

  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['cache-control']).toContain('no-store');
  expect(await sw.text()).toContain("url.pathname.startsWith('/api/')");

  const offline = await request.get('/offline.html');
  expect(offline.status()).toBe(200);
  expect(await offline.text()).toContain('You’re offline');

  // Pages themselves stay behind the sign-in redirect.
  const page = await request.get('/quotations', { maxRedirects: 0 });
  expect(page.status()).toBe(307);
});

test('sign-in page links the manifest and Apple touch icon', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#062852');
});
