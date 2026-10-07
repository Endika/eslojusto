# eslojusto.es API

Three Lambda functions in **eu-south-2** behind function URLs:

| Function   | Does                                                                                     | Calls                            |
| ---------- | ---------------------------------------------------------------------------------------- | -------------------------------- |
| `extract`  | Reads a settlement proposal, payslips or a work history and returns the fields it states | Turnstile, Bedrock (EU profiles) |
| `checkout` | Starts a Stripe Checkout for the 4,99 € pass                                             | Stripe                           |
| `pass`     | Verifies a finished Checkout Session and issues the signed pass                          | Stripe                           |

Nothing is stored: documents live in the invocation's memory, the server keeps no state, and
logs carry only `op`, `code`, `latencyMs`, `pages`, `inputTokens`, `outputTokens` and
`escalated` (`test/http.test.ts` proves it). The manual calculator never calls this API.

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
to 4 pages, 6 MB per request. The browser downsizes photos before sending. `ok` answers:

```jsonc
{
  "code": "ok",
  "extraction": {
    "kind": "settlement",
    "fields": { "endDate": { "value": "2026-09-15", "confidence": "high" } },
    "lists": { "otherAccruals": [{ "values": { "amount": 12.5 }, "confidence": "medium" }] },
  },
  "failedChecks": [], // coherence checks still failing after any escalation
  "allowance": "<the quota or pass token to send next time>",
}
```

**`checkout`** `{ "nonce": "<22–64 url-safe random chars, kept in the browser>" }` →
`{ "code": "ok", "sessionId": "cs_…", "url": "https://checkout.stripe.com/…" }`. Keep the
session id and nonce before redirecting; Stripe returns to
`/finiquito/?session_id={CHECKOUT_SESSION_ID}`.

**`pass`** `{ "sessionId": "cs_…", "nonce": "…" }` →
`{ "code": "ok", "pass": "<token>", "expiresAt": <epoch seconds> }`. Asking again with the same
session and nonce returns the same pass, which is how «¿Ya has pagado?» works.

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
- Models (`src/config.ts`): `PRIMARY_MODEL` = Haiku 4.5, `ESCALATION_MODEL` = Sonnet 4.6.
  Sonnet 5.5 is one line away (`ESCALATION_MODEL = SONNET_5_5`); its settings already use
  `tool_choice: auto` and more output room, because it rejects forced tool use and thinking is
  on by default there. No request sends `temperature`, which Sonnet 5.5 rejects.

### Limits without storage

There is no database, so per-browser counting is cooperative, not enforcement:

- A free read returns an HMAC-signed `{ day, used }` token (UTC day); the third read of the day
  with it is refused. A pass carries `{ session, expiry, used }` and allows 15 reads in 7 days.
- **Weakness, stated plainly:** a client that drops its token, replays an older one, opens a
  private window or asks `pass` again for the same session starts from zero. The counters stop
  honest overuse and shape the UI; they do not stop anyone determined.
- What actually caps spend: a **fresh Turnstile token per read** (siteverify refuses a token
  it has seen, and checks hostname `eslojusto.es` and action `extract`), **reserved
  concurrency 5** on `extract`, request-size limits, and the **budget action** that denies
  Bedrock at 100 % of the monthly budget (8–12 h late, as Budgets updates).

### Payments

`checkout` creates a `payment`-mode session for the configured Price, filtered to card and
Bizum (`allowed_payment_method_types`, which works with the Dashboard's dynamic methods as
Bizum requires), with promotion codes allowed and an idempotency key per nonce. `pass`
retrieves the session with its line items and checks the nonce, `complete` status, a
`payment_status` other than `unpaid` (so 100 % promotion codes work), EUR, exactly one line of
the configured Price at 499 cents, and a payment less than 7 days old. There is no other way
to obtain a pass: testing without paying is Stripe test mode, or a 100 % promotion code with
`max_redemptions` and `expires_at` in live mode.

Not handled yet: revoking a pass after a refund or dispute (it would mean calling Stripe on
every read), the 21 % tax rate and invoices (pending the gestoría).

## Infrastructure

**CDK, not SAM.** The stacks are TypeScript next to the code they deploy, the tests assert on
the synthesized templates with vitest, and SAM would add a Python CLI and still need raw
CloudFormation for Budgets actions. CDK needs a bootstrap stack (an S3 bucket that holds only
the function bundles, never user data).

