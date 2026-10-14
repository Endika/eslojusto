import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';

// The norms as they stood on 09-10-2026, with November and December still waiting on the INE's
// figure, so the checks of an open condition do not move each time a figure comes out.
const open = (id: 'rdl25_2026_november' | 'rdl25_2026_december') => {
  const norm = BILLS_NORMS[id];
  if (norm.condition === undefined) throw new Error(`${id} has no condition`);
  return {
    ...norm,
    statusSince: null,
    statusUrl: null,
    condition: { ...norm.condition, met: null },
  };
};

export const NORMS_BEFORE_FIGURE: typeof BILLS_NORMS = {
  ...BILLS_NORMS,
  rdl25_2026_november: open('rdl25_2026_november'),
  rdl25_2026_december: open('rdl25_2026_december'),
};
