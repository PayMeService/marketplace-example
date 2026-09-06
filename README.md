# marketplace-example

A worked **PayMe** integration, built as a running marketplace rather than a set
of snippets. Users register and list products; a user who wants to be paid opens
a PayMe seller account and gets an MPL; buyers pay through one of three checkout
integrations; money lands in that seller's wallet with the marketplace taking a
commission.

Every PayMe call it makes has been exercised against the live sandbox — seller
creation, all three checkouts, a real card authorization, its capture, and a
refund.

> **The point of this repo is to be read.** The source carries the "why" inline;
> [`docs/`](docs/README.md) carries the narrative. If you are here to learn the
> integration rather than to run it, start with
> [`docs/README.md`](docs/README.md).

Vite + React + Tailwind 4 · NestJS + TypeORM · Postgres · Docker.

## What it covers

| | |
|---|---|
| **Seller onboarding** | `create-seller` with marketplace-defined plans that set `market_fee`; storing the MPL, the one-time secret and the public key; approval state and fees from `get-sellers`. |
| **Three checkouts** | PayMe's hosted page in an iframe · Hosted Fields (JSAPI) on your own domain · Direct API `pay-sale` against a saved token. |
| **Buyer-initiated purchase** | A shopper clicks Buy and the payment routes to whoever listed the item — the part of a *marketplace* integration a single-merchant one has no equivalent for. |
| **Authorize and capture** | J5 with the 168-hour window, one-shot capture, and voiding. |
| **Tokens** | `capture_buyer`, `buyer_key`, `get-buyer-key`, and the partner-scoped `POST /sellers/{mpl}/tokens`. |
| **Subscriptions** | Create, pause, resume, cancel, change price; the full status machine. |
| **Balances and payouts** | `seller_wallets`, total vs. releasable, `withdraw-balance`. |
| **Signed callbacks** | md5 `payme_signature` verification for sales and subscriptions, an event log that keeps rejections, and a local simulator. |
| **Configuration** | Partner key / secret / marketplace MPL, editable at runtime. |

## Quick start

```bash
cp .env.example .env
# fill in PAYME_CLIENT_KEY and PAYME_CLIENT_SECRET
make dev
```

| | |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:3000/api |
| Debugger | attach to `localhost:9229` |

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`, then walk through:
register a user → list a product → **Sell with us** → **Take a payment**.

Sandbox test values are pre-filled throughout the UI. In sandbox use social ID
`9999999999`, bank `54`, branch `123`, account `123456`, and card
`5326105300985846` exp `12/30` cvv `658` social ID `008336174`.

### Callbacks in local development

PayMe rejects callback **and return** URLs that resolve to localhost — the whole
`generate-sale` call fails with error 21, not just the notification. So either:

```bash
cloudflared tunnel --url http://localhost:3000   # then set PUBLIC_BASE_URL
```

or use the built-in callback simulator on the **Callbacks** page, which builds a
correctly signed payload and runs it through the real handler. Send a
deliberately wrong signature at least once and watch it be rejected.

## The five things that bite everyone

1. **Amounts are integers in minor units.** `sale_price: 5075` is 50.75. Sending
   `50.75` is accepted and charges 50 agorot. Minimum 500.
2. **`status_code === 0` is the only success test.** PayMe answers HTTP 200 with
   `status_code: 1` for business failures, and HTTP 500 with a well-formed error
   body for validation failures.
3. **Verify `payme_signature` before acting on a callback.** The endpoint is
   public and unauthenticated; the signature is the whole of its security.
4. **`transaction_id` means two different things** — your order id on the way
   out (`generate-sale`), PayMe's transaction guid on the way back (callbacks).
   Only PayMe's guid is ever hashed.
5. **PayMe validates the URLs you send it**, both callback and return.

## Layout

```
backend/src/
  common/money.ts               minor units, and why
  common/payme-error.ts         one error type; how failure is actually detected
  payme/payme.types.ts          the API surface, in PayMe's own field names
  payme/payme.client.ts         transport: base URLs, headers, success test, redaction
  payme/payme-signature.ts      callback authentication — read this one
  settings/                     runtime-configurable credentials
  auth/                         this app's own users; nothing to do with PayMe
  sellers/                      create-seller, public keys, balances, tokens
  products/                     listings
  sales/                        the three flows, buyer purchase, capture, refund
  subscriptions/                generate, pause, resume, cancel, set-price
  callbacks/                    verify-then-act, the event log, the simulator
  admin/                        partner-scoped operator tools

frontend/src/
  lib/payme-hosted-fields.ts    the only place the browser talks to PayMe
  lib/money.ts                  the mirror of the backend's money rules
  pages/Checkout.tsx            the three flows, side by side
  pages/Buy.tsx                 the buyer's view
  pages/AdminCallbacks.tsx      the callback log and the simulator

docs/                           the prose walkthrough — start at docs/README.md
```

## Common tasks

```bash
make help        # list all targets
make dev         # dev stack with hot reload
make up          # prod stack (nginx + nest + postgres)
make psql        # psql into the dev database
make db-reset    # drop the dev volume and recreate
make test        # backend tests + frontend lint
make clean       # tear everything down
```

## Before production

`DB_SYNCHRONIZE=true` is dev-only — switch to TypeORM migrations. The partner
secret belongs in a secrets manager, not the `payme_settings` table it lives in
here. Hosted Fields needs `testMode: false`. Delete the callback simulator.
The full list is in [`docs/09-going-to-production.md`](docs/09-going-to-production.md).

## Not covered

3-D Secure as a standalone service, Apple Pay / Google Pay enablement, invoices,
point of sale, Israeli Direct Debit / SEPA / BACS, multi-checkout template pages,
and Level 2/3 card data. All are documented at
[payme.stoplight.io](https://payme.stoplight.io).
