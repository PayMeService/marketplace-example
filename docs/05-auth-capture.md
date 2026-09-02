# 05 — Authorize and capture

Also called pre-authorization, or J5 as opposed to J4. Reserve the money on the
buyer's card now; take it later, when you actually ship.

```
generate-sale  sale_type: "authorize"   → buyer pays → status "authorized"
capture-sale                            → status "completed", money moves
```

Between those two the funds are held on the buyer's card and unavailable to
them, but they are not yours either.

## The rules PayMe enforces

**168 hours.** The reservation lasts seven days. Capture after that and the
request fails; the hold lapses on its own and the buyer's money is released.

**Capture happens once.** Fully or partially — but there is no second capture.
If you capture 30 of a 100 authorization, the remaining 70 is released, not
available for a later capture. Decide the final amount before you call.

**The sale must actually be authorized.** Creating it with
`sale_type: "authorize"` is not enough — the buyer has to complete the payment
first. Calling capture on a sale still in `initial` gives:

```json
{
  "status_code": 1,
  "status_error_code": 305,
  "status_error_details": "Cannot perform action due to an incorrect status",
  "status_additional_info": "initial"
}
```

`SalesService.capture` checks `saleType` and `status` locally first, so the
common mistakes produce a message in your own vocabulary rather than that one.

> `capture-sale` is documented as taking only `payme_client_key`,
> `seller_payme_id` and `payme_sale_id`. It also honours `language`, which is
> not documented — and without it the error above comes back in Hebrew. This app
> sends `language: "en"`.

## Voiding

To release an authorization instead of settling it, **refund it**. There is no
separate void endpoint: `refund-sale` on an uncaptured authorization releases
the hold, and PayMe reports the result as `voided` rather than `refunded`.

The Sales page labels the button "Void" when the sale is authorized and "Refund"
when it is completed. Same call underneath.

## When to use it

The classic case is physical goods: authorize at checkout, capture when the
parcel leaves. You have the buyer's committed funds without having taken money
for something you have not sent, and cancelling before dispatch costs nothing —
a void is cleaner than a refund, for you and for the buyer's statement.

Also good for: rentals and deposits, anything with a variable final amount (fuel,
metered usage), and marketplaces where the seller has to confirm availability
before the sale is real.

Not good for: anything you cannot settle within seven days, or where you need to
capture more than once.

## Marketplace-specific note

The `market_fee` is fixed when the sale is *generated*, not when it is captured.
Changing a seller's fee between authorization and capture does not retroactively
change what the marketplace takes on that sale.

## In this app

- Choose "authorize — reserve now, capture later (J5)" on the checkout page.
- The Sales page shows **Capture** and **Void** on authorized rows, and warns
  about the 168-hour window whenever any authorization is outstanding.
- Both were verified end to end against the sandbox: a real card authorization
  captured cleanly and then refunded.

## Reading list in the code

- `backend/src/sales/sales.service.ts` — `capture()` and `refund()`, with the guards
- `frontend/src/pages/Sales.tsx` — the status-driven action set
