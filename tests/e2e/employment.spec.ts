import { test, expect, type Locator, type Page } from '@playwright/test';
import { nextSheet } from '../support/sheets';

// Every case reads the minimum wage and the norms as loaded on this day, so the clock is fixed.
const TODAY = new Date('2026-10-08T12:00:00');

const SIZES = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: '360×640', viewport: { width: 360, height: 640 } },
] as const;

type Answer = 'Sí' | 'No' | 'No lo sé';

interface Contract {
  readonly relationship?: string;
  readonly start: string;
  readonly end?: string;
  readonly modality?: string;
  readonly salary?: string;
  readonly technical?: Answer;
  readonly smallCompany?: Answer;
  readonly trialMonths?: string;
}

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const question = (scope: Locator, name: string) => scope.getByRole('group', { name, exact: true });
const choose = (scope: Locator, name: string, value: string) =>
  question(scope, name).getByLabel(value, { exact: true }).check();

// No sheet is ever wider than the screen.
async function fits(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function next(page: Page) {
  await fits(page);
  await nextSheet(page);
}

async function open(page: Page, viewport: { width: number; height: number }, today = TODAY) {
  await page.clock.setFixedTime(today);
  await page.setViewportSize(viewport);
  await page.goto('contrato/');
}

async function fillRelation(page: Page, c: Contract) {
  const s = sheet(page, 'Tu relación laboral');
  await s.getByLabel(c.relationship ?? 'Trabajo por cuenta ajena', { exact: true }).check();
  if (c.relationship === undefined) {
    await choose(s, '¿Te contrató una empresa de trabajo temporal para trabajar en otra?', 'No');
    await choose(s, '¿Es un contrato de relevo?', 'No');
    await choose(s, '¿Tienes menos de 18 años?', 'No');
    await choose(s, '¿Tienes el contrato por escrito?', 'Sí');
  }
  await s.getByLabel('Fecha de inicio', { exact: true }).fill(c.start);
  if (c.end) await s.getByLabel('Fecha de fin', { exact: true }).fill(c.end);
  await next(page);
}

async function fillRest(page: Page, c: Contract) {
  const salary = sheet(page, 'Tu salario');
  await expect(salary).toBeVisible();
  await salary.getByLabel('Salario bruto', { exact: true }).fill(c.salary ?? '1.500,00');
  await choose(salary, '¿Por qué periodo es esa cifra?', 'Al mes');
  await salary.getByLabel('Pagas extra al año', { exact: true }).fill('2');
  await choose(salary, '¿Las pagas extra van prorrateadas en cada nómina?', 'No');
  await salary.getByLabel('Horas a la semana', { exact: true }).fill('40');
  await choose(salary, '¿El contrato nombra tu convenio colectivo?', 'Sí');
  await next(page);
  await expect(sheet(page, 'Tus nóminas')).toBeVisible();
  await next(page);
  const time = sheet(page, 'Tu jornada');
  await choose(time, '¿Trabajas a turnos?', 'No');
  await choose(time, '¿Trabajas de noche?', 'No');
  await choose(time, '¿El contrato reparte la jornada de forma irregular en el año?', 'No');
  await choose(time, '¿Es un contrato a tiempo parcial?', 'No');
  await next(page);
  const trial = sheet(page, 'Tu periodo de prueba');
  await choose(trial, '¿El contrato tiene periodo de prueba?', 'Sí');
  await trial.getByLabel('Duración', { exact: true }).fill(c.trialMonths ?? '2');
  await choose(trial, 'En', 'Meses');
  await choose(trial, '¿Eres técnico titulado?', c.technical ?? 'No');
  await choose(
    trial,
    '¿Tu empresa tiene menos de 25 personas en plantilla?',
    c.smallCompany ?? 'No',
  );
  await choose(trial, '¿Ya habías hecho este mismo trabajo en esta empresa?', 'No');
  await choose(trial, '¿Vienes de un contrato formativo en esta empresa?', 'No');
  await next(page);
  const holidays = sheet(page, 'Tus vacaciones');
  await choose(holidays, '¿El contrato dice cuántos días de vacaciones tienes?', 'Sí');
  await holidays.getByLabel('Días de vacaciones al año', { exact: true }).fill('30');
  await choose(holidays, '¿Qué días son?', 'Naturales');
  await choose(holidays, '¿Dice que las vacaciones van incluidas en el salario?', 'No');
  await next(page);
  await expect(sheet(page, 'Cláusulas')).toBeVisible();
  await next(page);
  await expect(sheet(page, 'Lo que el contrato tiene que decir')).toBeVisible();
  await next(page);
  await expect(sheet(page, 'La oferta de empleo')).toBeVisible();
  await fits(page);
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await fits(page);
}

async function fillCase(page: Page, c: Contract) {
  await fillRelation(page, c);
  const modality = sheet(page, 'Tu tipo de contrato');
  await modality.getByLabel(c.modality ?? 'Indefinido', { exact: true }).check();
  await next(page);
  if (c.modality !== undefined && c.modality !== 'Indefinido') {
    await expect(sheet(page, 'Tus contratos anteriores')).toBeVisible();
    await next(page);
  }
  await fillRest(page, c);
}

for (const { name, viewport } of SIZES) {
  test.describe(name, () => {
    test('a salary below the minimum wage shows its rounded yearly shortfall', async ({ page }) => {
      await open(page, viewport);
      // 1.150 € in 14 payments is 16.100 € a year; the 2026 minimum is 17.094 €: 994 € short.
      await fillCase(page, { start: '2026-01-01', salary: '1.150,00' });
      const card = page.getByRole('region', { name: 'Salario frente al SMI', exact: true });
      await expect(card.locator('.item__status')).toHaveText(
        /Por debajo del SMI: unos 990\s€ al año/,
      );
      await expect(card.getByRole('link', { name: /art\. 27\.1/ })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Resumen' })).toContainText(
        'Hay puntos que no cumplen lo que marca la ley.',
      );
      // Without the documents API the detail is all there, year by year.
      await card.getByText('Cómo se calcula').click();
      await expect(card).toContainText(/2026: SMI de 17\.094,00 €; tu salario, 16\.100,00 €/);
    });

    test('a work-or-service contract of 2023 quotes art. 15.4 and never asserts', async ({
      page,
    }) => {
      await open(page, viewport);
      await fillCase(page, { start: '2023-05-02', modality: 'De obra o servicio' });
      const card = page.getByRole('region', { name: 'Modalidad de contrato', exact: true });
      await expect(card.locator('.item__status')).toHaveText('La ley prevé la condición de fija');
      await expect(card).toContainText(
        'El artículo 15.4 del Estatuto de los Trabajadores dice que, en un caso como el tuyo, la persona adquiere la condición de fija',
      );
      await expect(card).toContainText('adquirirán la condición de fijas');
      await expect(card.getByRole('link', { name: /Texto en el BOE/ })).toHaveAttribute(
        'href',
        /boe\.es/,
      );
      await expect(page.locator('#resultado')).not.toContainText(/eres fij[oa]|te convierte/);
    });

    test('household employment stops at the gate', async ({ page }) => {
      await open(page, viewport);
      await fillRelation(page, { relationship: 'Empleo del hogar', start: '2025-03-01' });
      await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
      await expect(page.getByText('Esta revisión no cubre tu tipo de contrato')).toBeVisible();
      await expect(page.getByText(/relación laboral especial/).first()).toBeVisible();
      await expect(page.getByRole('region', { name: 'Resumen' })).toBeHidden();
      await fits(page);
    });

    test('a contract of 2021 is reviewed in part, without its modality', async ({ page }) => {
      await open(page, viewport);
      await fillRelation(page, { start: '2021-06-01' });
      // The modality and the work history are skipped: the salary comes next.
      await fillRest(page, { start: '2021-06-01' });
      await expect(page.getByText(/^Revisión parcial:/)).toBeVisible();
      const card = page.getByRole('region', { name: 'Tipo de contrato y su causa', exact: true });
      await expect(card.locator('.item__status')).toHaveText('No se revisa en esta versión');
    });

    test('«No lo sé» on staff size gives both trial limits', async ({ page }) => {
      await open(page, viewport);
      await fillCase(page, {
        start: '2026-01-01',
        trialMonths: '3',
        technical: 'No',
        smallCompany: 'No lo sé',
      });
      const card = page.getByRole('region', { name: 'Periodo de prueba', exact: true });
      await expect(card.locator('.item__status')).toHaveText('Depende');
      await expect(card).toContainText(
        'Depende de si tu empresa tiene menos de 25 personas en plantilla:',
      );
      await expect(card).toContainText('Con menos de 25 personas: dentro del límite');
      await expect(card).toContainText('Con 25 personas o más: depende de tu convenio');
    });

    test('in 2027, before its decree, the minimum wage is not yet published', async ({ page }) => {
      await open(page, viewport, new Date('2027-01-20T12:00:00'));
      await fillCase(page, { start: '2026-11-02', salary: '1.500,00' });
      const card = page.getByRole('region', { name: 'Salario frente al SMI', exact: true });
      await expect(card.locator('.item__status')).toHaveText('SMI aún no publicado');
      await card.getByText('Cómo se calcula').click();
      await expect(card).toContainText('El SMI de 2027 aún no se ha publicado en el BOE');
    });
  });
}

test('the home page labels the contract review as a beta', async ({ page }) => {
  await page.goto('');
  const work = page.getByRole('region', { name: 'Trabajo' });
  const card = work.getByRole('article', { name: 'Contrato de trabajo' });
  await expect(card.getByRole('link', { name: 'Contrato de trabajo' })).toBeVisible();
  await expect(card.getByText('Beta')).toBeVisible();
  await expect(work.getByText(/^Próximamente/)).toHaveCount(0);
});

test('the page has its title, description, heading, canonical, JSON-LD and review date', async ({
  page,
}) => {
  await page.goto('contrato/');
  const title = await page.title();
  expect(title.length).toBeLessThanOrEqual(60);
  expect(title).toMatch(/contrato de trabajo/i);
  expect(title).toMatch(/SMI/);
  const description =
    (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
  expect(description.length).toBeGreaterThan(0);
  expect(description.length).toBeLessThanOrEqual(155);
  expect(description).toMatch(/contrato de trabajo/);
  expect(description).toMatch(/SMI/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Comprueba si tu contrato de trabajo es justo',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://eslojusto.es/contrato/',
  );

  const reviewed = page.locator('.desk__reviewed time');
  const day = (await reviewed.getAttribute('datetime')) ?? '';
  expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const longDay = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
  await expect(reviewed).toHaveText(`Revisado el ${longDay}`);

  const json = (await page.locator('script[type="application/ld+json"]').textContent()) ?? '';
  const graph = (JSON.parse(json) as { '@graph': Record<string, unknown>[] })['@graph'];
  const app = graph.find((n) => n['@type'] === 'WebApplication');
  expect(app).toMatchObject({
    name: 'Revisión de contrato de trabajo',
    url: 'https://eslojusto.es/contrato/',
    description,
  });
  const faq = graph.find((n) => n['@type'] === 'FAQPage') as
    { mainEntity: { name: string; acceptedAnswer: { text: string } }[] } | undefined;
  const questions = (await page.locator('.faq-item summary').allTextContents()).map((q) =>
    q.trim(),
  );
  expect(questions).toContain('¿Cuánto puede durar el periodo de prueba?');
  expect(faq?.mainEntity.map((q) => q.name)).toEqual(questions);
  // Without the documents API there is no reading and no pass to ask about.
  expect(questions).not.toContain('¿Qué pasa con mis documentos?');

  const guide = page.locator('.guide');
  await expect(guide).toContainText('La jornada máxima sigue en 40 horas semanales');
  await expect(guide).toContainText('El artículo 15.4 del Estatuto de los Trabajadores dice:');
  await expect(guide).toContainText('adquirirán la condición de fijas');
  await expect(guide.getByRole('link', { name: /REGCON/ })).toHaveAttribute(
    'href',
    'https://expinterweb.mites.gob.es/regcon/',
  );
  await expect(guide.locator('tr[data-year]').first()).toContainText('17.094,00');
  // The footer names the labour norms of this section, not the final pay's guide.
  const footer = page.locator('.footer__note');
  await expect(footer).toContainText('Real Decreto 723/2026');
  await expect(footer).toContainText('reales decretos del SMI');
  await expect(footer).not.toContainText('CGPJ');
});

test('the privacy page and the legal notice describe the contract review in this build', async ({
  page,
}) => {
  await page.goto('privacidad/');
  const privacy = page.locator('main');
  await expect(privacy).toContainText('Lo que escribes en la revisión del contrato');
  await expect(privacy).toContainText('La respuesta sobre si tienes una discapacidad reconocida');
  await expect(privacy).toContainText('Al revisar el contrato');
  await page.goto('aviso-legal/');
  const notice = page.locator('main');
  await expect(
    notice.getByRole('heading', { name: /La revisión del contrato de trabajo/ }),
  ).toContainText('Beta');
  await expect(notice).toContainText('No lee convenios colectivos ni sus tablas');
  await expect(notice).toContainText('No calcula el salario neto, el IRPF ni las cotizaciones');
});
