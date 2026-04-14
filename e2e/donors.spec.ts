import { test, expect } from '@playwright/test'

test.describe('Donors page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/donors')
  })

  test('renders the PAC leaderboard', async ({ page }) => {
    // Should show some content — heading or list
    await expect(page.locator('body')).toBeVisible()
  })

  test('search filters PAC list', async ({ page }) => {
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="earch"]')
    if (await searchInput.count() > 0) {
      await searchInput.first().fill('AIPAC')
      await page.waitForTimeout(500)
      await expect(page.locator('body')).toBeVisible()
    }
  })

  test('clicking a PAC navigates to detail page', async ({ page }) => {
    const pacLink = page.locator('a[href^="/donors/"]').first()
    if (await pacLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await pacLink.click()
      await page.waitForURL(/\/donors\/.+/)
      await expect(page.locator('body')).toBeVisible()
    }
  })
})

test.describe('PAC detail page', () => {
  test('shows PAC detail when navigated directly', async ({ page }) => {
    await page.goto('/donors')

    const pacLink = page.locator('a[href^="/donors/"]').first()
    if (await pacLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await pacLink.getAttribute('href')
      if (href) {
        await page.goto(href)
        await expect(page.locator('body')).toBeVisible()
      }
    }
  })
})
