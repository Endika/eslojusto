<p align="center">
  <a href="https://eslojusto.es"><img src="public/og.png" alt="eslojusto.es" width="600"></a>
</p>

<h3 align="center">Is it fair? Check it against Spanish law, item by item.</h3>

- **Final pay (finiquito)** — enter your dates, salary and what your final pay says, and see the
  legal minimum for each item: salary, holidays, extra pay, severance and notice.
- **Unemployment benefit (paro)** — an estimate of how much and for how long, with the article
  behind every figure.
- **Rent, employment contracts and household workers** — built behind build switches
  (`PUBLIC_RENTAL`, `PUBLIC_EMPLOYMENT`, `PUBLIC_HOUSEHOLD`) and not yet published. The benefit
  during an ERTE at `/paro/erte/` is built only with `PUBLIC_ERTE=1`.

The calculators run in your browser and nothing you type is sent anywhere. Reading your documents
is optional: with your explicit consent, the pages go to the API in Spain, are read by a model in
the EU and are never stored.

<h2 align="center"><a href="https://eslojusto.es">eslojusto.es →</a></h2>

It explains the law; it is not legal advice.

## Development

```bash
npm ci
npm run dev        # http://localhost:4321
npm run test:run
```

Analytics (PostHog EU, no cookies) only turn on when the build has `PUBLIC_POSTHOG_KEY`.

Document reading and the paid report only turn on when the build has all of
`PUBLIC_API_EXTRACT_URL`, `PUBLIC_API_CHECKOUT_URL` and `PUBLIC_API_PASS_URL` (the API stack's
outputs `extractUrl`, `checkoutUrl` and `passUrl`) plus `PUBLIC_TURNSTILE_SITE_KEY`; without them the site is the calculator alone. The API lives in
[`api/`](api/README.md).

## Licence

[MIT](LICENSE)
