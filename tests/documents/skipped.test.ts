import { describe, expect, it } from 'vitest';
import { missingPageLines } from '../../src/documents/skipped';
import { tr } from './fixtures';
import { pageTranslator } from '../support/page-strings';

describe('skipped pages', () => {
  it('says which page a read needed and did not find, and how to tell it', () => {
    expect(missingPageLines(['missing_key_page'], pageTranslator('mortgage'))).toEqual([
      'No se ha encontrado la cláusula de gastos de tu escritura. Si tu escritura la tiene, puede que esa página no esté entre las que has subido: suele estar entre las cláusulas financieras, con un título como «Gastos», y dice quién paga la notaría, el registro, la gestoría, la tasación y los impuestos. Puedes añadirla con «Subir más documentos».',
    ]);
    expect(missingPageLines([], tr)).toEqual([]);
  });
});
