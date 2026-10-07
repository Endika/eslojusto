# eslojusto.es API

Three Lambda functions in **eu-south-2** behind function URLs:

| Function   | Does                                                                                     | Calls                                                   |
| ---------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `extract`  | Reads a settlement proposal, payslips or a work history and returns the fields it states | Turnstile, Bedrock (EU profiles), Stripe for pass reads |
| `checkout` | Starts a Stripe Checkout for the 4,99 € pass                                             | Turnstile, Stripe                                       |
| `pass`     | Verifies a finished Checkout Session and issues the signed pass                          | Stripe                                                  |

Nothing is stored: documents live in the invocation's memory, the server keeps no state, and
logs carry only `op`, `code`, `latencyMs`, `pages`, `inputTokens`, `outputTokens`,
`escalated` and two flags (`test/http.test.ts` proves it): `underestimated` when Bedrock
counted more than twice the input the pre-read estimate allowed for, and `countNotSaved` when
a pass read went through but Stripe did not store its count. The manual calculator never calls this API.

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
  "kind": "settlement" | "payslip" | "work_history",
  "files": [{ "mediaType": "image/jpeg" | "image/webp" | "application/pdf", "data": "<base64>" }],
  "captchaToken": "<Turnstile token, widget action 'extract'>",
  "quota": "<token from the last free read, or null>", // free read
  "pass": "<pass token>" // or a pass read
}
```

Up to 4 JPEG/WebP images (long side ≤ 1568 px, checked from the image header) or 1 PDF of up
to 4 pages and 2 MB, 6 MB per request. The browser downsizes photos before sending, and turns
a PDF the API refuses (`pdf_too_large`, `pdf_unreadable`: scanned, encrypted or ambiguous)
into page images. `ok` answers:

```jsonc
{
  "code": "ok",
  "extraction": {
    "kind": "settlement",
    "fields": { "endDate": { "value": "2026-09-15", "confidence": "high" } },
    "lists": { "otherAccruals": [{ "values": { "amount": 12.5 }, "confidence": "medium" }] },
  },
  "failedChecks": [], // coherence checks still failing after any escalation
  "allowance": "<free reads: the quota token to send next time>",
  "readsLeft": 11, // pass reads: what Stripe has left on the pass
}
```

**`checkout`** `{ "nonce": "<22–64 url-safe random chars, kept in the browser>",
"captchaToken": "<Turnstile, action 'checkout'>" }` →
`{ "code": "ok", "sessionId": "cs_…", "url": "https://checkout.stripe.com/…" }`. Keep the
session id and nonce before redirecting; Stripe returns to
`/finiquito/?session_id={CHECKOUT_SESSION_ID}`.

**`pass`** `{ "sessionId": "cs_…", "nonce": "…" }` →
`{ "code": "ok", "pass": "<token>", "expiresAt": <epoch seconds>, "readsLeft": <n> }`. Asking
again with the same session and nonce returns the same pass, with the reads it really has left,
which is how «¿Ya has pagado?» works. A pass with no reads left still unlocks the report and
the letter until it expires.

### Fields and the site's engine

Names match `src/engine/types.ts` so the form can be prefilled; `test/engine-contract.test.ts`
fails the type check if the engine drifts.

| Document     | Fields                                                                                                                  | Lists                              | Fills                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| settlement   | `startDate`, `endDate`, `cause`, `fixedTermType`, `monthlySalary`                                                       |                                    | `FinalPayInput`                                                                                  |
|              | `pending_salary`, `holiday_pay`, `extra_pay`, `severance`, `employer_notice`, `notice_deduction`                        |                                    | `EmployerFigures` by `ItemId`                                                                    |
|              | `totalAccrued`                                                                                                          | `otherAccruals[].amount`           | coherence check only                                                                             |
| payslip      | `periodStart`, `periodEnd`, `startDate`, `totalAccrued`, `extraPayProrated`, `extraPayProratedAmount`, `extraPayAmount` | `accruals[].amount`                | the UI proposes `monthlySalary` = `totalAccrued` − `extraPayProratedAmount`; the person confirms |
| work_history |                                                                                                                         | `contracts[].startDate`, `endDate` | `OtherContracts.contracts` (`ContributionPeriod`)                                                |

Every kind also returns `detectedKind`. The model never calculates: a derived value is the UI's
proposal, confirmed by the person.

## Architecture

```
src/
  config.ts       region, models, names: shared by code and infrastructure
  domain/         schemas, validation, coherence, escalation, allowance and pass rules, ports
  http/           function-URL events to use cases and back; logging
  adapters/       Bedrock, Stripe, Turnstile, HMAC, SSM, pdf-lib, clock, console logger
  handlers/       one composition root per function
