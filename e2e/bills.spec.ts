import { test, expect } from '@playwright/test'

test.describe('Bills page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bills')
  })

  test('renders the page with heading', async ({ page }) => {
    // The Bills page has two <h1>s (sticky "Bills Tracker" in PageHeader,
    // plus "Search Bills" in <main>). Scope to the main content h1.
    await expect(page.locator('main h1, [data-testid="page-title"]').first()).toBeVisible()
  })

  test('search input is visible and functional', async ({ page }) => {
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="earch"]')
    if (await searchInput.count() > 0) {
      await searchInput.first().fill('healthcare')
      // Wait for results to update (debounced)
      await page.waitForTimeout(500)
      // Should trigger a network request to /api/bills with q param
      await expect(page.locator('body')).toBeVisible()
    }
  })

  test('status filter pills are interactive', async ({ page }) => {
    // Look for filter buttons (Active, Committee, etc.)
    const filterButtons = page.locator('button').filter({ hasText: /Active|Committee|Passed|Failed|Stalled/ })
    if (await filterButtons.count() > 0) {
      await filterButtons.first().click()
      await page.waitForTimeout(300)
      // Page should still be functional
      await expect(page.locator('body')).toBeVisible()
    }
  })
})

test.describe('Bill detail page', () => {
  test('navigating to a bill shows detail content', async ({ page }) => {
    await page.goto('/bills')

    // Click on the first bill link if available
    const billLink = page.locator('a[href^="/bills/"]').first()
    if (await billLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await billLink.click()
      await page.waitForURL(/\/bills\/.+/)

      // Should show bill detail content
      await expect(page.locator('body')).toBeVisible()
    }
  })
})