**Function URLs, not HTTP API.** Function URLs exist in eu-south-2 (the regional endpoint
`*.lambda-url.eu-south-2.on.aws` resolves; it does not for regions without them), cost
nothing, and their timeout is the function's. HTTP API cuts at 30 s, too close for a primary
read plus an escalated read of a 4-page PDF. Throttling comes from reserved concurrency (429
beyond it); CORS allows only `https://eslojusto.es`.

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
profiles (`bedrock:InferenceProfileArn` condition), plus `ssm:GetParameter` on its two
parameters. `checkout` reads the Stripe key; `pass` the Stripe key and the token key. All three
may write only to their own log group.

**Budget**: 10 USD a month on the whole account (Claude on Bedrock is billed through AWS
Marketplace, so a Bedrock service filter would miss it; Budgets are in USD, and 10 USD stays
under the 10 € cap), emails at 50/80/100 % of actual spend, and at 100 % an automatic action
attaching `eslojusto-api-deny-bedrock` to the `extract` role.

## Deploying (Ekin, once, in this order)

Nothing here has been run. Each step needs an account administrator.

1. **Lambda concurrency quota.** The account allows 10 concurrent executions, and Lambda keeps
   100 unreserved, so reserving 5 fails until the quota is at least 105. Request it in Service
   Quotas (`L-B99A9384`, eu-south-2).
2. **Bedrock, eu-south-2.** Submit Anthropic's use-case form once in the console. Set data
   retention to none (on 07-10-2026 it reads `inherit`), so a model that would retain data is
   blocked instead:
   `aws bedrock put-account-data-retention --mode none --region eu-south-2`, then check
   `aws bedrock get-account-data-retention --region eu-south-2`. Model invocation logging must
   stay off: `aws bedrock get-model-invocation-logging-configuration --region eu-south-2`
   prints nothing (true on 07-10-2026). Invoke Haiku 4.5 and Sonnet 4.6 once from the console
   playground so the Marketplace subscription exists; the execution role has no Marketplace
   permissions.
3. **Parameters** (SecureString, default `aws/ssm` key, eu-south-2):
   `/eslojusto/api/stripe-secret-key`, `/eslojusto/api/token-hmac-key` (at least 32 random
   bytes, e.g. `openssl rand -base64 48`), `/eslojusto/api/turnstile-secret-key`.
4. **Global stack:** `npx cdk deploy EslojustoApiGlobal -c stripePriceId=price_… -c alertEmail=<you>`.
   Accept the budget-alert subscription email.
5. **Bootstrap eu-south-2** with the policy from step 4 as CloudFormation's only permission:
   `npx cdk bootstrap aws://<account>/eu-south-2 --cloudformation-execution-policies <CfnExecutionPolicyArn>`.
6. **GitHub:** create the `production` environment with yourself as required reviewer and
   deployments limited to `main`; set the variables `AWS_DEPLOY_ROLE_ARN` (step 4 output) and
   `STRIPE_PRICE_ID`. The deploy role trusts only
   `repo:Endika/eslojusto:environment:production`.
7. **Approve** the `Deploy API` run, then give the three function URLs (stack outputs) and the
   Turnstile site key to the site.

## Cost

Fixed: about 0 USD a month. Function URLs, idle Lambdas, standard SSM parameters and the first
two budgets with actions cost nothing; the bootstrap bucket holds about 1 MB; logs are a few
KB a day. Per read: about 0.015–0.02 USD with Haiku 4.5 (EU profile list prices, phase-2
research §1.4), roughly three times that again when a read escalates to Sonnet 4.6.

## Unverified

- That a budget action resets by itself at the start of the next month; if not, detach
  `eslojusto-api-deny-bedrock` from `eslojusto-api-extract` by hand.
- That `iam:AttachRolePolicy`/`DetachRolePolicy` on the one role is all the budget action needs.
- That `data_retention_mode: none` set in eu-south-2 also governs requests the EU profile
  routes to other EU regions.
- The real latency of an escalated read of a 4-page PDF (the 120 s timeout is a guess).
- Model accuracy: the Bedrock fixtures are hand-written in Bedrock's response shape, not
  recordings. Spec decision 5's comparison with Ekin's anonymised documents is still to do.
