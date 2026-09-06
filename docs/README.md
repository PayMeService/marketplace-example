# Integrating with PayMe — a worked example

This is the prose companion to the code in `backend/` and `frontend/`. Both are
written to be read: the source carries the "why" inline, these pages carry the
narrative and the parts that do not belong next to any one function.

The running app is a marketplace. Users register and list products; a user who
wants to be paid opens a **PayMe seller** and gets an MPL; buyers pay through
one of three checkout integrations; money lands in the seller's PayMe wallet
with the marketplace taking a commission off the top.

## The guides

| | |
|---|---|
| [01 — Configuration and credentials](01-configuration.md) | Partner key vs. partner secret vs. seller MPL vs. public key. Which is a secret, which is not, and which never leaves your building. |
| [02 — Seller onboarding](02-seller-onboarding.md) | `create-seller`, plans and `market_fee`, what comes back exactly once, and the validation rules that are not in the docs. |
| [03 — Payment flows](03-payment-flows.md) | Hosted page, Hosted Fields and Direct API side by side: how each one works, what it costs you in compliance, and how to choose. |
| [04 — Tokens and saved cards](04-tokens.md) | `capture_buyer`, `buyer_key`, `get-buyer-key`, and the partner-scoped `POST /sellers/{mpl}/tokens`. |
| [05 — Authorize and capture](05-auth-capture.md) | J5, the 168-hour window, the one-shot capture rule, and voiding. |
| [06 — Subscriptions](06-subscriptions.md) | `generate-subscription`, the status machine, and why there is no "charge the next iteration" call. |
| [07 — Callbacks and signatures](07-callbacks-and-signatures.md) | **The security-critical one.** How the md5 signature is built, the field-name trap, and how to develop against callbacks locally. |
| [08 — Balances and payouts](08-balances-and-payouts.md) | Where a seller's balance actually lives, why it is not withdrawable, and `withdraw-balance`. |
| [09 — Going to production](09-going-to-production.md) | The checklist, and what changes between sandbox and live. |
| [10 — Field reference](10-field-reference.md) | The parameters this app sends, with types and gotchas, in one table. |

## The five things that bite everyone

If you read nothing else:

1. **Amounts are integers in minor units.** `sale_price: 5075` is 50.75. Sending
   `50.75` is accepted and charges 50 agorot. Minimum 500.
2. **`status_code === 0` is the only success test.** PayMe answers HTTP 200 with
   `status_code: 1` for business failures, and HTTP 500 with a well-formed error
   body for validation failures. Never branch on the HTTP status.
3. **Verify `payme_signature` before acting on a callback.** The endpoint is
   public and unauthenticated; the signature is the whole of its security.
4. **`transaction_id` means two different things.** Your order id on the way
   out (`generate-sale`); PayMe's transaction guid on the way back (callbacks).
   Only PayMe's guid is ever hashed.
5. **PayMe validates the URLs you send it.** Both `sale_callback_url` and
   `sale_return_url` are checked at request time; a localhost URL fails the whole
   `generate-sale` call with error 21, not just the notification.

## Where things live in the code

```
backend/src/
  common/money.ts               minor units, and why
  common/payme-error.ts         the one error type, and how failure is detected
  payme/payme.types.ts          the API surface, in PayMe's own field names
  payme/payme.client.ts         transport: base URLs, headers, success test, redaction
  payme/payme-signature.ts      callback authentication — read this one
  settings/                     runtime-configurable credentials
  sellers/sellers.service.ts    create-seller, public keys, balances, tokens
  sales/sales.service.ts        all three payment flows, capture, refund
  subscriptions/                generate, pause, resume, cancel, set-price
  callbacks/callbacks.service.ts  verify-then-act, plus the event log
  admin/admin.controller.ts     partner-scoped operator tools

frontend/src/
  lib/payme-hosted-fields.ts    the only place the browser talks to PayMe
  lib/money.ts                  the mirror of the backend's money rules
  pages/Checkout.tsx            the three flows, implemented side by side
  pages/AdminCallbacks.tsx      the callback log and the local simulator
```

## Running it

```bash
cp .env.example .env     # fill in PAYME_CLIENT_KEY / PAYME_CLIENT_SECRET
make dev
```

Then open the frontend, sign in as the seeded admin (`ADMIN_EMAIL` /
`ADMIN_PASSWORD` from `.env`), and work through: register a user → list a
product → open a seller → take a payment.

Sandbox test values are pre-filled throughout the UI. The full list is in
[PayMe's own docs](https://payme.stoplight.io/docs/payments/v781p5enpoq9x-test-cards-and-payment-methods).
