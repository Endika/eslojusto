// Interés legal del dinero, fixed for each calendar year by the State budget law.
export interface LegalInterestYear {
  readonly year: number;
  // % per year.
  readonly rate: number;
  readonly url: string;
}