infra/            CDK app: ApiStack (eu-south-2) and GlobalStack (IAM, Budgets)
test/             vitest; synthetic documents, fakes, Bedrock-shaped response fixtures
```

`eslint.config.js` enforces the hexagon: the domain imports only itself, `http/` only the
domain, adapters never reach `http/` or `handlers/`, and the infrastructure reads only
`src/config.ts`.

### Extraction

- **InvokeModel with the Messages body, not Converse.** Converse sends a PDF's text layer only
  unless citations are on, and scanned payslips have none. Same SDK
  (`@aws-sdk/client-bedrock-runtime`), same `bedrock:InvokeModel` permission.
- One tool per document kind with a closed JSON schema (`additionalProperties: false` at every
  level), forced with `tool_choice` where the model allows it. A fixed system prompt treats the
  document as data, never instructions, and forbids recording union dues, sick leave or third
  parties. The person's request contributes only the file bytes and the document kind.
- The output is validated in the domain (hand-written, because the domain imports nothing):
  any field or row with an invalid value, an unknown confidence or an extra key is dropped and
  counted, never repaired. Keys outside the schema are ignored.
- **Escalation by doubt** (spec decision 5): a `low` confidence anywhere, a dropped field, no
  tool output, or a failed coherence check (items not adding up to `totalAccrued` within 1 €,
  impossible or inverted dates, proration above the total) re-reads the document with
  `ESCALATION_MODEL`, whose read wins. Same path with or without a pass. Equal constants mean
  no escalation. A confident "this is another kind of document" is answered as
  `document_kind_mismatch` without escalating or returning data.
- **Provider errors.** Every Bedrock error throws, a `ValidationException` included: the request
  is fixed, so it means a retired, disabled or misconfigured model, never a bad document. A
  failed primary read goes to the escalation model; if that fails too, the answer is
  `model_unavailable`. An escalated read replaces the primary only if it recorded something.
- Models (`src/config.ts`): `PRIMARY_MODEL` = Haiku 4.5, `ESCALATION_MODEL` = Sonnet 4.6.
  Sonnet 5.5 is one line away (`ESCALATION_MODEL = SONNET_5_5`); its settings already use
  `tool_choice: auto` and more output room, because it rejects forced tool use and thinking is
  on by default there. No request sends `temperature`, which Sonnet 5.5 rejects.

### Order of checks

Cheapest first, and nothing that parses what the person sent runs before the captcha:

1. Counts, byte sizes and magic bytes; the allowance token's signature and dates.
2. **Turnstile.** Siteverify refuses a token it has seen and must report hostname
   `eslojusto.es` and the endpoint's action, so every read and every checkout costs a fresh
   challenge.
3. Image headers; the PDF inspection; the input-token estimate.
4. For a pass, the Checkout Session in Stripe (paid, not refunded or disputed, reads left).
5. The model reads.

### Bounding the cost of a read

- **PDF pages are counted the way every reader would count them, or not at all.** The inspector
  refuses bytes after the last `%%EOF`, an object defined twice within one revision (later
  revisions may redefine objects, as signatures do), more than 5,000 objects, anything pdf-lib
  reports on the console or as an invalid object, encryption, and any disagreement between the
  page tree's `/Count`, the pages pdf-lib finds, and every page tree and page object a
  sequential scan finds. Text-bearing streams may only use Flate, ASCII85 or ASCIIHex filters,
  and decode to 8 MB at most. Measured on 25 real PDFs on the dev machine: all accepted with
  the right page count.
- **Input tokens are estimated before the first read** (Bedrock's CountTokens does not serve
  Claude models offered only through cross-Region profiles, and the mantle alternative would
  send the document to eu-west-1 through a hand-signed request): 3,000 for the prompt and
  schema, Claude's 28-px patch formula for each image, 1,600 per PDF page plus one token per two
  bytes of text in its streams. Real documents land around 1,200–1,700 text tokens per dense
  page. Above **32,000** the answer is `document_too_dense`; four dense pages estimate at about
  27,000.
- **No escalation above 25,000 real input tokens** (Bedrock's own count from the primary read),
  nor, when the primary read failed, above that estimate. Real four-page documents need about
  20,000.
- **PDFs are capped at 2 MB**: digital payslips and work histories weigh tens of kilobytes; a
  heavier file is a scan, better sent as page images.

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
- **Revocation:** each pass read and each `pass` request retrieves the session with its
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
nothing, and their timeout is the function's. HTTP API cuts at 30 s, too close for a primary
read plus an escalated read of a 4-page PDF. Throttling comes from reserved concurrency (429
beyond it: 5 for `extract`, 2 each for `checkout` and `pass`); CORS allows only
`https://eslojusto.es`.

**Two stacks.**

- `EslojustoApi` (eu-south-2, deployed by CI): the three functions on `nodejs24.x` (newest GA
  runtime; Node 26 is in preview) arm64, their URLs and log groups (14 days). No IAM, no
  storage: tests prove the template holds only Lambda and Logs resources and names no other
  region.
- `EslojustoApiGlobal` (deployed by hand, once, through eu-west-1 because CloudFormation in
  eu-south-2 has no `AWS::Budgets::*` types; every resource in it is global): the three
  execution roles, the budget and its action, the GitHub OIDC provider and deploy role, and the
  CloudFormation execution policy. Keeping IAM here means CI can neither create roles nor widen
  them.

