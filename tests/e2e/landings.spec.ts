import { test, expect, type Page } from '@playwright/test';

// One smoke per case page: its own heading and metadata, valid JSON-LD that matches what the page
// shows, the cause already marked, a review that completes, and no horizontal scroll on a phone.
const CASES = [
  {
    path: 'finiquito/baja-voluntaria/',
    h1: 'Finiquito por baja voluntaria: cuánto te corresponde',
    cause: 'Baja voluntaria (dimisión)',
    opens: 'fechas',
  },
  {
    path: 'finiquito/despido-improcedente/',
    h1: 'Despido improcedente: indemnización y finiquito',
    cause: 'Despido improcedente',
    opens: 'fechas',
  },
  {
    path: 'finiquito/fin-de-contrato/',
    h1: 'Finiquito por fin de contrato temporal',
    cause: 'Fin de contrato temporal',
    opens: 'temporal',
  },
  {
    path: 'finiquito/firmar-no-conforme/',
    h1: 'Firmar el finiquito como «no conforme»',
    cause: null,
    opens: 'causa',
  },
  { path: 'paro/', h1: 'Calcula cuánto paro vas a cobrar', cause: null, opens: 'causa' },
  {
    path: 'paro/por-tiempo-trabajado/',
    h1: 'Cuánto paro te corresponde según el tiempo trabajado',
    cause: null,
    opens: 'causa',
  },
  {
    path: 'paro/baja-voluntaria/',
    h1: '¿Hay paro si pides la baja voluntaria?',
    cause: 'Baja voluntaria (dimisión)',
    opens: 'fechas',
  },
  {
    path: 'finiquito/despido-objetivo/',
    h1: 'Finiquito por despido objetivo: 20 días y preaviso',
    cause: 'Despido objetivo',
    opens: 'fechas',
  },
  {
    path: 'paro/despido-disciplinario/',
    h1: 'Paro después de un despido disciplinario',
    cause: 'Despido disciplinario',
    opens: 'fechas',
  },
] as const;

type Node = Record<string, unknown>;
const graph = async (page: Page) =>
  (
    JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    ) as {
      '@graph': Node[];
    }
  )['@graph'];

const next = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click();

// From wherever the page opens to the result, with whatever cause it marked (or a dismissal).
async function review(page: Page) {
  const visible = (name: string) => page.locator(`[data-sheet="${name}"]:not([hidden])`);
  if (await visible('causa').count()) {
    await page.locator('#calculator').getByLabel('Despido improcedente', { exact: true }).check();
    await next(page);
  }
  if (await visible('temporal').count()) {
    await page.getByLabel('Eventual').check();
    await next(page);
  }
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2022-03-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await next(page);
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next(page);
  await page.getByLabel('Salario bruto mensual').fill('2.000,00');
  await next(page);
  await page.getByLabel('Disfrutados este año').fill('0');
  const submit = page.getByRole('button', { name: 'Revisar' });
  while (!(await submit.isVisible())) {
    if (await visible('hijos').count()) await page.getByLabel('Ninguno').check();
    await next(page);
  }
  await submit.click();
  await expect(page.getByRole('heading', { name: /Resultado/ })).toBeFocused();
}

for (const c of CASES) {
  test.describe(c.path, () => {
    test('has its heading, metadata and structured data', async ({ page }) => {
      await page.goto(c.path);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(c.h1);
      const title = await page.title();
      expect([...title].length).toBeLessThanOrEqual(60);
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect([...(description ?? '')].length).toBeLessThanOrEqual(155);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://eslojusto.es/${c.path}`,
      );
      await expect(page.locator('link[hreflang="es"]')).toHaveAttribute(
        'href',
        `https://eslojusto.es/${c.path}`,
      );

      const nodes = await graph(page);
      expect(nodes.map((n) => n['@type'])).toEqual(['BreadcrumbList', 'FAQPage']);
      const crumbs = nodes[0]?.['itemListElement'] as { item: string; position: number }[];
      expect(crumbs[0]?.item).toBe('https://eslojusto.es/');
      expect(crumbs.at(-1)?.item).toBe(`https://eslojusto.es/${c.path}`);
      const faq = nodes[1]?.['mainEntity'] as { name: string }[];
      const summaries = page.locator('.faq-item summary');
      await expect(summaries).toHaveCount(faq.length);
      for (const [i, q] of faq.entries()) await expect(summaries.nth(i)).toHaveText(q.name);
    });

    test('opens with its case marked and the review completes', async ({ page }) => {
      await page.goto(c.path);
      await expect(page).toHaveURL(new RegExp(`#${c.opens}$`));
      if (c.cause)
        await expect(
          page.locator('#calculator').getByLabel(c.cause, { exact: true }),
        ).toBeChecked();
      await review(page);
      const benefit = page.getByRole('region', { name: 'Tu paro (estimación)' });
      if (c.path.startsWith('paro/')) {
        // The estimate comes before the final pay items.
        const first = page.locator('[data-review] > :is([data-slot], [data-items])').first();
        await expect(first).toHaveAttribute('data-slot', 'benefit');
        await expect(benefit).toBeVisible();
      }
      if (c.cause === 'Baja voluntaria (dimisión)')
        await expect(benefit).toContainText('No da derecho a paro');
    });

    test('has no horizontal scroll at 360 px', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(c.path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test('the final pay page links each case page and shows the table by seniority', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const guide = page.getByRole('article');
  for (const c of CASES.filter((x) => x.path.startsWith('finiquito/')))
    await expect(guide.locator(`a[href="/${c.path}"]`).first()).toBeVisible();
  await expect(guide.locator('a[href="/paro/"]').first()).toBeVisible();
  const table = guide.getByRole('table', { name: /30 de septiembre de 2026/ });
  await expect(table.getByRole('row')).toHaveCount(5);
  // A contract for production circumstances can't last three years: no figure, and a note why.
  await expect(
    table
      .getByRole('row', { name: /^3 años/ })
      .getByRole('cell')
      .nth(1),
  ).toHaveText(/^—\s*2$/);
  await expect(guide.getByText('puede ser indefinido (art. 15.4 ET)')).toBeVisible();
});

test('the fixed-term examples stay within the legal maximum and say when they may not', async ({
  page,
}) => {
  await page.goto('finiquito/fin-de-contrato/');
  const table = page.getByRole('table', { name: /circunstancias de la producción/ });
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table.getByRole('row', { name: /12 meses/ })).toContainText(
    'solo si tu convenio sectorial lo amplía',
  );
  await expect(page.getByText(/puede ser en realidad indefinido \(art\. 15\.4/)).toBeVisible();
  await expect(page.getByText(/antes del 4 de marzo de 2001/).first()).toBeVisible();
});

test('leaving over a substantial change counts only when it harms you', async ({ page }) => {
  await page.goto('paro/baja-voluntaria/');
  await expect(
    page.getByText(
      'Una modificación sustancial de tus condiciones que te perjudique (art. 41.3 ET).',
    ),
  ).toBeVisible();
});

test('the home page links the benefit calculator', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('link', { name: 'Paro' })).toHaveAttribute('href', '/paro/');
});

test('a case page with a preset cause can still go back and change it', async ({ page }) => {
  await page.goto('finiquito/despido-objetivo/');
  await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(page).toHaveURL(/#causa$/);
  await page.locator('#calculator').getByLabel('Baja voluntaria (dimisión)').check();
  await next(page);
  await expect(page).toHaveURL(/#fechas$/);
});
