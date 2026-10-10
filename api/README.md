# eslojusto.es API

Three Lambda functions in **eu-south-2** behind function URLs:

| Function   | Does                                                                                           | Calls                                                   |
| ---------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `extract`  | Reads a pack of employment documents, says what each page is and returns the fields they state | Turnstile, Bedrock (EU profiles), Stripe for pass reads |
| `checkout` | Starts a Stripe Checkout for the 4,99 € pass                                                   | Turnstile, Stripe                                       |
| `pass`     | Verifies a finished Checkout Session and issues the signed pass, or verifies a pass            | Stripe                                                  |

Nothing is stored: documents live in the invocation's memory, the server keeps no state, and
logs carry only `op`, `code`, `latencyMs`, `pages`, `inputTokens`, `outputTokens`,
`escalated`, `retried`, `conflicts` (how many fields two documents stated differently), `readability` (how
many pages had each readability, only when a read set a page aside or found nothing) and three flags (`test/http.test.ts` proves it): `underestimated` when Bedrock
counted more than twice the input the pre-read estimate allowed for, `countNotSaved` when
a pass read went through but Stripe did not store its count, and `truncated` when an employment
or a credit read filled a list to its maximum; `verify` marks a `pass` request that
verified a pass. The manual calculator never calls this API.

```bash
npm ci
npm run format:check && npm run lint && npm run type:check && npm run test:run
npm run synth      # cdk synth with placeholder context; deploys nothing
```

## Contract

Every response is JSON with a `code` (`src/domain/results.ts`); the site translates codes, the
API never returns prose. All requests are `POST` with a JSON body.

**`extract`**

```jsonc
{
  "files": [{ "mediaType": "image/jpeg" | "image/webp", "data": "<base64>" }],
  "captchaToken": "<Turnstile token, widget action 'extract'>",
  "quota": "<token from the last free read, or null>", // free read
  "pass": "<pass token>", // or a pass read
  "review": "rental" // optional: "rental", "employment", "credit", "insurance", "mortgage", "electricity" or "telecom"; none is the final pay
}
```

`review` picks the schema, the prompt and the merge rules (`src/domain/reviews.ts`): absent, it
is `final_pay`, exactly as before the field existed (`test/fixtures/final-pay-tool-schema.json` and
`final-pay-prompt.txt` pin its schema and prompt, and the other reviews' fixtures beside them
pin theirs); `rental` reads a tenancy pack (below, «Rental review»), `employment` an employment
contract and the documents around it (below, «Employment review»), `credit` a consumer credit
pack (below, «Credit review»), `insurance` a home or motor policy and its renewal notice
(below, «Insurance review»), `mortgage` a mortgage deed and the bills around it (below,
«Mortgage review»), `electricity` household electricity bills and their contract
(below, «Electricity review») and `telecom` phone and internet bills and their contract (below,
«Telecom review»); anything else is `invalid_request`. Each review's system prompt
lives in a module of its own, `src/adapters/prompts/`. The log line carries `review` only when the request
named one.

The person never says what they upload: a read takes the whole pack (dismissal letter,
settlement notification, payslips, company certificate, agreement, work history, and pages
that matter to none of it) and the model sorts it. **Images only**, one per page, up to 25, in
any order: JPEG/WebP with the long side at most `MAX_IMAGE_LONG_SIDE`
(`src/domain/image-limit.ts`, 1568 px, checked from the image header). The browser renders a
PDF's pages to images with pdf.js before sending, so the API never parses a PDF and a read's
cost depends only on pixels it can measure; `application/pdf` is answered with
`unsupported_media_type`. One read that answers `ok` is one free read or one pass read, whatever it holds. Codes:
`too_many_files` (26 images), `image_unreadable`, `image_too_large`, `document_too_dense`
(a guard: no accepted pack reaches it).
`model_unavailable` (every model call failed, as when the budget action denies Bedrock) spends
neither a free read nor a pass read; the site then offers only the manual path for an hour.
`pass_unconfirmed` (a valid pass whose session Stripe does not find) reads and counts nothing;
the site keeps the pass and asks to try again.
`nothing_read` (422) is a read that yielded no field and no work-history row at all: it carries
each page's kind and readability, as `ok` lists them, and no values, and, like `model_unavailable`, spends neither a free read
nor a pass read, because the person got nothing for it. What bounds a run of them is what bounds
any read: a fresh captcha each time, the per-read cost cap, the reserved concurrency and the
budget action.

```jsonc
{
  "code": "nothing_read",
  // Every page the model classified; a page it did not is missing.
  "pages": [
    { "page": 1, "kind": "payslip", "readability": { "value": "blurry", "confidence": "high" } },
    // Legible, but with nothing the review uses.
    { "page": 2, "kind": "other", "readability": { "value": "ok", "confidence": "high" } },
  ],
}
```

**Payload budget.** Lambda takes at most 6 MB per synchronous request, event envelope
included, and the API refuses a body over 6 MiB. Base64 adds a third, so the browser keeps the
JSON under 5.8 MB (`requestBudgetBytes` in `src/documents/contract.ts`), shared out among the
images: each photo or PDF page is re-encoded as JPEG at falling quality (0.85, 0.75, 0.65, 0.5)
until it fits its share, and only when no quality does, at 1280 px (0.65, 0.5) and then 1100 px
(0.65 down to 0.3) on the long side (`encodingSteps` in `src/documents/files.ts`: on a page that
missed at 0.5, 0.75 weighs more than a shorter side saves). Measured in Chrome on synthetic pages:

| Page (long side 1568 px)            | 1568 px, 0.5 | 1280 px, 0.5 | 1100 px, 0.5 / 0.4 / 0.3 |
| ----------------------------------- | ------------ | ------------ | ------------------------ |
| Letter, 18-px text every 40 px      | 214 KB       | 160 KB       | 137 / 122 / 104 KB       |
| Dense, 18-px text every 28 px       | 322 KB       | 219 KB       | 181 / 159 / 136 KB       |
| Dense photo with heavy sensor noise | 529 KB       | 295 KB       | 230 / 197 / 162 KB       |

With 15 images the share is about 290 KB, so a letter keeps 1568 px (251 KB at 0.65) and only a
dense or noisy page drops to 1280. With 25 it is about 174 KB: a letter drops to 1280, a dense
page to 1100 at 0.4, and a noisy photo to 1100 at 0.3 (`tests/e2e/documents.spec.ts` checks that 25
noisy synthetic photos fit one request). So the long side is shortened by what each page weighs, not by how many there are,
and only on the pages that need it. 1100 px is the floor because a comparison on real packs found
phone photos read as accurately there as at 1568 px (small print at 1100 px is not proven); at
1100 px, 0.4 and 0.3 read as well as 0.5 by eye on 18-px and 13-px text, because the resize costs
far more than the quality. While it encodes, the browser says how far it got («Preparando 7 de
25…», at most every 500 ms), and it stops with `payload_too_large` as soon as what is left can't
fit even at the lighter of the last page's size and 40 KB (`cannotFit`), with a hint to remove a
photo or send a document as PDF, whose pages weigh less. If the pack still does not fit at the
end, the browser says the files are too heavy before sending anything.

`ok` answers:

```jsonc
{
  "code": "ok",
  "extraction": {
    // Every page the model classified, by number (1-based, in the order sent).
    "pages": [
      {
        "page": 1,
        "kind": "dismissal_letter",
        "document": 1,
        "readability": { "value": "ok", "confidence": "high" },
        "confidence": "high",
      },
    ],
    // Consecutive pages of one document, grouped; `month` only for payslips.
    "documents": [
      { "kind": "dismissal_letter", "pages": [1, 2] },
      { "kind": "payslip", "pages": [3], "month": "2026-08" },
      { "kind": "other", "pages": [4] },
    ],
    "fields": {
      "endDate": { "value": "2026-09-15", "confidence": "high", "source": "settlement_proposal" },
    },
    "lists": {
      "contracts": [
        { "values": { "startDate": "2019-01-07" }, "confidence": "high", "source": "work_history" },
      ],
    },
    // Fields two documents state differently: the first source is the one kept.
    "conflicts": [{ "field": "endDate", "sources": ["settlement_proposal", "dismissal_letter"] }],
  },
  "failedChecks": [], // coherence checks still failing after any escalation
  "escalated": false, // whether the escalation model read it too
  "allowance": "<free reads: the quota token to send next time>",
  "readsLeft": 11, // pass reads: what Stripe has left on the pass
}
```

Page kinds: `settlement_proposal`, `payslip`, `dismissal_letter`, `company_certificate`,
`settlement_agreement`, `work_history`, `other` (for instance an IRPF withholding
certificate). A field's `source` is any of them but `other`.

Readability of a final-pay read (`FINAL_PAY_READABILITY` in `src/domain/extraction-schema.ts`): `ok`, or the main reason a page
can't be used: `handwritten`, `blurry`, `dark`, `cropped`, `not_labour_document`,
`foreign_jurisdiction` (an employment document from another country, where Spanish law does not
apply) or `unknown_format`. Language is never a reason: the prompt names Spanish, Catalan,
Basque, Galician and English and says so (`test/languages.test.ts`, with hand-written fixtures in
each of them). An `ok` read can still list pages set aside; the site says which and why.

**`checkout`** `{ "nonce": "<22–64 url-safe random chars, kept in the browser>",
"captchaToken": "<Turnstile, action 'checkout'>", "returnTo": "rental" }` →
`{ "code": "ok", "sessionId": "cs_…", "url": "https://checkout.stripe.com/…" }`. Keep the
session id and nonce before redirecting; Stripe returns to
`/finiquito/?session_id={CHECKOUT_SESSION_ID}`, to `/alquiler/` with `"returnTo": "rental"`, to
`/contrato/` with `"returnTo": "employment"`, to `/financiacion/` with `"returnTo": "credit"`, to
`/hipoteca/` with `"returnTo": "mortgage"`, to `/facturas/luz/` with `"returnTo": "electricity"` or to `/facturas/permanencia/` with
`"returnTo": "telecom"` (`CHECKOUT_PATHS` in `src/config.ts`); any other `returnTo` is `invalid_request`, `insurance`
included: that review offers no pass. The pass is the
same product either way and unlocks every review.