Execution roles: `extract` may `bedrock:InvokeModel` on the two EU inference profiles and on
their foundation models in the six EU regions the profiles route to, only through those
profiles (`bedrock:InferenceProfileArn` condition), plus `ssm:GetParameter` on the token key,
the Turnstile secret and the Stripe restricted key (passes count their reads in Stripe).
`checkout` reads the restricted key and the Turnstile secret; `pass` the restricted key and the
token key. No function can read the account's full Stripe secret key: it is in no parameter
the roles reach, and the adapter refuses any key that is not `rk_…`. Each may
write only to its own log group (`log-group:NAME` and `log-group:NAME:*`). The budget action's
role can be assumed by Budgets only on behalf of this account (`aws:SourceAccount`).

**Budget**: 10 USD a month on the whole account (Claude on Bedrock is billed through AWS
Marketplace, so a Bedrock service filter would miss it; Budgets are in USD, and 10 USD stays
under the 10 € cap), emails at 50/80/100 % of actual spend, and at 100 % an automatic action
attaching `eslojusto-api-deny-bedrock` to the `extract` role.

## Deploying (Ekin, once, in this order)

Nothing here has been run. Each step needs an account administrator.

1. **Lambda concurrency quota.** The account allows 10 concurrent executions, and Lambda keeps
   100 unreserved. The functions reserve 5 + 2 + 2 = 9, so the deployment fails until the quota
   is at least 109. Request it in Service Quotas (`L-B99A9384`, eu-south-2).
2. **Bedrock, eu-south-2.** Submit Anthropic's use-case form once in the console. Set data
   retention to none (on 07-10-2026 it reads `inherit`), so a model that would retain data is
   blocked instead:
   `aws bedrock put-account-data-retention --mode none --region eu-south-2`, then check
   `aws bedrock get-account-data-retention --region eu-south-2`. Model invocation logging must
   stay off: `aws bedrock get-model-invocation-logging-configuration --region eu-south-2`
   prints nothing (true on 07-10-2026). Invoke Haiku 4.5 and Sonnet 4.6 once from the console
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
   `STRIPE_PRICE_ID`. The deploy role trusts only
   `repo:Endika/eslojusto:environment:production`.
8. **Approve** the `Deploy API` run, then give the three function URLs (stack outputs) and the
   Turnstile site key to the site.
9. **Before going live, in Stripe test mode with the restricted key:** create a session through
   `checkout`, pay it with `4242 4242 4242 4242`, redeem it through `pass`, and make one pass
   read. Then check in the Dashboard that the session's metadata reads `reads_used: 1`. That
   single call confirms both that Stripe accepts a metadata update on a `complete` session and
   that the restricted key's permissions are enough (if creating the session fails, add
   **Prices: Read**). If the log shows `countNotSaved`, passes are not being counted.

## Cost

Fixed: about 0 USD a month. Function URLs, idle Lambdas, standard SSM parameters and the first
two budgets with actions cost nothing; the bootstrap bucket holds about 1 MB; logs are a few
KB a day.

Per read, from the eu-south-2 Price List (07-10-2026): Haiku 4.5 at 1.10 / 5.50 USD per
million input / output tokens, Sonnet 4.6 at 3.30 / 16.50 (EU profiles).

| Read                                           | Input tokens    | Output tokens        | Cost                         |
| ---------------------------------------------- | --------------- | -------------------- | ---------------------------- |
| Typical (3 photos or a 2-page PDF), Haiku only | 6,000–10,600    | ~1,500               | 0.015–0.02 USD               |
| Worst case, Haiku only (estimate at the cap)   | 32,000          | 4,096 (`max_tokens`) | 0.058 USD                    |
| Worst case escalated, Haiku + Sonnet 4.6       | 25,000 + 25,000 | 4,096 + 4,096        | 0.050 + 0.150 = **0.20 USD** |
| Estimate fooled, Haiku only                    | up to 200,000   | 4,096                | 0.22 + 0.02 = **0.25 USD**   |

**Honest worst case: about 0.25 USD per read when a document fools the pre-read estimate,
0.20 USD otherwise.** Fooling it means text the inspector does not count (for instance behind
duplicate objects inside compressed object streams); the read can then take Haiku's whole
200,000-token context, but it never escalates, because Bedrock's real count is far over the
25,000 escalation cap. Such a read is logged with `underestimated`, so it shows up. Either way a
free read needs a fresh captcha, and at most 5 reads run at once.

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
- That a PDF hiding pages behind duplicate objects _inside compressed object streams_
  (invisible to the raw scan) is caught; the token estimate and the escalation cap still bound
  its cost.
- `npm audit` (dev): `brace-expansion` bundled inside `aws-cdk-lib` (latest release) has a
  high-severity advisory; it runs only at synth time, never in the Lambdas.
- The real latency of an escalated read of a 4-page PDF (the 120 s timeout is a guess).
- Model accuracy: the Bedrock fixtures are hand-written in Bedrock's response shape, not
  recordings. Spec decision 5's comparison with Ekin's anonymised documents is still to do.
