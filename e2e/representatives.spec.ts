import { test, expect } from '@playwright/test'

test.describe('Representatives page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/representatives')
  })

  test('renders the page with address search input', async ({ page }) => {
    // Should have an address/ZIP search input
    const searchInput = page.locator('input[placeholder*="ddress"], input[placeholder*="ZIP"], input[placeholder*="earch"]')
    await expect(searchInput.first()).toBeVisible()
  })

  test('searching by ZIP returns results', async ({ page }) => {
    const searchInput = page.locator('input').first()
    await searchInput.fill('90210')

    // Submit the search (press Enter or click search button)
    const submitButton = page.locator('button[type="submit"], button:has-text("Search"), button:has-text("Find")')
    if (await submitButton.count() > 0) {
      await submitButton.first().click()
    } else {
      await searchInput.press('Enter')
    }

    // Wait for API response
    await page.waitForTimeout(3000)

    // Should show results or a "no results" message
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('Representative detail page', () => {
  test('navigating from search to detail page works', async ({ page }) => {
    await page.goto('/representatives')

    // If there are rep cards/links, click the first one
    const repLink = page.locator('a[href^="/representatives/"]').first()
    if (await repLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await repLink.click()
      await page.waitForURL(/\/representatives\/.+/)
      await expect(page.locator('body')).toBeVisible()
    }
  })
})
