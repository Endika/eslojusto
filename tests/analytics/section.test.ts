import { beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '../../src/analytics/events';
import { sectionAnalytics } from '../../src/analytics/section';

let sent: [string, unknown][];
let clock: number;
const track = ((name: string, props: unknown) => void sent.push([name, props])) as Track;
const section = () => sectionAnalytics<'trabajo' | 'fechas'>(track, () => clock);

beforeEach(() => {
  sent = [];
  clock = 50_000;
});

describe('what every review reports of its walk through the sheets', () => {
  it('reports a sheet once when it is shown, and again after another one', () => {
    const { events } = section();
    events.stepShown('trabajo');
    events.stepShown('trabajo');
    events.stepShown('fechas');
    events.stepShown('trabajo');
    expect(sent).toEqual([
      ['section_viewed', { section: 'trabajo' }],
      ['section_viewed', { section: 'fechas' }],
      ['section_viewed', { section: 'trabajo' }],
    ]);
  });

  it('buckets the seconds spent on a sheet from when it was shown', () => {
    const { events } = section();
    events.stepShown('trabajo');
    clock += 2_000;
    events.stepCompleted('trabajo');
    clock += 38_000;
    events.stepCompleted('trabajo');
    expect(sent.slice(1)).toEqual([
      ['section_completed', { section: 'trabajo', seconds: '<10' }],
      ['section_completed', { section: 'trabajo', seconds: '30-60' }],
    ]);
  });

  it('reports going back, and a rejected answer by its name and a general code', () => {
    const { events } = section();
    events.wentBack('fechas', 'trabajo');
    events.fieldRejected('fechas', 'endDate', 'missing_endDate');
    events.fieldRejected('fechas', 'endDate', 'missing_choice');
    events.fieldRejected('fechas', 'endDate', 'before_start');
    expect(sent).toEqual([
      ['went_back', { from: 'fechas', to: 'trabajo' }],
      ['validation_error', { section: 'fechas', field: 'endDate', code: 'missing_value' }],
      ['validation_error', { section: 'fechas', field: 'endDate', code: 'missing_choice' }],
      ['validation_error', { section: 'fechas', field: 'endDate', code: 'before_start' }],
    ]);
  });

  it('reports a help topic opened and a start over', () => {
    const { events } = section();
    events.helpOpened('faq-hogar-smi');
    events.startedOver();
    expect(sent).toEqual([
      ['help_opened', { topic: 'faq-hogar-smi' }],
      ['started_over', {}],
    ]);
  });

  it('counts each review, timed from the first sheet shown', () => {
    const { events, reviewed } = section();
    events.stepShown('trabajo');
    clock += 30_000;
    events.stepShown('fechas');
    clock += 30_000;
    expect(reviewed()).toEqual({ attempt: 1, seconds: 60 });
    clock += 5_000;
    expect(reviewed()).toEqual({ attempt: 2, seconds: 65 });
  });

  it('times a review from the clock itself when no sheet was shown', () => {
    clock = 70_000;
    expect(section().reviewed()).toEqual({ attempt: 1, seconds: 70 });
  });
});
