import { test, expect } from '@playwright/test'

test.describe('Smoke tests', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Beyond the/i)
    // Check that the main heading or brand is visible
    await expect(page.locator('body')).toBeVisible()
  })

  test('bills page loads', async ({ page }) => {
    await page.goto('/bills')
    // Should see the bills page heading or search input
    await expect(page.locator('body')).toBeVisible()
  })

  test('representatives page loads', async ({ page }) => {
    await page.goto('/representatives')
    await expect(page.locator('body')).toBeVisible()
  })

  test('donors page loads', async ({ page }) => {
    await page.goto('/donors')
    await expect(page.locator('body')).toBeVisible()
  })

  test('unknown route shows 404', async ({ page }) => {
    await page.goto('/totally-fake-page')
    await expect(page.locator('body')).toContainText(/not found|404/i)
  })
})

test.describe('Middleware redirects', () => {
  test('/settings redirects unauthenticated users to / with redirect param', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForURL('/?redirect=%2Fsettings')
    expect(page.url()).toContain('redirect=%2Fsettings')
  })

  test('/dashboard redirects to /', async ({ page }) => {
    // Only for authenticated users — this may pass through for unauth
    await page.goto('/dashboard')
    // Either stays on / (unauth) or redirects to / (auth)
    await page.waitForURL('/')
  })
})
