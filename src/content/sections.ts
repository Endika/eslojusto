// /alquiler/ is built only when PUBLIC_RENTAL=1: without it there is no route, no live card on the
// home page and no sitemap entry, so main can take the section piece by piece.
export const RENTAL_BUILD = import.meta.env.PUBLIC_RENTAL === '1';
