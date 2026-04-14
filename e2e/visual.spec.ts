import { test, expect } from '@playwright/test'

/**
 * Visual regression tests — capture key pages at desktop (1440×900) and
 * mobile (390×844) to detect unintended design-system drift.
 *
 * Snapshots are generated first with: npm run test:e2e:update
 * Subsequent runs compare against the baseline.
 */

const pages = [
  { name: 'landing', path: '/' },
  { name: 'bills', path: '/bills' },
  { name: 'representatives', path: '/representatives' },
  { name: 'donors', path: '/donors' },
]

for (const { name, path } of pages) {
  test.describe(`Visual: ${name}`, () => {
    test(`desktop screenshot`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(path)
      // Wait for any loading states to resolve
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)
      await expect(page).toHaveScreenshot(`${name}-desktop.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      })
    })

    test(`mobile screenshot`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)
      await expect(page).toHaveScreenshot(`${name}-mobile.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      })
    })
  })
}
