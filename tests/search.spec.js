const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('shows the search form and requires a location', async ({ page }) => {
  await expect(page).toHaveTitle('Search');
  await expect(page.getByRole('heading', { name: 'WA State Sales Tax Lookup' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search query' })).toBeVisible();

  await page.getByRole('button', { name: 'Find Tax Rate' }).click();
  await expect(page.getByRole('searchbox')).toBeFocused();
  await expect(page.locator('#result')).toBeEmpty();
});

test('shows the location and formatted tax rate for a successful search', async ({ page }) => {
  let requestBody;
  await page.route('**/api/search', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      json: {
        places: [{
          displayName: { text: 'Seattle Public Library' },
          formattedAddress: '1000 4th Ave, Seattle, WA 98104',
        }],
        tax: { locCode: '1726', taxName: 'Seattle', rate: 0.1025 },
      },
    });
  });

  await page.getByRole('searchbox').fill('  Seattle Public Library  ');
  await page.getByRole('button', { name: 'Find Tax Rate' }).click();

  await expect(page.getByText('Seattle Public Library')).toBeVisible();
  await expect(page.getByText('1000 4th Ave, Seattle, WA 98104')).toBeVisible();
  await expect(page.locator('#result')).toContainText('Location Code: 1726');
  await expect(page.locator('#result')).toContainText('Tax Name: Seattle');
  await expect(page.locator('#result')).toContainText('Tax Rate: 10.25%');
  await expect.poll(() => requestBody).toEqual({ textQuery: 'Seattle Public Library' });
});

test('reports when the search returns no places', async ({ page }) => {
  await page.route('**/api/search', (route) => route.fulfill({ json: { places: [] } }));

  await page.getByRole('searchbox').fill('Somewhere obscure');
  await page.getByRole('button', { name: 'Find Tax Rate' }).click();

  await expect(page.locator('#result')).toHaveText('No places found.');
  await expect(page.locator('#result')).not.toHaveClass(/error/);
});

test('shows the address and Washington-only message for a non-Washington result', async ({ page }) => {
  await page.route('**/api/search', (route) => route.fulfill({
    json: {
      places: [{
        displayName: { text: 'Portland Art Museum' },
        formattedAddress: '1219 SW Park Ave, Portland, OR 97205',
      }],
      message: 'A Washington State address was not returned.  Please search for a place in Washington State.',
    },
  }));

  await page.getByRole('searchbox').fill('Portland Art Museum');
  await page.getByRole('button', { name: 'Find Tax Rate' }).click();

  await expect(page.getByText('Portland Art Museum')).toBeVisible();
  await expect(page.getByText('1219 SW Park Ave, Portland, OR 97205')).toBeVisible();
  await expect(page.locator('#result')).toContainText(
    'A Washington State address was not returned.  Please search for a place in Washington State.',
  );
  await expect(page.locator('#result')).not.toContainText('Location Code:');
  await expect(page.locator('#result')).not.toContainText('Tax Name:');
  await expect(page.locator('#result')).not.toContainText('Tax Rate:');
});

test('shows request errors to the user', async ({ page }) => {
  await page.route('**/api/search', (route) => route.fulfill({
    status: 500,
    json: { error: 'GOOGLE_MAPS_API_KEY is not configured.' },
  }));

  await page.getByRole('searchbox').fill('Seattle');
  await page.getByRole('button', { name: 'Find Tax Rate' }).click();

  await expect(page.locator('#result')).toContainText('Search failed.');
  await expect(page.locator('#result')).toContainText('Request failed (500 Internal Server Error)');
  await expect(page.locator('#result')).toContainText('GOOGLE_MAPS_API_KEY is not configured.');
  await expect(page.locator('#result')).toHaveClass(/error/);
});

test('handles missing tax fields gracefully', async ({ page }) => {
  await page.route('**/api/search', (route) => route.fulfill({
    json: {
      places: [{ displayName: { text: 'Unknown place' } }],
      tax: { rate: 'not-a-number' },
    },
  }));

  await page.getByRole('searchbox').fill('Unknown place');
  await page.getByRole('button', { name: 'Find Tax Rate' }).click();

  await expect(page.locator('#result')).toContainText('Address unavailable');
  await expect(page.locator('#result')).toContainText('Location Code: Unavailable');
  await expect(page.locator('#result')).toContainText('Tax Name: undefined');
  await expect(page.locator('#result')).toContainText('Tax Rate: Unavailable');
});