**`pass`** `{ "sessionId": "cs_…", "nonce": "…" }` →
`{ "code": "ok", "pass": "<token>", "expiresAt": <epoch seconds>, "readsLeft": <n> }`. The
token is `v1.<payload>.<signature>`, the payload being base64url JSON
`{ "typ": "pass", "sid": "cs_…", "exp": <epoch seconds> }`; only the API can verify it. Asking
again with the same session and nonce returns the same pass, with the reads it really has left,
which is how «¿Ya has pagado?» works. A pass with no reads left still unlocks the report and
the letter until it expires.

**`pass`** `{ "pass": "<token>" }` (verify) → `{ "code": "ok", "expiresAt": <epoch seconds>,
"readsLeft": <n> }`, or `pass_invalid` (bad signature, not a pass, e.g. a free-read quota token,
or a session Stripe reports as unpaid), `pass_expired`, `pass_revoked` (refund, dispute or
cancelled payment), `pass_unconfirmed` (a validly signed, unexpired pass whose session Stripe does
not find: a rotated key, a test/live mix-up or an outage, so the browser keeps it and asks again)
and `payment_provider_unavailable`. The site asks before it shows the
detail of a review or builds the report or the letter. No captcha: it does no Bedrock work and
the function's reserved concurrency of 2 bounds it. Each container remembers a success for 60 s
by the token's SHA-256, so a refund can take that long to lock a page again; failures are never
remembered.

### Rental review

With `"review": "rental"` the model sorts a tenancy pack instead (`src/domain/rental-schema.ts`).
Page kinds: `lease`, `rent_update_notice`, `rent_receipt`, `agency_invoice`, `deposit_return`,
`other`; readability as above, with `not_rental_document` in place of `not_labour_document`
(`READABILITY` lists every reason of both reviews). Each kind is transcribed into its own section;
`src/domain/rental-merge.ts` takes every field from its only source, except `deposit`, from the
lease first and the deposit return second, with the same conflicts and discards as the final
pay, and carries every list row with its `source`:

| Section              | Fields                                                                                                                                                                                                                                                                                                                                    | Lists (most rows)                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `lease`              | `signedOn`, `startDate`, `postcode`, `landlordType`, `landlordCompanyName` (a company only), `agencyNamed`, `use`, `agreedMonths`, `initialRent`, `updateClauseText` (literal, ≤ 600), `updateClauseIndex`, `updateFixedPercent`, `deposit`, `advanceMonths`, `necessityClause`, `feesText` (literal, ≤ 300), `chargesClauseText` (≤ 600) | `guarantees` [`kind`, `amount`, `months`] (5), `charges` [`kind`, `annualAmount`, `concept`] (10), `utilities` [`kind`, `payer`] (6) |
| `rent_update_notice` |                                                                                                                                                                                                                                                                                                                                           | `notices` [`noticeOn`, `medium`, `percent`, `indexNamed`, `referenceMonth`, `previousRent`, `newRent`, `appliesFrom`] (8)            |
| `rent_receipt`       |                                                                                                                                                                                                                                                                                                                                           | `receipts` [`month`, `total`, `rent`, `community`, `propertyTax`, `waste`, `utilities`, `other`] (36)                                |
| `agency_invoice`     |                                                                                                                                                                                                                                                                                                                                           | `invoices` [`issuedOn`, `issuer`, `concept`, `conceptKind`, `base`, `vat`, `total`] (4)                                              |
| `deposit_return`     | `keysReturnedOn`, `deposit`, `closingDocumentSigned`                                                                                                                                                                                                                                                                                      | `returns` [`on`, `amount`] (4), `deductions` [`amount`, `kind`, `concept`] (10)                                                      |

