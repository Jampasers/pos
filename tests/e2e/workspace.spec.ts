import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('Seed password is missing');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Merchant' })).toBeVisible();
}

test('cashier gets the assigned outlet, persists a session on reload and logs out', async ({ page }) => {
  await page.goto('/'); await login(page, 'cashier@example.test');
  await expect(page.getByRole('button', { name: /BKS Bekasi/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /DPK Depok/ })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Merchant' }).locator('option')).toHaveCount(1);
  await page.getByRole('button', { name: /BKS Bekasi/ }).click();
  await expect(page.getByText('Outlet aktif: Bekasi')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Daftarkan perangkat' })).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('combobox', { name: 'Merchant' })).toBeVisible();
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeVisible();
});

test('merchant dashboard creates a real outlet and registers then revokes a device', async ({ page }) => {
  await page.goto('http://localhost:3000'); await login(page, 'owner@example.test');
  await page.getByRole('combobox', { name: 'Merchant' }).selectOption({ label: 'Danka Coffee' });
  const suffix = Date.now().toString();
  const name = `Browser Outlet ${suffix}`, code = `E${suffix}`;
  await page.getByLabel('Nama outlet', { exact: true }).fill(name);
  await page.getByLabel('Kode outlet', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Simpan outlet', exact: true }).click();
  const outlet = page.getByRole('button', { name: new RegExp(`${code} ${name}`) });
  await expect(outlet).toBeVisible(); await outlet.click();
  const deviceName = `Browser Device ${suffix}`;
  await page.getByLabel('Nama perangkat', { exact: true }).fill(deviceName);
  await page.getByRole('button', { name: 'Daftarkan perangkat', exact: true }).click();
  await expect(page.getByText(deviceName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Cabut akses ${deviceName}`, exact: true }).click();
  await page.getByRole('button', { name: 'Ya, cabut akses', exact: true }).click();
  await expect(page.getByText('Akses dicabut', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: new RegExp(`${code} ${name}`) })).toBeVisible();
});

test('merchant switch replaces outlet data and POS adapts to a touch viewport', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/'); await login(page, 'owner@example.test');
  await page.getByRole('combobox', { name: 'Merchant' }).selectOption({ label: 'Second Merchant' });
  await expect(page.getByRole('button', { name: /CTR Central/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /BKS Bekasi/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mode gelap' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
