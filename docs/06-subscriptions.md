# 06 — Subscriptions

`generate-subscription` sets up a recurring charge. After that **PayMe drives
the schedule** — it charges each iteration on its own clock and tells you about
it by callback. There is no "charge the next iteration" endpoint, and polling is
the wrong shape for this.

## Creating one

```json
POST /generate-subscription
{
  "seller_payme_id":    "MPL…",
  "sub_price":          4990,        // ONE iteration, in minor units
  "sub_currency":       "ILS",
  "sub_description":    "Monthly clay club",
  "sub_iteration_type": "3",         // 1 daily, 2 weekly, 3 monthly, 4 annually — a STRING
  "sub_iterations":     -1,          // -1 = until cancelled
  "sub_start_date":     "24/08/2026",// dd/mm/yyyy, optional
  "sub_callback_url":   "…",
  "sub_return_url":     "…",
  "buyer_key":          "BUYER…"     // optional — see below
}
```

`sub_price` is the price of a **single iteration**, not the lifetime total.

Note the type inconsistency, which is PayMe's and not smoothed over here:
`sub_iteration_type` is a string, `sub_iterations` is a number.

### With or without a token

**Without `buyer_key`** — the response carries `sub_url`, a hosted page where the
buyer enters their card. The subscription sits in `initial` until they do, then
flips to `active` and the first iteration is charged.

**With `buyer_key`** — the subscription activates immediately. No page, no buyer
interaction. This is the upgrade path: a buyer who already paid you once, and
whose card you tokenized with `capture_buyer`, never has to re-enter anything.

## The status machine

| | Status | Meaning |
|---|---|---|
| 1 | `initial` | Created; nobody has paid. |
| 2 | `active` | Running. |
| 3 | `paused` | Stopped, reversibly. |
| 4 | `failed` | An iteration failed and PayMe gave up. |
| 5 | `cancelled` | **Terminal.** Cannot be resumed. |
| 6 | `completed` | All iterations ran. |
| 76 | `failed`, retrying | An iteration failed; PayMe will retry automatically. |

**Pause is reversible, cancel is not.** A cancelled subscription cannot be
brought back — the buyer has to start a new one, which usually means re-entering
a card. If there is any chance you will want it back, pause. The UI confirms
before cancelling and says exactly this.

**76 is not a failure you should act on.** PayMe is going to try again. Dunning
the customer on a 76 means emailing them about a payment that is about to
succeed.

## The actions

| Action | Call | Notes |
|---|---|---|
| Cancel | `POST /cancel-subscription` | `seller_payme_id` + `sub_payme_id`. Terminal. |
| Pause | `POST /pause-subscription` | Reversible. |
| Resume | `PATCH /subscriptions/{sub_payme_id}/resume` | REST-shaped. Seller identified by the **`PayMe-Merchant-Key` header**, not a body field. |
| Change price | `PATCH /subscriptions/{sub_id}/set-price` | `sub_price` as a **string** here. Applies from the next iteration. |

The last two are worth flagging: most of PayMe's API is RPC-shaped POSTs with
the identifiers in the body, and these two are not. Sending `seller_payme_id` in
a body to `/resume` does nothing at all — it has to be the header.

## Callbacks

| `notify_type` | When |
|---|---|
| `sub-create` | Subscription created. Nothing charged yet. |
| `sub-active` | First payment succeeded. |
| `sub-iteration-success` | A scheduled iteration was charged. |
| `sub-iteration-skipped` | An iteration's date passed without a charge. |
| `sub-failure` | An iteration failed. |
| `sub-pause` / `sub-cancel` / `sub-complete` | Lifecycle. |

**The signature uses different fields from a sale's:**

```
md5(client_key + client_secret + transaction_id + sub_payme_id)
```

`transaction_id` here is PayMe's **transaction guid**. On a sale callback the
identically-named field holds **your order id**, and the hash uses
`payme_transaction_id` instead. This is the single most confusing thing in the
whole integration; see [07](07-callbacks-and-signatures.md).

**`sub-create` legitimately arrives unsigned.** Nothing has been charged, so
there is no transaction to sign. `CallbacksService` accepts unsigned
`sub-create`, `sub-cancel` and `sub-pause` — none of which assert that money
moved — and rejects an unsigned or badly-signed anything else.

## A partial callback must not clobber good data

PayMe does not send every field on every notification: a `sub-cancel` carries far
less than a `sub-iteration-success`. Every value arrives as a string, so it has
to be coerced — and the trap is defaulting a *missing* field to `0`:

```ts
sub_price: num(body.sub_price) ?? 0   // ← turns "no news" into "the price is zero"
```

`SubscriptionsService.applyDetails` therefore guards every write on the field
being **present**, and `coerceNumericFields` drops absent keys rather than
zeroing them. This was a real bug in this codebase, caught by a simulated
`sub-iteration-success` that carried no price and wiped it to 0.

## Reading list in the code

- `backend/src/subscriptions/subscriptions.service.ts` — the calls and the guarded applier
- `backend/src/subscriptions/subscription.entity.ts` — the status and iteration enums
- `backend/src/callbacks/callbacks.service.ts` — signature handling and numeric coercion
- `frontend/src/pages/Subscriptions.tsx` — the list, the actions and the lifecycle panel
