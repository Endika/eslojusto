import { test, expect, type Page } from '@playwright/test';

// Runs against the documents build, which serves Basque under review: a page in another language
// keeps the report's and the letters' words in Spanish.

const block = (page: Page, id: string) =>
  page.evaluate((i) => {
    const text = document.getElementById(i)?.textContent;
    return text ? (JSON.parse(text) as Record<string, string>) : null;
  }, id);

for (const path of [
  'finiquito/',
  'alquiler/',
  'contrato/',
  'financiacion/',
  'hipoteca/',
  'seguros/',
]) {
  test(`/eu/${path} ships the Spanish words of its papers, the same as /${path}`, async ({
    page,
  }) => {
    await page.goto(path);
    const spanish = await block(page, 'client-strings');
    expect(await block(page, 'client-strings-papers')).toBeNull();
    await page.goto(`eu/${path}`);
    const papers = await block(page, 'client-strings-papers');
    expect(papers).toEqual(spanish);
    expect(papers?.['client.documents.letter.name']).toBe('Nombre y apellidos');
  });
}

test('a page without the documents ships no papers', async ({ page }) => {
  await page.goto('eu/');
  expect(await block(page, 'client-strings-papers')).toBeNull();
});
