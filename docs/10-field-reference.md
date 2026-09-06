# 10 — Field reference

The parameters this app sends and receives, with the things that are easy to get
wrong. PayMe's own reference is at
[payme.stoplight.io](https://payme.stoplight.io); this is the subset in use here
plus the notes that cost time.

## Conventions across the whole API

| | |
|---|---|
| Amounts | Integers in **minor units**. `5075` = 50.75. Minimum 500. |
| Dates in requests | `dd/mm/yyyy`. Not ISO. |
| Dates in responses | `"2026-07-05 17:45:36"` — space, not `T`. |
| Success | `status_code === 0`. Never the HTTP status. |
| Content type | `application/json` on requests; callbacks arrive as `x-www-form-urlencoded`. |
| Language | `language: "en"` or Hebrew by default. Honoured on more endpoints than are documented. |

## `POST /create-seller`

| Field | Type | Req | Notes |
|---|---|---|---|
| `payme_client_key` | string | ✓ | Partner key. |
| `seller_first_name` / `seller_last_name` | string | ✓ | |
| `seller_social_id` | string | ✓ | `9999999999` in sandbox. |
| `seller_birthdate` | string | ✓ | **dd/mm/yyyy**. |
| `seller_social_id_issued` | string | ✓ | **dd/mm/yyyy**. |
| `seller_gender` | number | ✓ | 0 male, 1 female. |
| `seller_email` | string | ✓ | `random@paymeservice.com` suppresses sandbox mail. |
| `seller_phone` | string | ✓ | |
| `seller_bank_code` | number | ✓ | `54` in sandbox. |
| `seller_bank_branch` | number | ✓ | any 3 digits. |
| `seller_bank_account_number` | string | ✓ | any 6 digits. |
| `seller_description` | string | ✓ | ≤ 255 chars. |
| `seller_site_url` | string | ✓ | |
| `seller_person_business_type` | number | ✓ | MCC. `10114` works. |
| `seller_inc` | number | ✓ | 1 individual, 2 sole proprietor, 3 Ltd, 5 exempt, 6 non-profit. |
| `seller_inc_code` | string | — | Required unless `seller_inc` is 1. **Must equal `seller_social_id` for types 2 and 5.** |
| `seller_merchant_name` | string | ✓ | Required unless `seller_inc` is 1. |
| `seller_address_*` | string | ✓ | city, street, street_number, country (ISO 3166 alpha-2). |
| `market_fee` | number | — | 0.00–60.00. The marketplace's commission. |
| `seller_retail_type` | number | — | 1 card-not-present, 2 card-present. |
| `seller_plan` | string | — | **Values issued by your account manager.** Unknown ones fail. |
| `seller_id` | string | — | Your correlation id. **May be rejected with error 790** on some plans. |

Returns `seller_payme_id`, `seller_payme_secret` (once only), `seller_public_key.uuid`,
`seller_dashboard_signup_link`.

## `POST /generate-sale`

| Field | Type | Req | Notes |
|---|---|---|---|
| `seller_payme_id` | string | ✓ | The **seller's** MPL. A partner MPL fails with error 174. |
| `sale_price` | **number** | ✓ | Minor units, ≥ 500. |
| `currency` | string | ✓ | ISO 4217. |
| `product_name` | string | ✓ | ≤ 500 chars. Shown to the buyer and on the invoice. |
| `transaction_id` | string | — | **Your** order id, for correlation. Not the callback field of the same name, which carries PayMe's transaction guid. |
| `installments` | **string** | — | `"1"`–`"12"` fixed; `"103"`/`"106"`/`"109"`/`"112"` buyer-selectable up to 3/6/9/12. |
| `sale_type` | string | — | `sale` (J4, default), `authorize` (J5), `template`. |
| `sale_payment_method` | string | — | `credit-card` default; `multi` lets the buyer choose. |
| `capture_buyer` | **string** | — | `"1"` / `"0"`. Mutually exclusive with `buyer_key`. |
| `buyer_key` | string | — | Charge a saved token. Mutually exclusive with `capture_buyer`. |
| `market_fee` | number | — | Overrides the seller's default for this sale. |
| `sale_callback_url` | string | — | **Validated. Rejects localhost (error 21).** |
| `sale_return_url` | string | — | **Also validated. Also rejects localhost.** |
| `language` | string | — | `he` default. |
| `layout` | string | — | bit only: `dynamic`, `qr-sms`, `dynamic-loose`. |
| `buyer_name` / `buyer_email` / `buyer_phone` | string | — | Pre-fills. |

Returns `sale_url`, `payme_sale_id`, `payme_sale_code`, `price`, `currency`.

## `POST /pay-sale`

| Field | Type | Req | Notes |
|---|---|---|---|
| `seller_payme_id` | string | ✓ | |
| `payme_sale_id` | string | ✓ | From `generate-sale`. |
| `sale_price` | **string** | ✓ | A string here, a number on `generate-sale`. |
| `currency` | string | ✓ | |
| `installments` | string | ✓ | |
| `buyer_key` | string | ✓* | *Or raw card fields, if you are PCI compliant. |
| `credit_card_number` / `_exp` / `_cvv` | string | — | PCI-compliant merchants only. Not used here. |

Returns the full sale-details payload, including `payme_signature`.

## `POST /capture-sale`

`payme_client_key`, `seller_payme_id`, `payme_sale_id`. Plus `language`, which
is **undocumented but honoured** — without it errors come back in Hebrew.

Requires `sale_type: "authorize"` and status `authorized`, within 168 hours.
Once only.

## `POST /refund-sale`

`payme_client_key`, `seller_payme_id`, `payme_sale_id`, optional
`sale_refund_amount` (minor units; omit for a full refund), `language`.

On an uncaptured authorization this **voids** it — same endpoint, and the
result comes back as `voided`.

## `POST /generate-subscription`

| Field | Type | Req | Notes |
|---|---|---|---|
| `seller_payme_id` | string | ✓ | |
| `sub_price` | number | ✓ | **One iteration**, minor units, ≥ 500. |
| `sub_currency` | string | ✓ | |
| `sub_description` | string | ✓ | |
| `sub_iteration_type` | **string** | ✓ | `"1"` daily, `"2"` weekly, `"3"` monthly, `"4"` annually. |
| `sub_iterations` | **number** | ✓ | `-1` = until cancelled. |
| `sub_start_date` | string | — | dd/mm/yyyy. |
| `buyer_key` | string | — | Activates immediately; no `sub_url` is returned. |
| `sub_callback_url` / `sub_return_url` | string | — | Same localhost rule. |

## Subscription actions

| Call | Shape |
|---|---|
| `POST /cancel-subscription` | `seller_payme_id`, `sub_payme_id`. Terminal. |
| `POST /pause-subscription` | `seller_payme_id`, `sub_payme_id`. |
| `PATCH /subscriptions/{sub_payme_id}/resume` | Seller in the **`PayMe-Merchant-Key` header**. |
| `PATCH /subscriptions/{sub_id}/set-price` | `seller_payme_id`, `sub_price` as a **string**. |

## `POST /get-sellers`

`payme_client_key`, optional `seller_payme_id` (**or an array of them**),
`page_size` (max 500), `page`.

Returns `items[]` with `seller_approved`, `seller_active`, `seller_fees`,
`seller_currencies` and `seller_wallets` — which is where balances live.

## `GET /sellers/{mpl}/public-keys`

Authenticated by the **`PayMe-Partner-Key` header**, not a body field. Returns
`items[].uuid` — the key Hosted Fields needs in the browser.

## `POST /sellers/{mpl}/tokens`

`{mpl}` is **your marketplace's** MPL. Body is nested JSAPI-style
(`{ payment: { method } }`), and the response is a resource rather than PayMe's
envelope — there is no `status_code` to check.

## `POST /get-buyer-key`

`payme_sale_id`, `seller_payme_id`. Returns `buyer_key`, `buyer_card_mask`,
`buyer_card_expiry`, `buyer_card_brand`.

## `POST /withdraw-balance`

`payme_client_key`, `seller_payme_id`, `withdrawal_currency`, optional
`transaction_ids` (partial withdrawal) and `language`.

## Callback payloads

### Sale — `sale-complete`, `sale-authorized`, `refund`, `sale-failure`, `sale-chargeback`, `sale-chargeback-refund`

Key fields: `payme_sale_id`, `payme_sale_code`, `payme_transaction_id`,
`sale_status`, `price`, `currency`, `transaction_id` (**yours**), `buyer_key`
(only when `capture_buyer` was set), `buyer_card_mask`, `installments`,
`sale_paid_date`, `sale_release_date`, `payme_signature`.

```
md5(client_key + client_secret + payme_transaction_id + payme_sale_id)
```

### Subscription — `sub-create`, `sub-active`, `sub-iteration-success`, `sub-iteration-skipped`, `sub-failure`, `sub-pause`, `sub-cancel`, `sub-complete`

Key fields: `sub_payme_id`, `sub_status`, `sub_price`,
`sub_iterations_completed`, `sub_next_date`, `transaction_id` (**PayMe's**),
`payme_signature`.

```
md5(client_key + client_secret + transaction_id + sub_payme_id)
```

### Seller — `seller-create`, `seller-update`, `seller-approve`

**No signature.** Re-read state with `get-sellers` instead of trusting the body.

### Withdrawal — `withdrawal-complete`

`seller_payme_id`, `tran_payme_code`, `tran_total`, `tran_currency`,
`tran_type` (40 = bank withdrawal).

## Status enums

**Sale:** 1 initial · 2 completed · 3 refunded · 4 partial-refund ·
5 authorized · 6 failed · 7 chargeback · 8 canceled · 9 voided ·
10 partial-void · 11 partial-chargeback

**Subscription:** 1 initial · 2 active · 3 paused · 4 failed · 5 cancelled ·
6 completed · 76 failed-pending-retry

**Sale types:** 1 sale (J4) · 5 authorize (J5) · 2 token ·
3 saleFromSubscription · 4 saleFromTemplate · 10 template · 12 sellerToken

**Incorporation (IL):** 1 individual · 2 sole proprietorship · 3 Ltd ·
4 partnership · 5 exempt dealer · 6 non-profit · 7 limited partnership ·
8 public company · 9 cooperative · 10 public benefit company

## Sandbox test cards

| Card | Behaviour |
|---|---|
| `5326105300985846` exp `12/30` cvv `658` id `008336174` | Local Israeli card, ILS only, installments |
| `375516193000090` exp `12/30` cvv `0957` | Israeli international, multi-currency, installments |
| `4557430402053431` exp `12/30` cvv `200` | Non-Israeli, one installment only |
| `4000000000000002` | Declined — card declined |
| `4000000000000051` | Declined — card blocked |
| `4000000000000069` | Declined — card expired |
| `4000000000000127` | Declined — incorrect CVV |
| `4000000000000036` | Token captures, but charging it declines |
