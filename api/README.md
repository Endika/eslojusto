# eslojusto.es API

Three Lambda functions in **eu-south-2** behind function URLs:

| Function   | Does                                                                                           | Calls                                                   |
| ---------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `extract`  | Reads a pack of employment documents, says what each page is and returns the fields they state | Turnstile, Bedrock (EU profiles), Stripe for pass reads |
| `checkout` | Starts a Stripe Checkout for the 4,99 € pass                                                   | Turnstile, Stripe                                       |
| `pass`     | Verifies a finished Checkout Session and issues the signed pass, or verifies a pass            | Stripe                                                  |

Nothing is stored: documents live in the invocation's memory, the server keeps no state, and
logs carry only `op`, `code`, `latencyMs`, `pages`, `inputTokens`, `outputTokens`,
`escalated`, `conflicts` (how many fields two documents stated differently), `readability` (how
many pages had each readability, only when a read set a page aside or found nothing) and two flags (`test/http.test.ts` proves it): `underestimated` when Bedrock
counted more than twice the input the pre-read estimate allowed for, and `countNotSaved` when
a pass read went through but Stripe did not store its count; `verify` marks a `pass` request that
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
  "pass": "<pass token>" // or a pass read
}
```

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
until it fits its share, and only when no quality does, at 1280 and then 1100 px on the long side
(`JPEG_QUALITIES` and `LONG_SIDES` in `src/documents/files.ts`). With 15 images that is about
290 KB each, which a 1568-px document page usually meets by quality 0.65. If the pack still does
not fit, the browser says the files are too heavy before sending anything.

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

Readability (`READABILITY` in `src/domain/extraction-schema.ts`): `ok`, or the main reason a page
can't be used: `handwritten`, `blurry`, `dark`, `cropped`, `not_labour_document`,
`foreign_jurisdiction` (an employment document from another country, where Spanish law does not
apply) or `unknown_format`. Language is never a reason: the prompt names Spanish, Catalan,
Basque, Galician and English and says so (`test/languages.test.ts`, with hand-written fixtures in
each of them). An `ok` read can still list pages set aside; the site says which and why.

**`checkout`** `{ "nonce": "<22–64 url-safe random chars, kept in the browser>",
"captchaToken": "<Turnstile, action 'checkout'>" }` →
`{ "code": "ok", "sessionId": "cs_…", "url": "https://checkout.stripe.com/…" }`. Keep the
session id and nonce before redirecting; Stripe returns to
`/finiquito/?session_id={CHECKOUT_SESSION_ID}`.

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
  prompt and schema at 14,000 (about 27,000 characters at two per token;
  `test/tokens.test.ts` keeps it honest). Bedrock's CountTokens does not serve Claude models
  offered only through cross-Region profiles, so this is computed, not asked. The largest pack
  the API accepts, twenty-five 1568 × 1568 images, comes to 14,000 + 25 × 3,279 = 95,975; above
  **96,000** the answer would be `document_too_dense`. Nothing in an image can add tokens
  beyond its pixels, which is why PDFs are rendered in the browser instead of read here: a PDF
  can hide text from any measure short of a full reader.
- **With Haiku reading first** (not the default), no escalation above 43,000 real input tokens
  (Bedrock's own count from the primary read), nor, when the primary read failed, above that
  estimate.
- **Image tokens grow with the pixels.** A 1176 × 1568 photo is about 2,459 tokens; at 1100 px
  on the long side (825 × 1100) it would be about 1,210. Anthropic documents that Claude scales
  an image down first when it is over about 1,600 tokens (about 1.15 megapixels), so a 1568-px
  photo is likely read, and billed, at about 1,600; the estimate does not count on that. Whether
  1568 px reads documents better than about 1100 px is a question for a model evaluation;
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
`checkout`/`pass` codes, `escalated`/`underestimated`/`countNotSaved` counts, pages, tokens
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

**Worst case: 0.40 USD per read** (95,975 × 3.30 USD/M + 5,000 × 16.50 USD/M = 0.399), for any
input: the API takes images only, priced by their pixels, and refuses anything above 96,000
estimated tokens (0.40 USD) before a call. The bound counts every page at 1568 px, since the
API accepts that size at any count; the browser stepping a large pack down only lowers it. A PDF never reaches it; the browser renders its pages
to images of the same size as a photo. Should Bedrock still bill more than twice the estimate,
the read is logged with `underestimated`. A free read needs a fresh captcha, at most 5 reads
run at once, and the budget action caps the month.

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
- Model accuracy: the Bedrock fixtures are hand-written in Bedrock's response shape, not
  recordings. Choosing the models, how well they sort a mixed pack, and whether 1568 px reads
  better than about 1100 px still need a comparison on real, anonymised packs.
