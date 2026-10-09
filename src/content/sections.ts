// /alquiler/ is built only when PUBLIC_RENTAL=1: without it there is no route, no live card on the
// home page and no sitemap entry, so main can take the section piece by piece.
export const RENTAL_BUILD = import.meta.env.PUBLIC_RENTAL === '1';

// /contrato/ is built only when PUBLIC_EMPLOYMENT=1, on the same terms; it opens as a beta.
export const EMPLOYMENT_BUILD = import.meta.env.PUBLIC_EMPLOYMENT === '1';
export const EMPLOYMENT_BETA = true;

// /paro/erte/, the benefit during an ERTE, is built only when PUBLIC_ERTE=1, on the same terms.
export const ERTE_BUILD = import.meta.env.PUBLIC_ERTE === '1';
// /empleada-de-hogar/ is built only when PUBLIC_HOUSEHOLD=1, on the same terms: without it there is
// no route, no home card, no sitemap entry and no link or text about it.
export const HOUSEHOLD_BUILD = import.meta.env.PUBLIC_HOUSEHOLD === '1';
export const HOUSEHOLD_BETA = true;

// /seguros/, the dates of a home or motor policy, is built only when PUBLIC_INSURANCE=1, on the
// same terms; it opens as a beta.
export const INSURANCE_BUILD = import.meta.env.PUBLIC_INSURANCE === '1';
export const INSURANCE_BETA = true;
