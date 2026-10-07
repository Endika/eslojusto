// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { formEntries, rowsNeeded, setEntry } from '../../src/calculator/fill';

const form = () => {
  document.body.innerHTML = `
    <form>
      <input type="radio" name="cause" value="resignation" />
      <input type="radio" name="cause" value="unfair_dismissal" />
      <input name="startDate" type="date" />
      <input name="monthlySalary" />
      <input type="checkbox" name="holidayDaysTakenUnknown" value="yes" />
      <input name="otherContracts.0.startDate" type="date" />
    </form>`;
  return document.querySelector('form') as HTMLFormElement;
};

describe('form entries', () => {
  it('sets a radio by value, a text by value and a checkbox by its value', () => {
    const f = form();
    expect(setEntry(f, 'cause', 'unfair_dismissal')).toBe(true);
    expect(setEntry(f, 'startDate', '2010-03-01')).toBe(true);
    expect(setEntry(f, 'monthlySalary', '1.850,00')).toBe(true);
    expect(setEntry(f, 'holidayDaysTakenUnknown', 'yes')).toBe(true);
    expect(formEntries(f)).toEqual([
      ['cause', 'unfair_dismissal'],
      ['startDate', '2010-03-01'],
      ['monthlySalary', '1.850,00'],
      ['holidayDaysTakenUnknown', 'yes'],
    ]);
  });
  it('refuses a control or an option the form does not have', () => {
    const f = form();
    expect(setEntry(f, 'cause', 'promotion')).toBe(false);
    expect(setEntry(f, 'nothing', '1')).toBe(false);
    expect(formEntries(f)).toEqual([]);
  });
  it('counts the «Otros trabajos» rows the entries need', () => {
    expect(rowsNeeded([['cause', 'resignation']])).toBe(0);
    expect(
      rowsNeeded([
        ['otherContracts.0.startDate', '2020-01-01'],
        ['otherContracts.2.endDate', '2021-01-01'],
      ]),
    ).toBe(3);
  });
});
