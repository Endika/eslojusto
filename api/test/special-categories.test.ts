import { describe, expect, it } from 'vitest';
import { hasSpecialCategory } from '../src/domain/special-categories';

describe('hasSpecialCategory', () => {
  it.each([
    'COMPLEMENTO IT',
    'COMPL. I.T. EMPRESA',
    'Prestación por incapacidad temporal',
    'Baja por enfermedad común',
    'Accidente de trabajo',
    'PRESTACIÓN MATERNIDAD',
    'Permiso de paternidad',
    'Nacimiento y cuidado de menor',
    'Hora de lactancia',
    'Riesgo durante el embarazo',
    'CUOTA SINDICAL',
    'Liberado del sindicato',
    'Afiliado a CCOO',
    'Delegado de UGT',
    'CC.OO.',
    'Discapacidad del 33 %',
    'Grado de minusvalía',
    'Diversidad funcional',
    'REGULARIZACIÓN EMBARGO',
    'Pensión alimenticia',
    'Baixa per malaltia',
    'gaixotasun arrunta',
    'SALUD LABORAL',
  ])('finds one in «%s»', (text) => {
    expect(hasSpecialCategory(text)).toBe(true);
  });

  it.each([
    'Plus de transporte',
    'Complemento de nocturnidad',
    'PLUS CONVENIO',
    'Salario base',
    'Horas extraordinarias',
    'Antigüedad',
    'Paga extra de verano',
    'Dietas y kilometraje',
    'Itinerario formativo',
    'Oficial de primera de mantenimiento',
    'Campaña de verano en el centro de Bilbao',
    'Convenio colectivo de oficinas y despachos',
    'Embarque de mercancías',
    'it is a fixed-term contract',
    'Lan-kontratu mugagabea',
  ])('finds nothing in «%s»', (text) => {
    expect(hasSpecialCategory(text)).toBe(false);
  });
});
