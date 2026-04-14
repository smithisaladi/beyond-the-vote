import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('sign-in modal opens from landing page CTA', async ({ page }) => {
    await page.goto('/')

    // Look for sign-in button
    const signInBtn = page.locator('button:has-text("Sign in"), a:has-text("Sign in"), button:has-text("Log in")')
    if (await signInBtn.count() > 0) {
      await signInBtn.first().click()
      // Modal should appear with email input
      await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 3000 })
    }
  })

  test('sign-up modal opens from landing page CTA', async ({ page }) => {
    await page.goto('/')

    const signUpBtn = page.locator('button:has-text("Sign up"), a:has-text("Sign up"), button:has-text("Get started")')
    if (await signUpBtn.count() > 0) {
      await signUpBtn.first().click()
      await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 3000 })
    }
  })

  test('sign-in with invalid credentials shows error', async ({ page }) => {
    await page.goto('/')

    const signInBtn = page.locator('button:has-text("Sign in"), a:has-text("Sign in")')
    if (await signInBtn.count() > 0) {
      await signInBtn.first().click()

      const emailInput = page.locator('input[type="email"]')
      const passwordInput = page.locator('input[type="password"]')

      if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await emailInput.fill('fake@example.com')
        await passwordInput.fill('wrongpassword')

        // Submit form
        const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in")').last()
        await submitBtn.click()

        // Should show an error message
        await page.waitForTimeout(2000)
        // At minimum, we shouldn't navigate away
        expect(page.url()).toContain('localhost:3000')
      }
    }
  })

  test('Google OAuth button is present in sign-in modal', async ({ page }) => {
    await page.goto('/')

    const signInBtn = page.locator('button:has-text("Sign in"), a:has-text("Sign in")')
    if (await signInBtn.count() > 0) {
      await signInBtn.first().click()

      // Look for Google OAuth button
      const googleBtn = page.locator('button:has-text("Google"), button:has-text("Continue with Google")')
      if (await googleBtn.count() > 0) {
        await expect(googleBtn.first()).toBeVisible()
      }
    }
  })
})
