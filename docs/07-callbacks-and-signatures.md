# 07 — Callbacks and signatures

**This is the security-critical page.** Everything else in this integration
either fails loudly or costs you a support ticket. Getting this wrong gives
away merchandise.

## The problem

Your callback endpoint is a public URL that PayMe POSTs "this sale was paid" to.
It has to be public — PayMe's servers cannot hold a session with you, cannot log
in, and will not present a client certificate.

So anyone who learns the URL can POST the same shape. If your handler fulfils an
order on receipt, you have built a form for issuing free merchandise.

`payme_signature` is what stands between those two situations, and it is the
*only* thing that does.

## The formula

An md5 of four values concatenated with no separator:

```
SALE:         md5(client_key + client_secret + payme_transaction_id + payme_sale_id)
SUBSCRIPTION: md5(client_key + client_secret + transaction_id       + sub_payme_id)
```

- `client_key` — your partner key. The same value you send as `payme_client_key`.
- `client_secret` — your partner secret. **Never transmitted to PayMe on any
  request.** That is what makes the hash unforgeable: an attacker who has seen
  every byte of your outbound traffic still does not know it.

md5 is PayMe's choice, not a recommendation. It is used here only to reproduce a
digest PayMe generated the same way. Compare in constant time regardless, so the
endpoint does not leak the expected value byte by byte — `digestsMatch` in
`payme-signature.ts` uses `timingSafeEqual`.

## The trap: `transaction_id` means two different things

| Where | What `transaction_id` holds |
|---|---|
| `generate-sale` request (outbound) | **your** order id |
| Sale callback | **PayMe's** transaction guid — also present as `payme_transaction_id`, the key the sale hash reads |
| Subscription callback | **PayMe's** transaction guid — the key the subscription hash reads |

The third value in the hash is always PayMe's transaction guid; the only thing
that changes between the two flows is which key carries it. The order id you
sent is never hashed, and feeding it in produces a mismatch that looks exactly
like a wrong secret, which sends you off checking credentials that were fine all
along.

`verifySaleSignature` and `verifySubscriptionSignature` are separate functions
for this reason — there is no shared "verify" that takes a field name, because
that is precisely the parameter people get wrong.

## Four outcomes, not two

```ts
type SignatureStatus = 'valid' | 'invalid' | 'unsigned' | 'unverifiable';
```

- **`valid`** — signature present and correct. Act on it.
- **`invalid`** — present and wrong. Reject, and record it: a run of these is
  either a misconfigured secret or someone probing your endpoint.
- **`unsigned`** — PayMe sent `payme_signature: null`. **Not a forgery.** PayMe
  sends null when the notification has no completed transaction behind it — a
  `sub-create` for a subscription nobody has paid, or a failed sale. There is
  nothing to sign. Record it; never let it move money.
- **`unverifiable`** — no client secret configured, so the check could not run.
  This app records and refuses to apply. Refusing is the safe failure mode:
  "we could not check" must never read as "it was fine".

**Seller callbacks (`seller-create`, `seller-update`, `seller-approve`) carry no
signature at all.** PayMe does not sign them, because they assert nothing about
money. Treat them as a hint to re-read state:
`CallbacksService.handleSellerCallback` ignores the payload's own
`seller_approved` and calls `get-sellers` instead.

## Handler rules

**1. Verify, then act. Never the reverse.**

```ts
const signature = verifySaleSignature(body, clientKey, clientSecret);
if (!signature.ok) return this.reject(event, signature);
// only now touch application state
```

**2. Always answer 200 — even on rejection.** PayMe retries a non-2xx, and
retrying cannot fix a bad signature or an unknown sale id; it just buries the
real event under duplicates. Record the rejection and answer 200.

**3. Every value is a string.** PayMe POSTs
`application/x-www-form-urlencoded`, so `status_code` arrives as `"0"` and
`is_token_sale` as `"0"` — both truthy. `body.status_code === 0` is always
false. Coerce before you compare.

**4. Do not validate the body against a strict DTO.** PayMe's payloads carry
dozens of fields and gain more between versions. Nest's global `ValidationPipe`
runs with `forbidNonWhitelisted`, so a DTO here would start rejecting real
callbacks the day PayMe adds a field. `CallbacksController` types the body as a
plain `Record<string, unknown>`, which makes the pipe skip it.

**5. A missing field is not a zero.** See the bug described in
[06](06-subscriptions.md) — a partial callback wiped a subscription's price.

**6. Be idempotent.** PayMe retries what it could not deliver, and the same
notification can arrive more than once. Recording what you have processed is
what stops an order shipping twice. The `callback_events` table exists for this
as much as for the UI.

## Local development

PayMe refuses to POST to localhost, and refuses to *accept* a localhost URL at
all — `generate-sale` fails outright with error 21. See
[01](01-configuration.md). Two options:

### A tunnel (real callbacks)

```bash
cloudflared tunnel --url http://localhost:3000
# or
ngrok http 3000
```

Set `PUBLIC_BASE_URL` to the tunnel URL. Callbacks now arrive for real.

### The simulator (no tunnel)

`POST /api/callbacks/payme/simulate` (admin only, refuses to run against
production) builds a **correctly signed** payload from the configured key and
secret and feeds it through the real handler. The signature check is genuinely
exercised, not bypassed.

Set `"signed": false` to produce a deliberately wrong signature and watch it be
rejected. **Do this at least once.** A signature check you have never seen
reject anything is a signature check you have not tested.

**Its limitation, which is itself instructive:** a simulated callback moves only
*your* side of the world. PayMe's copy of the sale is untouched. Simulate
`sale-authorized` and your row says `authorized` while PayMe's still says
`initial`, so a real `capture-sale` then fails with error 305. That divergence
is not a bug — it is a demonstration that PayMe, not your database, is the
source of truth for what a sale is.

## The redirect is not a callback

PayMe also appends a `payme_signature` to `sale_return_url` when it bounces the
buyer's browser back. It can be verified the same way — but the buyer controls
that browser and may close the tab, so it can simply never happen. Render a
receipt from it; do not fulfil an order from it. See
`frontend/src/pages/CheckoutReturn.tsx`, which displays the query string and
takes its actual status from the API.

## Reading list in the code

- `backend/src/payme/payme-signature.ts` — the formula, the four outcomes, the constant-time compare
- `backend/src/callbacks/callbacks.service.ts` — verify-then-act, and the coercion helpers
- `backend/src/callbacks/callbacks.controller.ts` — why no DTO, why always 200, the simulator
- `backend/src/callbacks/callback-event.entity.ts` — why rejected callbacks are stored too
- `frontend/src/pages/AdminCallbacks.tsx` — the log and the simulator UI
