// ============================================================================
// Nammerha — E2E Test: Homepage & Navigation
// ============================================================================

import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
    test('should load homepage with correct title', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/Nammerha/);
    });

    test('should display search input', async ({ page }) => {
        await page.goto('/');
        const searchInput = page.locator('#search-input');
        await expect(searchInput).toBeVisible();
    });

    test('should navigate to project details', async ({ page }) => {
        await page.goto('/');
        await page.click('a[href="project-details.html"]');
        await expect(page).toHaveURL(/project-details/);
    });

    test('should navigate to auth page', async ({ page }) => {
        await page.goto('/auth');
        await expect(page).toHaveTitle(/Nammerha/);
    });
});

test.describe('Legal Pages', () => {
    test('should load terms page', async ({ page }) => {
        await page.goto('/terms');
        await expect(page.locator('h1')).toContainText('Terms of Service');
    });

    test('should load privacy page', async ({ page }) => {
        await page.goto('/privacy');
        await expect(page.locator('h1')).toContainText('Privacy');
    });

    test('should load contact page', async ({ page }) => {
        await page.goto('/contact');
        await expect(page.locator('h1')).toContainText('Contact');
    });

    test('should load refund policy page', async ({ page }) => {
        await page.goto('/refund-policy');
        await expect(page.locator('h1')).toContainText('Refund');
    });
});

test.describe('Responsive Design', () => {
    test('should render correctly on mobile viewport', async ({ page, isMobile }) => {
        await page.goto('/');

        // Bottom nav should be visible
        const bottomNav = page.locator('.bottom-nav');
        await expect(bottomNav).toBeVisible();

        // Search input should be visible
        const searchInput = page.locator('#search-input');
        await expect(searchInput).toBeVisible();
    });
});
