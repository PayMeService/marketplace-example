# 09 — Going to production

## What changes between sandbox and live

| | Sandbox | Production |
|---|---|---|
| API base | `https://sandbox.payme.io/api/` | `https://live.payme.io/api/` |
| Credentials | sandbox partner key + secret | different values entirely |
| Hosted Fields | `PayMe.create(key, { testMode: true })` | `testMode: false` |
| Test cards | work | do not |
| Sellers | anything passes verification | real documents, real review |

A sandbox partner key does not work against live, and a token minted in one
environment cannot be charged against a sale in the other.

The `testMode` flag is easy to miss because it lives in the frontend, not the
backend config. In this app it is hard-coded `true` in `Checkout.tsx`; wire it
to the environment before going live.

## Checklist

### Credentials and secrets

- [ ] Live partner key and secret obtained from your account manager.
- [ ] **Partner secret in a secrets manager**, not a database column. This app
      stores it in `payme_settings` so a self-contained example can be
      configured by whoever clones it — that is a demo affordance. The whole
      value of that secret is that it never leaves your infrastructure.
- [ ] `JWT_SECRET` is a real random value.
- [ ] Seller secrets (`seller_payme_secret`) encrypted at rest.
- [ ] Buyer tokens (`buyer_key`) encrypted at rest, never sent to a browser,
      never logged. Check your log pipeline actually honours the redaction in
      `PayMeClient`.

### Callbacks

- [ ] `PUBLIC_BASE_URL` is a real HTTPS origin, not a tunnel.
- [ ] Client secret set — otherwise every signature is `unverifiable` and
      nothing is applied.
- [ ] You have watched a deliberately wrong signature be rejected. Send one with
      the simulator in staging.
- [ ] Handlers are idempotent. PayMe retries.
- [ ] Callback failures are alerted on, not merely logged. A silent run of
      `invalid` is either a broken deploy or an attack.

### Code

- [ ] `DB_SYNCHRONIZE=false`, with TypeORM migrations instead. The dev stack
      uses `synchronize: true`, which will happily drop a column.
- [ ] `testMode: false` in the Hosted Fields initialisation.
- [ ] The callback simulator route deleted. It refuses to run when
      `PAYME_ENV=production` or `NODE_ENV=production`, but the safest version of
      a debug endpoint is one that is not compiled in.
- [ ] `CORS_ORIGIN` set to your real origin, not `*`.
- [ ] `cdn.payme.io` in your CSP `script-src` and `frame-src`.

### Money

- [ ] Every amount is an integer in minor units, end to end. Grep for `/100` and
      `* 100` outside the display layer.
- [ ] Amounts below 500 minor units are rejected before reaching PayMe.
- [ ] `market_fee` matches what your sellers were told.
- [ ] Currencies restricted to what your sellers are actually enabled for —
      `seller_currencies` on `get-sellers`.

### Operations

- [ ] Sellers can see their approval state and reach their onboarding link.
      They cannot be paid until they finish it.
- [ ] Someone is watching for authorizations approaching 168 hours.
- [ ] `session` from PayMe error responses is in your logs. It is the first
      thing PayMe support asks for.
- [ ] Reconciliation against `get-sales` / `get-transactions`, not only your own
      database.

## Error handling in production

`PayMeApiError` carries `paymeErrorCode`, `paymeErrorDetails`, `additionalInfo`
and `session`. Log all four. Codes worth recognising:

| Code | Meaning |
|---|---|
| 21 | Invalid URL — a callback or return URL PayMe would not accept |
| 114 | Business-type validation, e.g. sole-trader business number ≠ social ID |
| 174 | Feature not supported for this seller type — often a partner MPL used where a seller's belongs |
| 305 | Action invalid for the current status — capturing something not authorized |
| 790 | Parameter not settable on this plan |

Send `language: "en"` on everything. PayMe defaults to Hebrew, including on some
endpoints where `language` is not documented but is honoured — `capture-sale`
among them.

## What this example does not cover

Worth knowing they exist:

- **3-D Secure as a standalone service** — the hosted page and Hosted Fields
  handle 3DS for you. `POST /sales/{id}/3ds` is for driving it yourself.
- **Apple Pay / Google Pay** — need `vas-enable` per seller plus domain
  verification and platform-specific browser work.
- **Invoices** — `POST /documents`, if the seller has the invoices module.
- **Point of sale** — card-present terminals.
- **Israeli Direct Debit** (הוראת קבע), SEPA, BACS.
- **Multi-checkout / template payment pages** — one link, many buyers.
- **Level 2/3 card data** — `items`, `fees`, `shipping_details`,
  `billing_details` on `generate-sale`, for corporate-card interchange rates.
  Typed in `payme.types.ts` but unused here.

All are documented at [payme.stoplight.io](https://payme.stoplight.io).