The labels `use`, `landlordType`, `updateClauseIndex`, `conceptKind` and the `kind` of guarantees,
charges and deductions mirror the site's rental engine (`test/rental-contract.test.ts`). The model
copies a clause word for word and picks its label; it never says whether a clause is abusive or
valid or whether anyone agreed to it, which the person checks against the text. The prompt
tells the model not to record names of natural persons, DNI/NIE, signatures, account numbers,
phones or emails, and the landlord's name only for a company. The API does not take that on
trust: a `landlordCompanyName` beside any `landlordType` but `company` is dropped, and so is any
copied text (`updateClauseText`, `chargesClauseText`, `feesText`, `landlordCompanyName` or a
row's `concept`) that still holds a DNI/NIE, a Spanish IBAN, an email or a Spanish phone number
(`src/domain/identifiers.ts`), each as a discard, which makes the read doubtful. A person's name
inside a clause text has no pattern to catch it: only the length limits (600, 300 and 80
characters) bound what such a text can carry.

`failedChecks` for a rental read are coherence checks only, never findings
(`src/domain/rental-checks.ts`): `return_before_keys`, `receipt_parts_do_not_sum` (more than 1 €
apart), `invoice_total_mismatch` (base + VAT more than 0.05 € from the total),
`notice_rent_mismatch` (previous rent × (1 + %) more than 1 € from the new one) and
`start_long_before_signing` (over 31 days). A legible lease with neither `initialRent` nor
`signedOn` is worth a second read, as a failed check is.

### Employment review

With `"review": "employment"` the model sorts the pack of an employment contract
(`src/domain/employment-schema.ts`). Page kinds: `employment_contract`, `job_offer`, `payslip`,
`work_history`, the final pay's `settlement_proposal`, `dismissal_letter`, `company_certificate`
and `settlement_agreement` (labelled as always, with nothing read from them, so the site shows
them as pages without data) and `other`; readability as the final pay's. Payslips and the work
history get sections of their own, so the final pay's stay as they were:

| Section                   | Source                | Fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Lists (most rows)                                                                                                                                                                                                                                                  |
| ------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `employment_contract`     | `employment_contract` | `employerType`, `companyName` (a company only, ≤ 80), `companyTaxId` (a CIF), `workplaceRegion` (ISO 3166-2:ES), `signedOn`, `startDate`, `endDate`, `durationMonths`, `modalityText` (literal, ≤ 120), `modality`, `partTime`, `causeText` (literal, ≤ 600), `replacedPersonNamed` (never the name), `replacementCauseStated`, `category`, `agreementName` (≤ 160), `agreementCode` (REGCON digits only), `salaryAmount`, `salaryPeriod`, `annualSalaryAmount`, `payments`, `prorated`, `inKindAmount`, `weeklyHours`, `annualHours`, `scheduleText` (literal, ≤ 400), `shifts`, `night`, `complementaryPercent`, `complementaryNoticeDays`, `overtimeAgreed`, `overtimeHoursPerYear`, `holidayDays`, `holidayUnit`, `trialAmount`, `trialUnit`, `remoteShare`, `trainingType`, `studiesEndedOn`, `planAttached`, `effectiveWorkPercent` | `salaryParts` [`concept`, `amount`, `kind`] (12), `clauses` [`label`, `literal` ≤ 600, `months`, `compensationStated`, `trainingDescribed`, `waivedRight`, `costsOnWorker`] (10), `information` [`element` a–q, `presence`] (17), `relationshipHints` [`hint`] (3) |
| `job_offer`               | `job_offer`           | `position`, `salaryAmount`, `salaryPeriod`, `net`, `variable`, `weeklyHours`, `modality`, `remote`, `publishedOn`, returned as `offerPosition`, `offerSalaryAmount` and so on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                                                                                    |
| `employment_payslips`     | `payslip`             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `payslips` [`month`, `periodStart`, `periodEnd`, `daysWorked`, `incidents` (never which), `totalAccrued`, `partTimeCoefficient`, `agreementName`, `category`] (6, the most recent), `lines` [`month`, `concept`, `amount`, `category`] (60)                        |
| `employment_work_history` | `work_history`        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `contracts` [`startDate`, `endDate`, `employerType`, `employerName` and `accountCode` (C.C.C.), a company's only, `partTimeCoefficient` (per thousand)] (15, the most recent)                                                                                      |

`src/domain/employment-merge.ts` takes every field from its only source, except `agreementName`
and `category`, from the contract first and the most recent payslip that prints them second,
with the same conflicts and discards as the other reviews, and carries every list row with its
`source`. The line categories (`salary`, `fixed_complement`, `variable`, `overtime`,
`complementary_hours`, `in_kind`, `extra_pay`, `prorated_extra_pay`, `expenses`, `one_off`,
`other`) are summed by month on the site, which decides what counts against the minimum wage;
the model adds up nothing and copies no deduction. `modality`, the clause `label`, the salary
part `kind`, the information elements and the other closed lists mirror the site's employment
engine (`test/employment-contract.test.ts`); a special employment centre is no relationship
hint, since naming one would say something about the worker's health, and there is no contract
code (clave de contrato): some codes say the worker has a disability, and the engine does not
use them.

The model copies the cause, the modality, the schedule and each clause word for word, with
«[nombre]» in place of a person's name, and picks their labels; it never says whether a clause
is valid, whether the cause is justified or which agreement applies. The prompt tells it never
to record the name, DNI/NIE, NAF, address, phone, email, IBAN or signature of the worker or of
anyone else, nor disability, health, the kind of any leave, union membership or deductions; the
schema has no field for any of them (`test/employment-schema.test.ts` walks every field name and
description). The API does not take that on trust: a `companyName`, or a work-history
`employerName` and `accountCode`, beside any `employerType` but `company` is dropped;
`companyTaxId` takes a CIF only, `accountCode` an employer's eleven digits only and
`agreementCode` digits only; and any copied text (`causeText`, `scheduleText`, `modalityText`,
`companyName`, `category`, `agreementName`, `position`, a clause `literal`, a `concept`, an
`employerName`) that still holds a DNI/NIE, a Spanish IBAN or account number, an email, a
Spanish phone number or a Social Security number (`src/domain/identifiers.ts`) is dropped, each
as a discard. So is any of them but `agreementName` that holds a word about health, family leave,
union membership or debts (`src/domain/special-categories.ts`): incapacidad, enfermedad,
accidente, salud, maternidad, paternidad, nacimiento y cuidado, permiso nacimiento, lactancia,
embarazo, riesgo durante, discapacidad, minusvalía, diversidad funcional, sindical, sindicato,
afiliado, CCOO, UGT, CGT, embargo, retención judicial, pensión alimenticia, with their plurals and
feminine forms, the abbreviations «Inc. temporal», «cuota sind.» and «Emb. judicial», AT as a word
of its own in capitals, and the Catalan and Galician forms (incapacitat, afiliat, discapacitat,
embargament; incapacidade, enfermidade, maternidade, paternidade, discapacidade), as whole words
without case or accents; Basque adds its endings to the word, so its stems match as prefixes
(ezintasun, gaixotasun, amatasun, aitatasun, sindikatu, desgaitasun, bahiketa). IT or I.T.
counts only where it is leave: alone, after «Compl.», «Prest.», «Dif.», «Baja» and the like, or
before «EC», «CC», «AT», «Contingencias» or «Pago delegado»; «Técnico IT» stays. «Sin embargo»
and «afiliado a la Seguridad Social» do not count. An agreement's name says nothing about the
worker, even when it names a union, health or disability, so it is spared this list. A payslip
line or a salary part whose `concept` carries such a word keeps its amount and category and
loses only the concept, with no discard: the figure is still right, and the read no less sure.
The list errs on dropping: «accidente» in a safety clause or «Vigilancia de la salud» in a clause
take their text with them.

The lists are sized so that, all at their maximum, they fit in `max_tokens` (below, «Cost»):
past six payslips, sixty lines or fifteen work-history rows, the model is asked to keep the most
recent, and the API keeps the latest by `month` or `startDate` whatever order the rows came in
(`keepLatestBy` in the list's spec, never sent to the model; the final pay and the rental review
still keep the first rows).
The extraction carries `truncated: true` when the model filled a list to its maximum (counted on
what it sent, so a row that failed validation still counts; the seventeen information elements
are a whole list, not a cut): the documents may hold more rows than the response, and the site
says so. The log line carries the `truncated` flag and the dashboard counts it.

`failedChecks` for an employment read are coherence checks only, never findings
(`src/domain/employment-checks.ts`): `end_before_start` (the contract, a payslip's period or a
work-history row), `payslip_not_whole_month` (a period that is not the whole calendar month of
its payslip), `payslip_lines_do_not_sum` (a month's lines more than 1 € from its payslips' gross
totals), `hours_over_week` (over 80 a week, in the contract or the offer) and
`salary_period_mismatch` (a monthly salary times its payments more than 5 % from the annual one
the contract prints). A legible contract with neither `startDate` nor `salaryAmount` is worth a
second read, as a failed check is.

### Credit review

With `"review": "credit"` the model sorts a consumer credit pack (`src/domain/credit-schema.ts`).
Page kinds: `credit_agreement`, `credit_precontract_info` (the INE), `amortization_schedule`,
`early_repayment_statement`, `revolving_agreement`, `card_statement` and `other` (a mortgage, a
lease without a purchase option or a business loan is `other`). Readability as the rental
review's, with `not_credit_document` for a page about no consumer credit.

| Section                     | Fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Lists (most rows)                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `credit_agreement`          | `product`, `lenderName`, `intermediaryType`, `intermediaryCompanyName` (a company only), `agreedOn`, `principal`, `netDisbursed`, `cashPrice`, `goods`, `nominalRate`, `rateType`, `declaredApr`, `declaredTotalPayable`, `instalmentCount`, `instalmentAmount`, `firstDueOn`, `balloonAmount`, `balloonDueOn`, `agreedEndOn`, `insurancePremium`, `insuranceSingle`, `insuranceFinanced`, `insuranceRequired`, `earlyRepaymentClauseText` and `withdrawalClauseText` (literal, ≤ 600) | `charges` [`kind`, `concept`, `amount`, `how`] (8)                                                                                  |
| `credit_precontract_info`   | `deliveredOn` (returned as `precontractDeliveredOn`), `representativeExample`, `principal`, `nominalRate`, `declaredApr`, `declaredTotalPayable`, `instalmentCount`, `instalmentAmount`                                                                                                                                                                                                                                                                                                |                                                                                                                                     |
| `amortization_schedule`     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `schedule` [`dueOn`, `amount`, `interest`, `principal`, `balance`, `fees`] (96, the first)                                          |
| `early_repayment_statement` | `repaidOn`, `principalRepaid`, `interestSettled`, `compensationCharged`, `compensationConcept`, `premiumRefunded`, `agreedEndOn`, `paidByInsurance`, `discountLost`                                                                                                                                                                                                                                                                                                                    |                                                                                                                                     |
| `revolving_agreement`       | `lenderName`, `intermediaryType`, `intermediaryCompanyName`, `agreedOn`, `creditLimit`, `nominalRate`, `declaredApr`, `minimumPayment`, `minimumPaymentPercent`, `annualFee`, `paymentMode`                                                                                                                                                                                                                                                                                            | `charges` (8)                                                                                                                       |
| `card_statement`            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `statements` [`statementOn`, `balance`, `interest`, `payment`, `nominalRate`, `estimatedEndOn`, `totalToPay`] (12, the most recent) |

`src/domain/credit-merge.ts` takes the contract's figures first, then a revolving card's
contract, then the INE, so an INE that states another APR shows as a conflict; the INE's figures
are left out when it says they are a representative example rather than this credit's. The end
date comes from an early repayment statement before the contract. `product`, the charge `kind`
and `how` and `rateType` mirror the site's credit engine (`test/credit-contract.test.ts`). The
model copies and labels; it never works out an APR or a total, compares a rate with the Bank of
Spain's average or any limit, or says whether a clause or a charge is lawful: the site's engine
does all of that. The art. 16.2 mentions are not asked for: whether a mention is there is the
person's answer on the site.

The prompt tells the model never to record the name, DNI/NIE, address, phone, email, IBAN, card
number or signature of anyone, nor health, disability, illness or a health questionnaire of a
linked insurance (art. 9 GDPR). The API does not take that on trust: `intermediaryCompanyName`
beside any `intermediaryType` but `company` is dropped, and any copied text (`lenderName`,
`intermediaryCompanyName`, `goods`, the two clause texts, `compensationConcept`, a charge
`concept`) that holds an identifier, a payment card number, a number plate or a word about
health, leave, union membership or debts (the employment review's list) is dropped, each as a
discard. `test/free-text-guards.test.ts` walks every text field and list item of the credit and
the insurance schema, so a text added later cannot skip the guards.

The schedule keeps its first 96 rows (eight years of monthly instalments) and the card
statements the twelve most recent; `truncated: true` says a list came back at its maximum.
`failedChecks` are coherence checks only (`src/domain/credit-checks.ts`): `net_above_principal`,
`declared_total_mismatch` (the instalments and the last payment add up to more than the total
payable the contract states), `schedule_rows_do_not_sum` (a row's interest, capital and charges
more than 1 € from its instalment), `schedule_balance_jump` (a row's outstanding capital more
than 1 € from the previous one less the capital it repays), `repayment_after_end` and
`statement_total_below_balance`. A legible contract with neither its amount nor its
instalments, or a card contract with neither its limit nor its rate, is worth a second read.

### Insurance review

With `"review": "insurance"` the model sorts a home or motor policy and its renewal notice
(`src/domain/insurance-schema.ts`). Page kinds: `insurance_policy`, `insurance_renewal_notice`
and `other`; readability with `not_insurance_document`.

| Section                    | Fields                                                                                                                                                                                                                                                                                                                                     | Lists (most rows)                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `insurance_policy`         | `line`, `carCover`, `insurerName`, `intermediaryType`, `intermediaryCompanyName` (a company only), `concludedOn`, `effectiveOn`, `expiresOn`, `renews`, `premiumNet`, `premiumSurcharges`, `premiumTaxes`, `premiumTotal`, `proportionalRuleExcluded`, `proportionalRuleMarginPercent`, `channel`, `nonRenewalClauseText` (literal, ≤ 600) | `sumsInsured` [`kind`, `concept`, `amount`] (8) |
| `insurance_renewal_notice` | `noticeOn`, `noticeMedium`, `expiresOn`, `previousPremium`, `newPremium`, `coverChanges`, `changesText` (literal, ≤ 600)                                                                                                                                                                                                                   |                                                 |

`src/domain/insurance-merge.ts` takes `expiresOn` from the notice first, since it is about the
period that ends next, and everything else from its only source. `line` and `carCover` mirror
the site's insurance engine (`test/insurance-contract.test.ts`); life, health and funeral policies
are labelled so the site can leave them out. The model never works out a deadline or says
whether a notice came in time or a premium is fair. Names, identifiers, card numbers, number
plates and health stay out as in the credit review, with the same guards on every copied text
(`insurerName`, `intermediaryCompanyName`, the two literal texts, a sum's `concept`); the policy
number has no fixed shape, so only the prompt keeps it out.
`failedChecks`: `expiry_before_effect`, `notice_after_expiry` and `premium_parts_do_not_sum`
(net premium, surcharges and taxes more than 5 cents from the total). A legible policy or notice
with no `expiresOn` is worth a second read. The insurance review offers no pass, so no checkout
starts from it.

### Mortgage review

With `"review": "mortgage"` the model sorts a mortgage deed and the documents around it
(`src/domain/mortgage-schema.ts`). Page kinds: `mortgage_deed`, `notary_invoice`,
`registry_invoice`, `agency_invoice_mortgage`, `valuation_invoice`, `ajd_form` (modelo 600),
`fein`, `fiae`, `transparency_deed`, `prepayment_statement` and `other` (a purchase deed without a
loan, a property tax receipt); readability with `not_mortgage_document`.

| Section                   | Fields                                                                                                                                                                                                                                                                                                                                                                                                                                                | Lists (most rows)                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `mortgage_deed`           | `deedOn`, `lenderName`, `borrowerType`, `purpose`, `loanKind`, `principal`, `termMonths`, `rateType`, `fixedUntil`, `initialRate`, `index`, `spread`, `rateRevisionMonths`, `floorPercent`, `defaultRate`, `defaultMarginPoints`, `earlyTerminationInstalments`, `prepaymentOption`, `variablePrepaymentFeePercent`, `fixedPrepaymentFeePercent`, `openingFee`, `openingFeePercent`, `otherSetUpFee`, `transparencyActStated`, `handwrittenStatement` | `clauses` [`label`, `text` (literal, ≤ 1,500), `page`] (12, the first)                                |
| `notary_invoice`          |                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `notaryInvoices` [`invoiceOn`, `concept`, `mixed`, `base`, `vat`, `supplied`, `total`] (6)            |
| `registry_invoice`        |                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `registryInvoices` [`invoiceOn`, `concept`, `mixed`, `base`, `vat`, `total`] (6)                      |
| `agency_invoice_mortgage` |                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `agencyInvoices` [`invoiceOn`, `fee`, `vat`, `total`] (3), `agencySupplied` [`concept`, `amount`] (6) |
| `valuation_invoice`       |                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `valuationInvoices` [`invoiceOn`, `base`, `vat`, `total`] (3)                                         |
| `ajd_form`                |                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `ajdForms` [`concept`, `accruedOn`, `taxBase`, `amountPaid`, `paidOn`, `paidByLender`] (3)            |
| `fein`                    | `deliveredOn` (returned as `feinDeliveredOn`), `principal`, `initialRate`                                                                                                                                                                                                                                                                                                                                                                             |                                                                                                       |
| `fiae`                    | `deliveredOn` (returned as `fiaeDeliveredOn`)                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                       |
| `transparency_deed`       | `actOn` and `amountCharged` (returned as `transparencyActOn` and `transparencyActCharged`)                                                                                                                                                                                                                                                                                                                                                            |                                                                                                       |
| `prepayment_statement`    |                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `operations` [`on`, `kind`, `principal`, `feeCharged`, `feeConcept`, `premiumRefunded`] (6)           |

`src/domain/mortgage-merge.ts` takes the deed's capital and rate before the FEIN's, so a FEIN
that offered another capital shows as a conflict. A clause comes as a closed `label` (`floor_clause`,
`irph`, `euribor`, `default_interest`, `early_termination`, `rounding_up`, `opening_fee`,
`prepayment_fee`, `expenses_clause`, `insurance_required`) and its literal text, for the person
to confirm on the site; the model never says whether a clause is abusive, void or transparent,
who should pay a cost or whether a fee is above a limit: the site's engine does that. A notary or
registry invoice says whether it bills the loan or the purchase, one row per part when it prints
them apart and `mixed: true` when it does not, and a modelo 600 whether it taxes the loan or the
purchase. Rates and spreads take up to three decimals (Euríbor + 0,875). `borrowerType`,
`purpose`, `loanKind`, `rateType`, `prepaymentOption`, an operation's `kind`, a clause's `label`
and the invoice concepts (as `notary_…`, `registry_…` and `ajd_…`) mirror the site's mortgage
engine (`test/mortgage-contract.test.ts`).

A deed names its borrowers and guarantors, their documents and addresses, and a life insurance
it requires can bring in health. The prompt tells the model never to record any of it, nor the
notary's name; the API does not take that on trust: a copied text (`lenderName`, a clause's
`text`, an operation's `feeConcept`) that holds an identifier, a payment card number, a number
plate, a word about health, leave, union membership or debts, or a person's name after a
courtesy title as deeds write them («Don …», «D.ª …», `hasPersonTitle` in
`src/domain/identifiers.ts`) is dropped, each as a discard; a clause keeps its label without its
text. `truncated: true` says the clauses or another list came back at its maximum.

`failedChecks` (`src/domain/mortgage-checks.ts`): `invoice_parts_do_not_sum` (an invoice's base,
VAT and outlays more than 5 cents from its total; an agency's outlays count against its only
invoice), `invoice_mixes_purchase_and_loan`, `duplicate_supplied_amount` (an agency outlay for
the tax or the registry within 5 cents of a return or a registry invoice in the pack),
`ajd_purchase_not_loan` (a modelo 600 of the purchase) and `missing_key_page` (a legible deed
dated before 16-06-2019, or of no date read, without its expenses clause: the pages that carry it
were likely not sent; from that day art. 14.1.e Ley 5/2019 shares out the costs, so a later deed
needs no such clause). A legible deed with
neither `deedOn` nor `principal` is worth a second read, as a failed check is.

### Electricity review

With `"review": "electricity"` the model sorts household electricity documents
(`src/domain/electricity-schema.ts`). Page kinds: `electricity_bill`, `electricity_contract`,
`price_change_notice` and `other` (a gas or a phone bill is `other`); readability with
`not_electricity_document`. One read takes several bills: each is a document of its own, and a
pack of 25 pages holds a year of them.

| Section                | Fields                                                                                                  | Lists (most rows)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `electricity_bill`     |                                                                                                         | `bills` [`document`, `retailerName`, `market`, `invoiceNumber`, `issuedOn`, `dueOn`, `readingFrom`, `readingTo`, `billedDays`, `readingKind`, `supplyFingerprint`, `postcode`, `accessTariff`, `selfConsumption`, `contractedPowerP1`/`P2`, `maxPowerUsedP1`/`P2`, `tollsAndChargesPower`/`Energy`, `socialBonusFunding`, `socialBonusCategory`, `socialBonusPercent`, `socialBonusKwh`, `socialBonusAmount`, `excessPowerAmount`, `electricityTax{Base,Percent,Amount}`, `meterAmount`, `meterDays`, `meterPhase`, `exitPenaltyAmount`, `vat{Base,Percent,Amount}`, `total`, `commitmentEndOn`] (12, the most recent by `readingTo`); `powerLines` [`document`, `period`, `kw`, `price`, `unit`, `days`, `amount`] (24); `energyLines` [`document`, `period`, `kwh`, `price`, `amount`] (36); `otherLines` [`document`, `concept`, `kind`, `serviceLabel`, `amount`] (24) |
| `electricity_contract` | `signedOn`, `retailerName`, `priceType`, `durationMonths`, `renews`, `exitPenaltyText` (literal, ≤ 600) | `agreedPrices` [`term`, `period`, `price`, `unit`] (10); `services` [`concept`, `serviceLabel`, `amount`] (6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `price_change_notice`  | `sentOn` and `appliesFrom` (returned as `noticeSentOn`, `noticeAppliesFrom`), `separateFromBill`        | `priceChanges` [`term`, `period`, `before`, `after`, `unit`] (10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Every row of a bill's lists names its bill by `document`, the number the page list gives it.
Each bill stays a row of `bills`, so two bills are two periods and never a conflict. Unit
prices, kW and kWh keep every decimal the bill prints (a `decimal` field with `decimals`: six for
a price, three for kW and kWh, eight for the electricity tax rate). `market`, the periods, the
units, `accessTariff`, `selfConsumption`, `socialBonusCategory`, `meterPhase`, `serviceLabel` and
`priceType` mirror the site's bills engine (`test/electricity-contract.test.ts`). The model copies
and labels; it never works out a price, a tax, a total or the days of a period, compares any
figure with a regulated price or a tax rate, or says whether a charge is allowed or a service
was asked for: the site's engine and the person do.

**The supply code (CUPS) is a fingerprint only.** The schema asks for it as `supplyFingerprint`, a
field of type `fingerprint`; while the read is parsed, `src/domain/fingerprint.ts` normalises it
(upper case, without spaces, dots or dashes, without a border point's last two characters) and
keeps only the first 16 hex digits of its SHA-256, so the code itself never reaches the merge,
the response or the log, and two copies of one bill print the same fingerprint. A value that is
no CUPS fails validation like any other. The domain imports nothing, so SHA-256 is written out
there and `test/fingerprint.test.ts` checks it against `node:crypto`. The prompt asks for the
supply address's postcode only, and never for the IBAN, which is not in the schema. Any copied
text (`retailerName`, `invoiceNumber`, `exitPenaltyText`, a `concept`) holding an identifier, a
payment card number, a CUPS or a word about health, leave, union membership or debts is dropped
as a discard, as in the credit review; `test/free-text-guards.test.ts` walks this schema too.

`failedChecks` are coherence checks only (`src/domain/electricity-checks.ts`):
`period_end_before_start`, `days_mismatch` (`billedDays` other than the days between the
readings, the first not counted), `lines_do_not_sum` (a bill's power and energy lines, social
bonus funding less its discount, excess power, electricity tax, meter and other lines, less
discounts and refunds, more than 1 € from its VAT base; a bill with an exit penalty is left
alone), `vat_base_mismatch` (base plus VAT more than 1 € above the total, which may hold amounts
outside VAT) and `duplicate_bill` (the same fingerprint and readings twice: about what the person
sent, not how it was read, so it never calls for a second read). A legible bill that
yields no bill with its total, or a legible contract with neither `priceType` nor an agreed
price, is worth a second read. `truncated: true` says a list came back at its maximum.

### Telecom review

With `"review": "telecom"` the model sorts phone, mobile and internet documents
(`src/domain/telecom-schema.ts`). Page kinds: `telecom_bill`, `telecom_contract` and `other`;
readability with `not_telecom_document`.

| Section            | Fields                                                                                                                                                                                                                                                    | Lists (most rows)                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `telecom_bill`     |                                                                                                                                                                                                                                                           | `bills` [`document`, `operatorName`, `issuedOn`, `periodFrom`, `periodTo`, `vatAmount`, `total`] (12, the most recent); `lines` [`document`, `concept`, `kind`, `from`, `to`, `amount`] (60) |
| `telecom_contract` | `signedOn`, `operatorName`, `commitmentStartsOn`, `commitmentMonths`, `agreedPenalty`, `penaltyText` and `priceReviewText` (literal, ≤ 600), `handsetSubsidised`, `handsetValue`, `priceReviewIndex` (`ipc`, `ipc_plus`, `fixed_amount`, `none`, `other`) |                                                                                                                                                                                              |

A line's `kind` is `fixed_fee`, `premium_rate`, `third_party`, `penalty`, `handset`, `discount` or
`other`. `priceReviewIndex` mirrors the site's bills engine (`test/telecom-contract.test.ts`); the
literal clause travels beside it so the person can check the label. The model never works out a
penalty or the days left of a commitment, or says whether a commitment, a penalty, a price rise
or a charge is allowed. The prompt keeps out the holder, every number called, customer and
contract numbers and the IMEI; copied texts carry the credit review's guards but number plates,
and drop an IMEI that slips through.
`failedChecks`: `period_end_before_start` (a bill's or a line's) and `lines_above_total` (a
bill's charges less its discounts more than 1 € above its total). A legible contract with no
commitment, penalty or price clause, or a legible bill that yields no bill, is worth a second
read.

### Fields and the site's engine

The model transcribes each kind of document into its own section of the tool input
(`src/domain/extraction-schema.ts`), so every value keeps the document it came from; the domain
then merges them (`src/domain/merge.ts`), taking each field from the first source that states it:

| Field                                                                                                                                           | Sources, preferred first                                                                                                                              | Fills                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `startDate`                                                                                                                                     | settlement proposal, final payslip, monthly payslip, company certificate                                                                              | `FinalPayInput`                                   |
| `endDate`                                                                                                                                       | settlement proposal, dismissal letter, company certificate, agreement                                                                                 | `FinalPayInput`                                   |
| `cause`                                                                                                                                         | agreement (it can acknowledge a dismissal as unfair), settlement proposal, dismissal letter, company certificate                                      | `FinalPayInput`                                   |
| `fixedTermType`                                                                                                                                 | settlement proposal, company certificate, dismissal letter                                                                                            | `FinalPayInput`                                   |
| `monthlySalary`                                                                                                                                 | settlement proposal, only if printed as such                                                                                                          | `FinalPayInput`                                   |
| `pending_salary`                                                                                                                                | final payslip (sum of its salary lines), settlement proposal, dismissal letter                                                                        | `EmployerFigures` by `ItemId`                     |
| `holiday_pay`, `extra_pay`, `employer_notice`, `notice_deduction`                                                                               | settlement proposal, final payslip (nómina de liquidación), dismissal letter                                                                          | `EmployerFigures` by `ItemId`                     |
| `severance`                                                                                                                                     | the same                                                                                                                                              | `EmployerFigures`                                 |
| `agreementSeveranceTotal`                                                                                                                       | agreement, only if it states the total severance as one figure                                                                                        | shown beside the unfair-dismissal reference       |
| `annualHolidayDays`, `holidayDaysTaken`                                                                                                         | settlement proposal, final payslip, only if printed                                                                                                   | `FinalPayInput`                                   |
| `noticeDaysReceived`                                                                                                                            | dismissal letter: days of notice actually given before the end date (0 when the dismissal takes effect the day it is notified and the notice is paid) | `FinalPayInput`                                   |
| `noticeDaysPaid`                                                                                                                                | dismissal letter: days of notice paid instead of given                                                                                                | not prefilled                                     |
| `payslipPeriodStart`, `payslipPeriodEnd`, `payslipTotalAccrued`, `extraPayProrated`, `extraPayProratedAmount`, `extraPayPaid`, `extraPayAmount` | the latest ordinary payslip of one whole calendar month                                                                                               | `monthlySalary` and the extra-pay answers (below) |
| `contracts[].startDate`, `endDate` (a list)                                                                                                     | work history                                                                                                                                          | `OtherContracts.contracts` (`ContributionPeriod`) |

**Payslips are copied line by line.** For each earnings line the model copies the concept as
printed, its amount and what it pays for: `salary` (base salary, pluses and allowances for the
days of the period, prorated extra pay, teleworking or transport paid as earnings),
`notice_compensation`, `severance`, `holiday_pay`, `extra_pay` (a full extra payment),
`one_off` (bonus, study aid, backpay) or `other`. The code then adds them up, in cents: on the
final liquidation payslip, `pending_salary` is the sum of the `salary` lines, and
`employer_notice`, `severance`, `holiday_pay` and `extra_pay` the sums of their categories; on
the monthly payslip, `extraPayPaid` and `extraPayAmount` come from its `extra_pay` lines. A
settlement proposal still comes first wherever it prints the amount, except for
`pending_salary`: the final payslip's salary lines win, because a settlement notification often
names the month's salary without an amount of its own (the model then borrowed a one-off line's
amount, or wrote 0). A settlement is asked for each item's own printed amount only, and for its
totals as `totalGross` and `totalNet`; the items are checked against a gross total only, since a
net one has deductions off and may hold tax-exempt severance. The model never adds
anything up: asked for the salary pending, it had returned the base salary alone, a one-off
line, a total with notice in it, or 0. The lines stay inside the API; the response carries only
the merged fields.

A section counts only if a readable page of its kind backs it (either payslip section needs a
`payslip` page whose readability is `ok`); one that does not is dropped and counts as a doubt, so
an agreement «read» from a pack whose pages are all `other`, or from a page set aside as blurry,
never reaches the form.

A losing value that is less than sure of itself (`medium` or `low`) is no conflict: it is dropped
and counts as a doubt, so a stray amount the model copied without conviction never shows the
person a disagreement that does not exist.

Two sources of different kinds that state different values (amounts more than 1 € apart) make a conflict: the
preferred value stays and the response lists the field with its sources, preferred first; the
log line counts them and says nothing else. Two payslips that disagree are no conflict: the
person would read «los documentos no dicen lo mismo» about a single kind of document. A conflict is not a doubt: documents can disagree
and both be read right, so it never escalates. Totals and gross lines feed the coherence checks
only. What an agreement offers is never taken as the final pay's severance: it travels as
`agreementSeveranceTotal`, and the site shows it next to the unfair-dismissal reference with no
verdict.

The engine's `monthlySalary` includes the prorated share of extra payments when they are
prorated. So, for a payslip whose `payslipPeriodStart` and `payslipPeriodEnd` are the first and
last day of the same month, the UI proposes:

- `extraPayProrated` true: `monthlySalary` = `payslipTotalAccrued`;
- otherwise: `payslipTotalAccrued` minus `extraPayAmount` when `extraPayPaid` is true (a full
  extra payment paid that month), or `payslipTotalAccrued` alone.

For any other period it proposes no salary, and a printed `monthlySalary` comes first. The
model never calculates: a derived value is the UI's proposal, confirmed by the person.

## Architecture

```
src/
  config.ts       region, models, names: shared by code and infrastructure
  domain/         schemas, validation, coherence, escalation, allowance and pass rules, ports
  http/           function-URL events to use cases and back; logging
  adapters/       Bedrock, Stripe, Turnstile, HMAC, SSM, clock, console logger
  handlers/       one composition root per function
infra/            CDK app: ApiStack (eu-south-2) and GlobalStack (IAM, Budgets)
test/             vitest; synthetic documents, fakes, Bedrock-shaped response fixtures
```

`eslint.config.js` enforces the hexagon: the domain imports only itself, `http/` only the
domain, adapters never reach `http/` or `handlers/`, and the infrastructure reads only
`src/config.ts`.

### Extraction

- **InvokeModel with the Messages body**, through `@aws-sdk/client-bedrock-runtime` and the
  `bedrock:InvokeModel` permission.
- One tool with a closed JSON schema (`additionalProperties: false` at every level), forced
  with `tool_choice` where the model allows it: the kind and document number of every page,
  then one optional section per kind of document. A fixed system prompt treats the documents
  as data, never instructions, and forbids recording union dues, sick leave or third parties.
  It reads documents in Spanish, Catalan, Basque, Galician or English, gives every page a
  readability, and records nothing from a page it sets aside.
  The person's request contributes only the image bytes; the request numbers each image as a
  page before it («Page 3:»).
- The output is validated in the domain (hand-written, because the domain imports nothing):
  any field or row with an invalid value, an unknown confidence or an extra key is dropped and
  counted, never repaired. Keys outside the schema are ignored.
- **Escalation by doubt**: a `low` confidence anywhere (a page's kind included), a dropped
  page, field or row, a page left unclassified, no tool output, or a failed coherence check
  (items not adding up to the total within 1 €, impossible or inverted dates, also between two
  documents, proration above the total) re-reads the pack with `ESCALATION_MODEL`, whose read
  wins. Also when the pack falls short of what it should give: a dismissal letter or a final
  payslip present but no settlement figure and no salary line read; payslip lines without
  `extraPayProrated`; or any page set aside as `other` in a pack with a dismissal letter,
  no settlement and no final payslip beside it (a cheap re-check, since that page may be the
  settlement itself; an IRPF certificate beside a complete pack triggers nothing). Only readable
  pages count here: a stronger model can't fix a blurry photo. Same path with or without a pass. Equal constants mean no escalation. A pack with
  nothing useful in it is an answer: `nothing_read`, with each page's readability.
- **Provider errors.** Every Bedrock error throws, a `ValidationException` included: the request
  is fixed, so it means a retired, disabled or misconfigured model, never a bad document. A
  failed primary read goes to the escalation model; if that fails too, the answer is
  `model_unavailable`. An escalated read replaces the primary only if it recorded something.
- **Malformed tool input.** A section sent as a string of JSON instead of an object, or pages
  that are not a list, is refused, never parsed or repaired; Sonnet 4.6 has done it with legible
  contracts. The same model then gets one corrective retry: the same request, its own tool call
  and a `tool_result` error naming the malformed parts (schema names only, nothing a document
  said), and the retry replaces the read only if it comes back whole. It is logged as `retried`
  and takes the place of the escalation: a request makes one second read at most. It starts only
  before `NO_ESCALATION_AFTER_MS`, only when both reads together stay within 96,000 input tokens
  (Bedrock's own counts, plus 500 for the correction) and its `max_tokens` is what the first read
  left, at least as much as the first read wrote: both reads cost no more than the worst case of
  one (below, «Cost»). Strict tool use (`strict: true`), which would rule this out at the source,
  allows 24 optional parameters across a request's schemas, and each review's schema has more
  than 50 (`test/tool-schema.test.ts`).
- Models (`src/config.ts`): every read is **Sonnet 4.6 alone**: `PRIMARY_MODEL` and
  `ESCALATION_MODEL` are both `SONNET_4_6`, and equal constants turn escalation off. The
  escalation path and its tests stay: `PRIMARY_MODEL = HAIKU_4_5` brings back Haiku first and
  Sonnet for doubtful reads, and the IAM scope follows whichever models the two constants name.
  Sonnet 5.5 is one line away (`SONNET_5_5`, unpriced here); its settings already use
  `tool_choice: auto` and more output room, because it rejects forced tool use and thinking is
  on by default there. No request sends `temperature`, which Sonnet 5.5 rejects.

- **Time.** The function has 180 s (`EXTRACT_TIMEOUT_SECONDS`). Every Bedrock call carries an
  abort signal that fires 160 s after the request started, retries included (the client makes
  at most one retry), and a second read never starts after 90 s, since it can take as long as
  the first. That leaves 20 s to count a pass read and answer. A pass read is counted only once
  the answer is ready, so a read that fails or runs out of time costs nothing. The browser
  waits 240 s, a minute more than the function, for the upload; if it gives up anyway (an
  uplink slower than about 100 KB/s with a full 5.8 MB pack), a read the API finished is still
  counted, and the person sees an error with one pass read fewer.

### Order of checks

Cheapest first, and nothing that parses what the person sent runs before the captcha:

1. Counts, byte sizes and magic bytes; the allowance token's signature and dates.
2. **Turnstile.** Siteverify refuses a token it has seen and must report hostname
   `eslojusto.es` and the endpoint's action, so every read and every checkout costs a fresh
   challenge.
3. Image headers and the input-token estimate.
4. For a pass, the Checkout Session in Stripe (paid, not refunded or disputed, reads left).
5. The model reads.

### Bounding the cost of a read

- **The input is known before any call.** Every image is priced by its pixels, at
  w × h / 750 tokens (Anthropic's formula) or one per 28 × 28 patch if that is more, and the
  prompt and schema at 14,000 for the final pay, the employment, the credit and the mortgage
  review, 11,000 for a rental and an electricity review, 8,000 for an insurance review and 6,000
  for a telecom review (about 27,000, 28,000, 28,000, 28,000, 21,000, 20,500, 14,000 and 11,500
  characters at two per token,
  `PROMPT_TOKENS_BY_REVIEW`; `test/tokens.test.ts` keeps them honest). Bedrock's CountTokens does not serve Claude models
  offered only through cross-Region profiles, so this is computed, not asked. The largest pack
  the API accepts, twenty-five 1568 × 1568 images, comes to 14,000 + 25 × 3,279 = 95,975 (92,975
  for a rental review); above
  **96,000** the answer would be `document_too_dense`. Nothing in an image can add tokens
  beyond its pixels, which is why PDFs are rendered in the browser instead of read here: a PDF
  can hide text from any measure short of a full reader.
- **With Haiku reading first** (not the default), no escalation above 43,000 real input tokens
  (Bedrock's own count from the primary read), nor, when the primary read failed, above that
  estimate.
- **Image tokens grow with the pixels.** A 1176 × 1568 photo is about 2,459 tokens; at 1100 px
  on the long side (825 × 1100) it would be about 1,210. Anthropic documents that Claude scales
  an image down first when it is over about 1,600 tokens (about 1.15 megapixels), so a 1568-px
  photo is likely read, and billed, at about 1,600; the estimate does not count on that. On phone
  photos 1100 px read as accurately as 1568 px; on small print that is still open, so the browser
  keeps 1568 px whenever the request has room (above, «Payload budget»).
  `MAX_IMAGE_LONG_SIDE` changes both the browser and the API in one line. A PDF page costs the
  same as a photo of it: the browser renders it at the same size.

### Limits without storage

- **Free reads** are counted in an HMAC-signed `{ day, used }` token (UTC day): the third read
  of the day with it is refused. **Weakness, stated plainly:** a browser that drops or replays
  the token, or opens a private window, starts over. The captcha, the per-read cost bound,
  reserved concurrency and the budget action are what actually cap spend.
- **Pass reads** are counted by Stripe: the Checkout Session's `metadata.reads_used`, read
  before each pass read and written after it. Re-requesting the pass cannot reset it, and the
  16th read is refused. Two reads racing on the same pass can both count as one
  (read-modify-write, at most the reserved concurrency of 5 at once); a failed write errs in
  the person's favour. Anything in that key other than a small integer counts as spent.
- **Revocation:** each pass read and each `pass` request (issue or verify, outside the 60 s
  verify memo) retrieves the session with its
  PaymentIntent and latest charge; a refund (even partial), a dispute or a cancelled payment
  answers `pass_revoked`. A 100 % promotion code has no payment to revoke.

### Payments

`checkout` creates a `payment`-mode session for the configured Price, filtered to card and
Bizum (`allowed_payment_method_types`, which works with the Dashboard's dynamic methods as
Bizum requires), with promotion codes allowed and an idempotency key per nonce. `pass`
retrieves the session with its line items and checks the nonce, `complete` status, a
`payment_status` other than `unpaid` (so 100 % promotion codes work), EUR, exactly one line of
the configured Price at 499 cents, and a payment less than 7 days old. There is no other way
to obtain a pass: testing without paying is Stripe test mode, or a 100 % promotion code with
`max_redemptions` and `expires_at` in live mode.

`checkout` also needs a fresh Turnstile token (action `checkout`). Not handled yet: the 21 %
tax rate and invoices (pending the gestoría).

## Infrastructure

**CDK, not SAM.** The stacks are TypeScript next to the code they deploy, the tests assert on
the synthesized templates with vitest, and SAM would add a Python CLI and still need raw
CloudFormation for Budgets actions. CDK needs a bootstrap stack (an S3 bucket that holds only
the function bundles, never user data).

**Function URLs, not HTTP API.** Function URLs exist in eu-south-2 (the regional endpoint
`*.lambda-url.eu-south-2.on.aws` resolves; it does not for regions without them), cost
nothing, and their timeout is the function's. HTTP API cuts at 30 s, far too close for a primary
read plus an escalated read of a 25-page pack (the function's timeout is 180 s). Throttling comes from reserved concurrency (429
beyond it: 5 for `extract`, 2 each for `checkout` and `pass`); CORS allows only
`https://eslojusto.es`.

**Two stacks.**

- `EslojustoApi` (eu-south-2, deployed by CI): the three functions on `nodejs24.x` (newest GA
  runtime; Node 26 is in preview) arm64, their URLs and log groups (14 days), the
  `eslojusto-api` dashboard and the alerts. No IAM, no storage: tests prove the template holds
  only Lambda, Logs, CloudWatch and SNS resources, and names no other region.
- `EslojustoApiGlobal` (deployed by hand, once, through eu-west-1 because CloudFormation in
  eu-south-2 has no `AWS::Budgets::*` types; every resource in it is global): the three
  execution roles, the budget and its action, the GitHub OIDC provider and deploy role, and the
  CloudFormation execution policy. Keeping IAM here means CI can neither create roles nor widen
  them.

Execution roles: `extract` may `bedrock:InvokeModel` on the EU inference profiles of the
configured models (today only Sonnet 4.6) and on their foundation models in the six EU regions the profiles route to, only through those
profiles (`bedrock:InferenceProfileArn` condition), plus `ssm:GetParameter` on the token key,
the Turnstile secret and the Stripe restricted key (passes count their reads in Stripe).
`checkout` reads the restricted key and the Turnstile secret; `pass` the restricted key and the
token key. No function can read the account's full Stripe secret key: it is in no parameter
the roles reach, and the adapter refuses any key that is not `rk_…`. Each may
write only to its own log group (`log-group:NAME` and `log-group:NAME:*`). The budget action's
role can be assumed by Budgets only on behalf of this account (`aws:SourceAccount`).

**Dashboard** `eslojusto-api` (`infra/dashboard.ts`, CloudWatch in eu-south-2, 24 h by
default): a header with links to Live Tail, the log groups, Lambda monitoring, the budget and
Cost Explorer, and what «bien» looks like; the last 24 h in figures (reads, Lambda errors,
throttles, `extract` p95, estimated AI cost); Lambda per function (invocations, errors,
throttles and 5xx, p50/p95 duration, concurrency against the account's 10); Bedrock through
`SEARCH` over `{AWS/Bedrock,ModelId}` (the EU profile id, e.g.
`eu.anthropic.claude-haiku-4-5-20251001-v1:0`), so a new model shows up without a change; and
Logs Insights widgets over the one-line log: `extract` codes over time and in a table,
`checkout`/`pass` codes, `escalated`/`retried`/`underestimated`/`countNotSaved` counts, pages, tokens
and latency percentiles; «Lecturas sin datos por motivo», a table of `nothing_read` reads per
day with how many pages had each readability, and «% lecturas sin datos (24 h)», the share of
answered reads (`ok` plus `nothing_read`) that found nothing. Log widgets follow the
dashboard's range, 24 h by default, so that share covers whatever range is chosen. The AI cost is tokens × `MODEL_PRICES_USD_PER_MTOK` for the
configured models; synth fails if a configured model has no price. It charts only AWS metrics
and inline queries, with the alarms' state on top.

**Alerts** (`infra/alarms.ts`): five standard alarms email the `eslojusto-api-alerts` SNS topic
on ALARM and again on OK, missing data counting as fine. Thresholds catch repeated failures,
not a single one:

| Alarm                              | Fires when                                                                |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `eslojusto-api-payments-errors`    | `checkout` + `pass` Lambda errors and 5xx answers ≥ 2 in 15 min           |
| `eslojusto-api-extract-errors`     | `extract` Lambda errors (crash, timeout) ≥ 3 in 15 min                    |
| `eslojusto-api-extract-5xx`        | `extract` 503s (`model_unavailable`, `service_unavailable`) ≥ 3 in 30 min |
| `eslojusto-api-extract-no-success` | ≥ 5 calls to the primary model in 1 h and not one `ok` read               |
| `eslojusto-api-throttles`          | ≥ 1 throttled invocation on any function in 5 min (account limit: 10)     |

Lambda counts a function URL's own 5xx answers in `Url5xxCount`, which is free, so no log
filter is needed for `model_unavailable`. The one metric filter, `Eslojusto/Api ExtractOk` on
the `extract` log group, exists because no AWS metric counts successful reads. Bedrock's
`Invocations` for the primary model count the attempts, so console playground calls count too.
`countNotSaved` and `pass_revoked` have no alarm: each would need a filter of its own; the
dashboard counts them. Neither has `nothing_read`: a rate alarm needs its own metric filter and
two more alarm metrics, past the free 10, and a run of reads where nothing is read already trips
`extract-no-success`, which counts only `ok` reads as a success on purpose: that is what a broken
prompt or model looks like. The address comes from the `alertEmail` context, which CI takes from the
repository variable `ALERT_EMAIL`; without it the topic exists with no subscribers.

**Budget**: 10 USD a month on the whole account (Claude on Bedrock is billed through AWS
Marketplace, so a Bedrock service filter would miss it; Budgets are in USD, and 10 USD stays
under the 10 € cap), emails at 50/80/100 % of actual spend, and at 100 % an automatic action
attaching `eslojusto-api-deny-bedrock` to the `extract` role.

## Deploying (once, in this order)

Nothing here has been run. Each step needs an account administrator.

1. **Lambda concurrency quota.** The account allows 10 concurrent executions, and Lambda keeps
   100 unreserved. The functions reserve 5 + 2 + 2 = 9, so the deployment fails until the quota
   is at least 109. Request it in Service Quotas (`L-B99A9384`, eu-south-2). Until it is
   granted, set the repository variable `RESERVE_CONCURRENCY=false`: nothing is reserved and
   the account-wide limit of 10 caps all three functions instead.
2. **Bedrock, eu-south-2.** Submit Anthropic's use-case form once in the console. Set data
   retention to none (on 07-10-2026 it reads `inherit`), so a model that would retain data is
   blocked instead:
   `aws bedrock put-account-data-retention --mode none --region eu-south-2`, then check
   `aws bedrock get-account-data-retention --region eu-south-2`. Model invocation logging must
   stay off: `aws bedrock get-model-invocation-logging-configuration --region eu-south-2`
   prints nothing (true on 07-10-2026). Invoke Sonnet 4.6 (and Haiku 4.5 if it goes back to reading first) once from the console
   playground so the Marketplace subscription exists; the execution role has no Marketplace
   permissions.
3. **Stripe restricted key** (Dashboard → Developers → API keys → Create restricted key), with
   exactly: **Checkout Sessions: Write** (create, retrieve with line items, update metadata),
   **PaymentIntents: Read** and **Charges: Read** (refund and dispute checks); everything else
   None. One key serves all three functions; the full secret key never leaves the Dashboard.
4. **Parameters** (SecureString, default `aws/ssm` key, eu-south-2):
   `/eslojusto/api/stripe-restricted-key`, `/eslojusto/api/token-hmac-key` (at least 32
   random bytes, e.g. `openssl rand -base64 48`), `/eslojusto/api/turnstile-secret-key`.
5. **Global stack:** `npx cdk deploy EslojustoApiGlobal -c stripePriceId=price_… -c alertEmail=<you>`.
   Accept the budget-alert subscription email.
6. **Bootstrap eu-south-2** with the policy from step 5 as CloudFormation's only permission:
   `npx cdk bootstrap aws://<account>/eu-south-2 --cloudformation-execution-policies <CfnExecutionPolicyArn>`.
7. **GitHub:** create the `production` environment with yourself as required reviewer and
   deployments limited to `main`; set the variables `AWS_DEPLOY_ROLE_ARN` (step 5 output) and
   `STRIPE_PRICE_ID`, and `ALERT_EMAIL` for the alarms. The deploy role trusts only
   `repo:Endika@568585/eslojusto@1407967362:environment:production`.
8. **Approve** the `Deploy API` run, then give the three function URLs (stack outputs `extractUrl`, `checkoutUrl`,
   `passUrl`) and the
   Turnstile site key to the site. Confirm the SNS subscription email ("AWS Notification -
   Subscription Confirmation") that arrives after the first deploy with `ALERT_EMAIL` set: until
   then the alarms change state but email nobody.
9. **Before going live, in Stripe test mode with the restricted key:** create a session through
   `checkout`, pay it with `4242 4242 4242 4242`, redeem it through `pass`, and make one pass
   read. Then check in the Dashboard that the session's metadata reads `reads_used: 1`. That
   single call confirms both that Stripe accepts a metadata update on a `complete` session and
   that the restricted key's permissions are enough (if creating the session fails, add
   **Prices: Read**). If the log shows `countNotSaved`, passes are not being counted.

**Changing what CI deploys.** The CloudFormation execution policy lists exactly what
`EslojustoApi` may hold, so a new kind of resource there needs the global stack redeployed
first (step 5, same command) by an administrator. The dashboard and the alerts are such a
change: until `eslojusto-api-cfn-execution` allows the `dashboard/eslojusto-api` dashboard, the
`eslojusto-api-alerts` topic and the `alarm:eslojusto-api-*` alarms (metric filters on the log
groups were already covered by `logs:*`), the `Deploy API` run fails and rolls back.

## Cost

Fixed: about 0 USD a month. Function URLs, idle Lambdas, standard SSM parameters and the first
two budgets with actions cost nothing; the bootstrap bucket holds about 1 MB; logs are a few
KB a day. The dashboard is within CloudWatch's free tier (3 dashboards of up to 50 metrics; a
test keeps it under 50, and it is the account's only one) and reads only free AWS metrics; its
Logs Insights widgets bill 0.0057 USD per GB scanned each time the page loads or refreshes, and
14 days of these logs are well under 1 MB. The alarms use 9 alarm metrics, within the free 10
(a test keeps them there); the `ExtractOk` metric is one custom metric, within the free 10, and
otherwise about 0.30 USD a month at most, prorated by the hours it receives data; alert emails
are free up to 1,000 a month.

Per read, from the eu-south-2 Price List (07-10-2026): Sonnet 4.6 at 3.30 / 16.50 USD per
million input / output tokens (EU profile); Haiku 4.5, if it reads first again, at 1.10 / 5.50
(`MODEL_PRICES_USD_PER_MTOK` in `src/config.ts`, which the dashboard's cost estimate reads).
`max_tokens` is 5,000 (a 15-page pack records about 1,500–2,500 tokens, each further page adds its
entry to the page list, and a long work history takes up to
4,000), and `test/tokens.test.ts` recomputes the bounds below from the constants.

| Read, Sonnet 4.6 alone                    | Input tokens    | Output tokens        | Cost                         |
| ----------------------------------------- | --------------- | -------------------- | ---------------------------- |
| Typical, 8 photos                         | ~21,000         | ~1,500               | 0.069 + 0.025 = **0.09 USD** |
| Full pack, 15 photos                      | ~32,000         | ~2,000               | 0.106 + 0.033 = **0.14 USD** |
| Largest pack, 25 photos                   | ~48,000         | ~2,500               | 0.158 + 0.041 = **0.20 USD** |
| Largest pack accepted, 25 × 1568 × 1568   | 95,975          | 5,000 (`max_tokens`) | 0.317 + 0.083 = **0.40 USD** |
| Were Haiku to read first: worst escalated | 43,000 + 43,000 | 5,000 + 5,000        | 0.075 + 0.225 = 0.30 USD     |

"Typical" counts 1,600 tokens per photo, as if Claude scales them down (above), plus about
8,000 for the prompt and schema; were every pixel billed, 15 phone photos (1568 × 1176) would
be about 44,900 in, 0.18 USD, and 25 about 69,500 in, 0.27 USD. A pack over 15 that the browser
had to send at 1280 or 1100 px (above, «Payload budget») costs less, not more.

A rental read has the same bounds: up to 25 images and `max_tokens` 5,000, with a smaller prompt
(11,000 tokens), so its largest pack, 25 × 1568 × 1568, is 92,975 in and 0.39 USD, and its worst
case is the same **0.40 USD** with Sonnet 4.6. A contract runs to 6–20 pages; with its notices and
receipts a pack fills the 25. If rental reads stop at `max_tokens` (36 receipts and long clause
texts are the largest records), raise `maxTokens` and this bound with it.

An employment read takes the same input bound (its prompt is 14,000 tokens, so its largest pack
is also 95,975) and 7,000 more output tokens (`EXTRA_OUTPUT_TOKENS_BY_REVIEW` in
`src/domain/tokens.ts`): `max_tokens` is 12,000 with Sonnet 4.6 and Haiku 4.5, and 23,000 with
Sonnet 5.5, whose 16,000 already leave room for thinking. Measured at two characters per token
on synthetic records (`test/tokens.test.ts`), the largest realistic record (a contract with
three clauses, six payslips, sixty lines and fifteen work-history rows, texts of the usual
length) is about 10,850 tokens, a tenth under the cap. With every copied text at its limit
(600-character causes and clauses, 80-character concepts) the contract and six payslips fit up
to fifteen lines (about 11,750); every list and text at its limit (about 17,700) does not, and
stops at `max_tokens`.

The cap also keeps a read inside `READ_DEADLINE_MS` (160 s) on one assumption, not yet
measured: that Sonnet 4.6 writes at least about 80 tokens a second through the EU profile, so
that 12,000 take about 150 s after the images are read. At 60 a second, the largest realistic
record (about 135 s at 80) would run past the deadline. A pack that stops at `max_tokens` answers
`document_unreadable`; one that runs out of time, `model_unavailable`, which also locks the
documents path for an hour in the browser; neither spends a read. The evaluation with real
documents measures both; should either appear, the lists shrink or the cap and the deadline
move together.

| Employment read, Sonnet 4.6 alone         | Input tokens    | Output tokens         | Cost                         |
| ----------------------------------------- | --------------- | --------------------- | ---------------------------- |
| Contract alone, 5 photos                  | ~22,000         | ~3,300                | 0.073 + 0.054 = **0.13 USD** |
| Contract and six payslips, 11 photos      | ~31,600         | ~9,300                | 0.104 + 0.153 = **0.26 USD** |
| Largest pack accepted, 25 × 1568 × 1568   | 95,975          | 12,000 (`max_tokens`) | 0.317 + 0.198 = **0.51 USD** |
| Were Haiku to read first: worst escalated | 43,000 + 43,000 | 12,000 + 12,000       | 0.113 + 0.340 = 0.45 USD     |

"Contract alone" and "contract and six payslips" count 1,600 tokens per photo and the 14,000 of
the prompt, as above.

A credit read has the employment review's bounds: a prompt of 14,000 tokens (largest pack
95,975 in) and `max_tokens` 12,000, so its worst case is the same **0.51 USD**. Every list at its
maximum (a 96-row schedule, a year of card statements, both contracts' charges) with texts of
the usual length is about 10,700 tokens, a tenth under the cap; with every copied text at its
limit as well, about 12,200, which stops at `max_tokens`. A mortgage read has the same bounds
too: twelve clauses copied word for word need the room. Every list at its maximum with clauses of
the usual length (800 characters) is about 9,600 tokens; with every clause at its 1,500 and every
text at its limit, about 14,000, which stops at `max_tokens`. An electricity or a telecom read has
the same `max_tokens`, 12,000, and so the same **0.51 USD** bound, with smaller prompts (11,000
and 6,000 tokens: largest packs of 92,975 and 87,975 in). A year of electricity bills (twelve
two-page bills, each with two power lines, three energy lines and one other line, and their
contract) records about 10,750 tokens, a tenth under the cap; every list, field and text at its
limit, about 15,200, which stops at `max_tokens` and answers `document_unreadable`. A telecom
contract and a year of bills with every line is about 7,600 tokens, and about 9,750 with every
text at its limit. An insurance read keeps `max_tokens`
at 5,000 with an 8,000-token prompt: its largest pack is 89,975 in, 0.38 USD.

**Worst case: 0.40 USD per read** for the final pay, the rental and the insurance review (95,975 × 3.30 USD/M +
5,000 × 16.50 USD/M = 0.399), and an upper bound of about **0.51 USD** for the employment, credit, mortgage, electricity and telecom reviews
(95,975 × 3.30 USD/M + 12,000 × 16.50 USD/M = 0.5147), for any input: the API takes images only, priced by their pixels, and refuses anything above 96,000
estimated tokens (0.40 USD) before a call. The bound counts every page at 1568 px, since the
API accepts that size at any count; the browser stepping a large pack down only lowers it. A PDF never reaches it; the browser renders its pages
to images of the same size as a photo. A corrective retry stays inside the bound: with it, the
two reads take at most 96,000 input tokens and one `max_tokens` of output between them. Should Bedrock still bill more than twice the estimate,
the read is logged with `underestimated`. A free read needs a fresh captcha, at most 5 reads
run at once, and the budget action caps the month.

## Evaluation

`eval/` holds four synthetic banks. The rental one has 35 lease packs: each case
(`eval/cases/*.json`, shape in `eval/schema.ts`) lists its pages, drawn from the lease templates in
`eval/templates/` or as notices, receipts, invoices and deposit returns, with how each photo is
spoiled; what a read should find in them; and the facts and review the site's engine should give
(`tests/engine/rental/bank.test.ts` checks the engine against every case, at no cost). The
employment one has 36 packs (`eval/cases/employment/*.json`, shape in `eval/employment-schema.ts`)
drawn from `eval/templates/employment/`: open-ended, fixed-term, training and part-time contracts
(two of them in Catalan and Galician), payslips laid out after the official salary receipt, work
histories and job offers; `tests/engine/employment/bank.test.ts` runs `reviewEmployment` on each
case's facts, also at no cost, and every case's `description` names the rule it exercises. The
credit one has 24 packs (`eval/cases/credit/*.json`, shape in `eval/credit-schema.ts`) drawn from
`eval/templates/credit/`: personal and car loan contracts (one in Catalan), standard European
information, repayment schedules, early repayment statements, revolving card contracts and their
statements; the insurance one has 10 (`eval/cases/insurance/*.json`, shape in
`eval/insurance-schema.ts`) drawn from `eval/templates/insurance/`: home (one in Galician), motor
and life policies and renewal notices. `tests/engine/credit/bank.test.ts` and
`tests/engine/insurance/bank.test.ts` run `reviewCredit` and `reviewInsurance` on each case's facts,
at no cost. Every person, company and identifier in every bank is invented, and
`test/eval-synthetic.test.ts` proves that each DNI, NIE, IBAN, Social Security number, employer
account code and CIF fails its check digits, and that each policy number starts with `PRUEBA-`.

```bash
npm run rental-bank                          # at the root: renders the lease photos to api/eval/out/
npm run employment-bank                      # at the root: the employment ones to api/eval/out/employment/
npm run credit-bank                          # at the root: the credit ones to api/eval/out/credit/
npm run insurance-bank                       # at the root: the insurance ones to api/eval/out/insurance/
EVAL_CONFIRM=yes EVAL_MAX_USD=3 npm run eval # here: reads the lease photos with Bedrock, never in CI
EVAL_CONFIRM=yes EVAL_MAX_USD=3 npm run eval -- --review employment --cases eval/cases/employment
EVAL_CONFIRM=yes EVAL_MAX_USD=2 npm run eval -- --review credit
EVAL_CONFIRM=yes EVAL_MAX_USD=1 npm run eval -- --review insurance
```

The renderer is deterministic: the same seed (`--seed`, by default 20261008) gives the same
bytes, and it prints the hash of what it wrote; `--cases` and `--out` point it at another bank.
The run (`eval/run.ts`, with `tsx`, outside vitest) refuses to start without `EVAL_CONFIRM=yes`
and a positive `EVAL_MAX_USD`, and exits before it loads any AWS adapter. `--review` picks the
bank (`rental` by default, `employment`, `credit` or `insurance`) and `--cases` its folder, by
default that bank's. It reads, by default, the packs marked `eval: true` (bad photos, doubtful
cases, long documents): 15 of the rental and of the employment bank, and 15 between the credit (10)
and the insurance (5) banks; `EVAL_CASES=all` or a
comma-separated list of ids picks others, and so does `--only id1,id2`. Each pack goes through the Lambda's own domain (`extract`
with that review) and the real `createBedrockReader`, with the models of `src/config.ts`. Before
each pack it adds the cost measured so far (tokens × `MODEL_PRICES_USD_PER_MTOK`) to the worst
case of one more pack and stops if that could pass `EVAL_MAX_USD`. It writes `report.json` next to
the bank's photos (`eval/out/`, `eval/out/employment/`, `eval/out/credit/` or
`eval/out/insurance/`): accuracy by field and by page kind,
`nothing_read` expected and got, conflicts, escalations, corrective retries, reads cut at `max_tokens`, values of a
person found in what the model wrote (it must be 0; for employment the person replaced and a
household employer count too) and the total cost. For a pack that missed any field it keeps, per
read, the tool input exactly as the model wrote it (the bank is synthetic), what validation left
out, which sections survived and the merged extraction, so a miss can be traced without paying for
the read again. A run with `--only` writes its report over the last one.

**How much.** 15 packs of 1 to 8 photos, one pass with Sonnet 4.6, per bank; the credit and the
insurance banks share their 15, and their 3 USD. A rental pack is at
most **0.40 USD** (96,000 tokens in and 5,000 out); an employment pack at most **0.51 USD**
(96,000 in and 12,000 out, `EXTRA_OUTPUT_TOKENS_BY_REVIEW`), and so is a credit pack; an
insurance pack is at most **0.40 USD**. So `EVAL_MAX_USD=3` stops the rental or the employment run
before it could pass 3 USD, and `EVAL_MAX_USD=2` for credit with `EVAL_MAX_USD=1` for insurance
keep both runs together under 3 USD; about **2–2.50 USD** is expected for the rental and for the
employment run, and as much for the credit and the insurance runs together. Nothing runs without
the owner's written approval and that figure.

## Unverified

- That a budget action resets by itself at the start of the next month; if not, detach
  `eslojusto-api-deny-bedrock` from `eslojusto-api-extract` by hand.
- That `iam:AttachRolePolicy`/`DetachRolePolicy` on the one role is all the budget action needs.
- That `data_retention_mode: none` set in eu-south-2 also governs requests the EU profile
  routes to other EU regions.
- That Stripe accepts a metadata update on a `complete` Checkout Session, and that the three
  restricted-key permissions are enough. The API reference lists `metadata` among the update
  parameters without the "while the session is active" restriction it puts on others; step 9
  of the deployment confirms both with one test-mode call.
- `npm audit` (dev): `brace-expansion` bundled inside `aws-cdk-lib` (latest release) has a
  high-severity advisory; it runs only at synth time, never in the Lambdas.
- The dashboard's Live Tail link: the console's URL format is undocumented, so it may open
  Live Tail without the log groups selected. The `SEARCH` and cost expressions and the Logs
  Insights queries were checked against real data with read-only calls, except the two over
  `nothing_read` (nested `readability.*` fields and arithmetic inside `stats`), which no read has
  logged yet.
- Whether the models set pages aside as the readability list intends, and how often a page in
  Catalan, Basque, Galician or English is read: the language fixtures are hand-written.
- The real latency of a 25-page read (15 pages took about 15 s, so about 25–30 s is expected,
  well inside the 160 s deadline) and of an escalated one (the 180 s timeout is a guess), and
  whether Bedrock bills a 1568-px photo at about 1,600 tokens, as Anthropic's resizing
  suggests, or at its full 2,459.
- Whether a real year of electricity bills reads into twelve rows that fit `max_tokens` and the
  deadline: the record sizes are measured on synthetic records, and the electricity and telecom
  fixtures are hand-written, as below.
- Model accuracy: the Bedrock fixtures are hand-written in Bedrock's response shape, not
  recordings. Choosing the models, how well they sort a mixed pack, and whether 1568 px reads
  better than about 1100 px on small print still need a comparison on real, anonymised packs
  (on phone photos the two read alike).
