import type { ReviewDeps } from '../types';
import { IGC } from './igc';
import { IPC } from './ipc';
import { IRAV } from './irav';
import { LEGAL_INTEREST } from '../../law/data/legal-interest';
import { NORMS } from './norms';

// Every table a review reads, as loaded in the repo; a composition root passes it to reviewRental.
export const RENTAL_TABLES: ReviewDeps = {
  norms: NORMS,
  indices: { irav: IRAV, ipc: IPC, igc: IGC },
  legalInterest: LEGAL_INTEREST,
};
