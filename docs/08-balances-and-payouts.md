# 08 — Balances and payouts

## There is no "get balance" endpoint

A seller's balance arrives as `seller_wallets` on `POST /get-sellers`, keyed by
currency:

```json
"seller_wallets": {
  "ILS": { "wallet_currency": "ILS", "wallet_total": 12500, "wallet_releasable": 4500 }
}
```

Both figures are in minor units.

| | |
|---|---|
| `wallet_total` | Everything PayMe holds for this seller. |
| `wallet_releasable` | The part past its release date — withdrawable now. |
| the difference | Money from recent sales still inside PayMe's clearing window. |

The seller dashboard shows all three, labelling the gap "Clearing", because
"why is my balance 12,500 but I can only withdraw 4,500" is the question every
seller asks first.

> There is a `POST /api/payments/balance` in PayMe's platform, but it is for
> prepaid-card balances (Verifone), not seller wallets. Do not reach for it here.

## Two reasons a balance is not withdrawable

**1. The clearing window.** Ordinary settlement timing. `sale_release_date` on
the sale details tells you when a given payment becomes releasable.

**2. The seller is not approved.** PayMe pays out only once three documents are
verified — social ID, bank account, corporate certificate. This does *not* pin
`wallet_releasable` to zero: the wallet keeps recalculating as sales clear, so
an unapproved seller can show a full releasable balance and still have
`withdraw-balance` refused. Read the number as "past its release date", not as
"withdrawable today" — approval is the second condition.

The second one catches people out because payments work perfectly meanwhile. A
seller can trade all week and then discover they cannot be paid. Surface the
approval state and the `seller_dashboard_signup_link` prominently — this app
does so on both the seller dashboard and the admin sellers page, and the admin
"Withdraw" button is disabled with an explanatory tooltip for unapproved sellers.

## Paying out

```json
POST /withdraw-balance
{
  "payme_client_key":    "…",
  "seller_payme_id":     "MPL…",
  "withdrawal_currency": "ILS",
  "language":            "en"
}
```

Omitting `transaction_ids` withdraws everything releasable. Pass an array of
transaction guids (from `get-transactions`) for a partial withdrawal.

Completion arrives later as a `withdrawal-complete` callback:

| Attribute | |
|---|---|
| `notify_type` | `withdrawal-complete` |
| `seller_payme_id` | which seller |
| `tran_payme_code` | PayMe's withdrawal code |
| `tran_total`, `tran_currency` | amount |
| `tran_type` | `40` — bank withdrawal |

Related query endpoints: `get-withdrawals` (past) and `get-future-withdrawals`
(scheduled).

## The marketplace's own cut

`market_fee` is a percentage of each sale, VAT included, charged **on top of**
PayMe's processing fees and **transferred to the marketplace once a month** —
not per sale, and not into the seller's wallet.

So the marketplace's revenue does not appear in any seller's balance, and it is
not something you withdraw with `withdraw-balance`. It arrives on PayMe's own
monthly cycle.

The fee is fixed when a sale is *generated*. Changing a seller's `market_fee`
affects future sales only; sales already created keep what they were created
with, including authorizations not yet captured.

## Efficiency note

A partner may pass an **array** of `seller_payme_id` to `get-sellers`. The admin
page uses that to refresh the whole table in one call rather than one per row —
worth doing from the start, because the N+1 version works fine with three
sellers and falls over at three hundred.

## Reading list in the code

- `backend/src/sellers/sellers.service.ts` — `fetchFromPayMe`, and `toBalances`
- `backend/src/admin/admin.controller.ts` — the batched list, `withdraw`, `market-fee`
- `frontend/src/pages/SellerDashboard.tsx` — total / releasable / clearing
