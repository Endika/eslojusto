import type { CivilDate } from '../engine/date';
import type { EmploymentDeps } from '../engine/employment/review';
import type { LetterKind } from '../documents/letter';
import type { PaidReview } from '../documents/ports';
import type { ClientKey } from '../i18n/client';
import { certificateRequest, companyLetter, employmentLetterKinds } from './letters';
import type { CompletedEmploymentReview } from './ports';
import { employmentReport } from './report';

const FILENAMES: Partial<Record<LetterKind, ClientKey>> = {
  information_request: 'client.employment.letter.information.filename',
  temporary_contracts_certificate: 'client.employment.letter.certificate.filename',
  employment: 'client.employment.letter.company.filename',
};

// A contract review as the pass sees it: offered with a concrete finding in every reading; it
// unlocks the detail, the report and the letter to the company when it has figures or points for
// it. The letter asking for the information owed in writing and the request for the certificate of
// temporary contracts only ask for information, so they need no pass. `today` is the day the review
// was worked out, and the tables are the ones it read.
export function employmentCase(
  r: CompletedEmploymentReview,
  today: CivilDate,
  tables: EmploymentDeps,
): PaidReview {
  const kinds = employmentLetterKinds(r, today, tables);
  return {
    offer: r.review.offerPass,
    letterKinds: kinds.paid,
    freeLetterKinds: kinds.free,
    report: (tr, day) => employmentReport(r, tr, day),
    letter: (kind, details, tr) =>
      kind === 'temporary_contracts_certificate'
        ? certificateRequest(tables, details, tr)
        : companyLetter(
            r,
            kind === 'employment' ? 'full' : 'information',
            today,
            tables,
            details,
            tr,
          ),
    filename: (document, kind) =>
      document === 'report'
        ? 'client.employment.report.filename'
        : ((kind && FILENAMES[kind]) ?? 'client.employment.letter.information.filename'),
  };
}
