# 04 — Tokens and saved cards

A **buyer token** (`buyer_key`) stands in for a card. Once you hold one you can
charge that card again with no buyer interaction and no 3-D Secure prompt — the
card was verified when the token was minted. It is what makes one-click repeat
purchases, subscriptions and back-office charges possible.

It is also a bearer credential: anyone holding it can charge that buyer through
your account. Treat it like a password.

## Three ways to get one

### 1. `capture_buyer` on a sale

The usual route. Add `capture_buyer: "1"` to `generate-sale` and PayMe tokenizes
the card as a side effect of the payment; the token comes back as `buyer_key`
on the callback.

```ts
request.capture_buyer = '1';   // a STRING flag: "1" capture, "0" don't
```

**`capture_buyer` and `buyer_key` are mutually exclusive.** You either tokenize
a new card on this sale or charge an existing token. A request carrying both is
rejected.

### 2. Hosted Fields tokenization

`instance.tokenize(...)` returns `{ token, card, … }`. That `token` **is** a
`buyer_key` — pass it straight to `pay-sale`. See [03](03-payment-flows.md).

`tokenIsPermanent` on `PayMe.create` controls whether it is reusable (default
`true`) or single-use.

### 3. `POST /sellers/{mpl}/tokens` — the partner-scoped endpoint

```
POST /api/sellers/{marketplace_mpl}/tokens
{
  "payment": { "method": "credit-card", … },
  "sale_orig": "SALE…"            // optional: bind to an existing sale
}
```

**The `{mpl}` in the path is YOUR MARKETPLACE's MPL, not a seller's.** That is
the entire point of this endpoint. A token captured under one seller belongs to
that seller; a token minted here belongs to the marketplace, so it can be
charged later on behalf of *any* of your sellers.

Concretely: a buyer saves a card while buying from seller A, and you want to let
them one-click buy from seller B without re-entering it. A seller-scoped token
cannot do that. This one can.

Two shape differences from the older endpoints, both easy to trip over:

- The body is **nested JSAPI-style** — `{ payment: { method, … } }` — not the
  flat snake_case of `generate-sale`.
- The response is a **resource, not PayMe's envelope**: there is no
  `status_code: 0` to check. `PayMeClient` takes `rawEnvelope: true` for this
  call and falls back to the HTTP status.

Pass `sale_orig` with a `payme_sale_id` to bind the token to an
already-generated sale; the response then carries a `redirect_url` to complete
it.

## Recovering a token you lost: `get-buyer-key`

If the callback was missed, or another process created the sale, look the token
up from the sale id:

```json
POST /get-buyer-key
{ "payme_sale_id": "SALE…", "seller_payme_id": "MPL…" }
```

Returns `buyer_key`, `buyer_card_mask`, `buyer_card_expiry`, `buyer_card_brand`.
Wired to the "Fetch token" button on the Sales page.

## Charging one

```json
POST /pay-sale
{
  "seller_payme_id": "MPL…",
  "payme_sale_id":   "SALE…",
  "sale_price":      "5000",
  "currency":        "ILS",
  "installments":    "1",
  "buyer_key":       "BUYER154-0987247Y-MLJ10OI7-LXRDNDYP"
}
```

Or activate a subscription with it — see [06](06-subscriptions.md).

## Storing them

In this app the token lives on the `sales` row, marked `select: false` so it
does not leave the database in an ordinary `find()`, and the sale view model
omits it entirely. Only the dedicated token endpoints ever return one.

For a real deployment:

- Encrypt at rest, or keep them in a vault rather than your primary database.
- Never send one to a browser. There is no client-side use for a `buyer_key`;
  anything that looks like one is a design that should move to the server.
- Never log one. `PayMeClient` has `buyer_key` in its redaction list.
- Show the buyer their `buyer_card_mask` and let them delete the token. It is
  their card.

## Testing

`4000000000000036` in sandbox captures a token successfully but declines when
that token is charged — the way to exercise the "saved card stopped working"
path without waiting for a real card to expire.

## Reading list in the code

- `backend/src/sellers/sellers.service.ts` — `createBuyerToken`, the partner-scoped call
- `backend/src/sales/sales.service.ts` — `capture_buyer`, `payExistingSale`, `fetchBuyerKey`
- `backend/src/sales/sale.entity.ts` — how the token is stored and hidden
- `frontend/src/pages/Checkout.tsx` — the "Direct API with a saved token" tab
