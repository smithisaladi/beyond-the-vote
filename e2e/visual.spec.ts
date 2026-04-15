import fs from 'node:fs'
import { test, expect } from '@playwright/test'

/**
 * Visual regression tests — capture key pages at desktop (1440×900) and
 * mobile (390×844) to detect unintended design-system drift.
 *
 * Snapshots are platform-specific (chromium-linux.png vs chromium-darwin.png).
 * Generate baselines with: npm run test:e2e:update
 *
 * Until a baseline exists for the current platform/project, each test skips
 * with a clear message so CI (and first-time local runs) do not fail on the
 * missing snapshot.
 */

const pages = [
  { name: 'landing', path: '/' },
  { name: 'bills', path: '/bills' },
  { name: 'representatives', path: '/representatives' },
  { name: 'donors', path: '/donors' },
]

for (const { name, path } of pages) {
  test.describe(`Visual: ${name}`, () => {
    test(`desktop screenshot`, async ({ page }, testInfo) => {
      const snapshotPath = testInfo.snapshotPath(`${name}-desktop.png`)
      test.skip(
        !fs.existsSync(snapshotPath),
        `No baseline at ${snapshotPath}. Run 'npm run test:e2e:update' to generate.`,
      )
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

    test(`mobile screenshot`, async ({ page }, testInfo) => {
      const snapshotPath = testInfo.snapshotPath(`${name}-mobile.png`)
      test.skip(
        !fs.existsSync(snapshotPath),
        `No baseline at ${snapshotPath}. Run 'npm run test:e2e:update' to generate.`,
      )
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
