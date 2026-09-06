# 02 — Seller onboarding

A marketplace user becomes a seller when PayMe issues them an **MPL** — an id
like `MPL17883-384086OC-CFKIBLDG-OO2BWFT1`. Everything afterwards is keyed on
that string: sales, subscriptions, refunds, balances, payouts.

One call does it: `POST /create-seller`, authenticated with your partner key.

## What comes back, and why order matters

```json
{
  "status_code": 0,
  "seller_payme_id": "MPL17883-384086OC-CFKIBLDG-OO2BWFT1",
  "seller_payme_secret": "kUuGbwnxiVjo4Q8WH8fgRTFOLyElK9",
  "seller_public_key": {
    "uuid": "5482a26b-001c-4de1-b099-0c10df469f7b",
    "description": "PayMe-Public-Key",
    "is_active": true
  },
  "seller_id": null,
  "seller_dashboard_signup_link": "https://…/update-details?t=…"
}
```

| Field | Recoverable later? | Notes |
|---|---|---|
| `seller_payme_id` | yes, via `get-sellers` | The one indispensable value. |
| `seller_payme_secret` | **no** | Shown exactly once. Store it encrypted or in a secrets manager. |
| `seller_public_key.uuid` | yes, via `GET /sellers/{mpl}/public-keys` | Needed in the browser for Hosted Fields. |
| `seller_dashboard_signup_link` | no | Where the seller finishes their onboarding and uploads documents. |

Because the secret is unrecoverable, `SellersService.createSeller` writes the
row **before** anything else can throw — including the role promotion that
follows it. A failure after the write is recoverable; a lost secret is not.

## Plans and `market_fee`

This app offers three onboarding plans. Two different things are bundled in
each, and it is worth keeping them apart:

- **`marketFee`** is a real PayMe parameter (`market_fee` on `create-seller`).
  It is the marketplace's commission: a percentage of each sale, VAT included,
  charged **on top of** PayMe's own processing fees and paid out to the
  marketplace monthly. Range 0.00–60.00. It can be overridden per sale by
  sending `market_fee` on `generate-sale`, and changed later with
  `update-seller`. Changing it affects future sales; sales already generated
  keep the fee they were created with.

- **`seller_plan`** is a named bundle of account settings — limits, enabled
  services, withdrawal cadence — that PayMe configures for your partner account.
  **The valid values are issued by your account manager**; there is no public
  list and an unknown value fails the request. `SELLER_PLANS` therefore leaves
  `paymeSellerPlan` undefined, so the demo works on any partner account. Fill it
  in once you have your own plan names.

Everything else on a plan (name, blurb, feature list) is this marketplace's own
product packaging and never reaches PayMe.

## Validation rules PayMe enforces

These are real, and the last two are not in the reference docs — they were found
by making the calls.

**Dates are `dd/mm/yyyy`, not ISO.** `seller_birthdate` and
`seller_social_id_issued` both. `1990-01-01` is rejected. This is the single most
common `create-seller` failure.

**Sole proprietors: business number must equal the owner's social ID.** For
`seller_inc` 2 (עוסק מורשה) and 5 (עוסק פטור), PayMe checks that
`seller_inc_code` matches `seller_social_id`:

> For business type "Sole Proprietorship" the business number must be identical
> to the owner's ID number, but the business number (512345678) is different
> from the ID number (9999999999).

The onboarding form keeps the two fields in sync automatically when that
incorporation type is selected, and the service re-checks before calling out.

**`seller_id` may be rejected outright.** It is documented as an optional
correlation id, but on some partner plans sending it fails the whole request:

```json
{
  "status_code": 1,
  "status_error_code": 790,
  "status_error_details": "A parameter is missing or cannot be set on this plan",
  "status_additional_info": "seller_id"
}
```

This app does not send it and correlates on `seller_payme_id` instead, which
always works. If your account permits `seller_id`, adding it makes
reconciliation easier — the field is echoed back on `get-sellers` and callbacks.

## Sandbox values that always pass

From PayMe's `create-seller` docs:

| Field | Value |
|---|---|
| `seller_social_id` | `9999999999` |
| `seller_email` | `random@paymeservice.com` — suppresses automated mail |
| `seller_bank_code` | `54` |
| `seller_bank_branch` | any 3 digits, e.g. `123` |
| `seller_bank_account_number` | any 6 digits, e.g. `123456` |
| `seller_person_business_type` | `10114` works; see the [MCC list](https://payme.stoplight.io/docs/guides/u62g6pktpkr2t-israeli-mcc-list) |

## Approval gates payouts, not payments

A brand-new seller comes back with `seller_approved: false`, and stays that way
until PayMe verifies three documents: social ID, bank account, and corporate
certificate. Meanwhile:

- **Payments work.** The seller can take money from the moment the MPL exists.
- **Payouts do not.** `wallet_releasable` still recalculates as sales pass
  their release date, so the seller can be looking at a healthy withdrawable
  figure — but `withdraw-balance` is refused until the documents are verified.

So: do not gate checkout on approval — that stops sellers earning for no reason.
Do surface the state and the `seller_dashboard_signup_link` prominently, because
the seller cannot get paid until they act on it. Both the seller dashboard and
the admin sellers page do this.

## Reading state back

`POST /get-sellers` with the partner key is the source of truth for approval,
fees, enabled currencies and wallet balances. A partner may pass an array of
`seller_payme_id` to fetch many at once, which is what the admin page does —
one call for the whole table rather than one per row.

This app deliberately does **not** mirror those fields into its own database
beyond a cached `approved`/`active` flag for display. They change on PayMe's
side without notifying you, so a local copy goes stale silently.

## Seller callbacks

`seller-create`, `seller-update` and `seller-approve` are POSTed to your default
callback URL. **They carry no `payme_signature`** — PayMe does not sign them,
because they assert nothing about money.

Treat them as a hint to re-read state, never as fact. `CallbacksService.
handleSellerCallback` ignores the payload's own `seller_approved` and calls
`get-sellers` instead. An unsigned body is not evidence.

## Reading list in the code

- `backend/src/sellers/seller-plans.ts` — plans, and the `market_fee` / `seller_plan` distinction
- `backend/src/sellers/sellers.service.ts` — the call, the ordering, the validation mirror
- `backend/src/sellers/dto/create-seller.dto.ts` — every field with its PayMe meaning
- `frontend/src/pages/BecomeSeller.tsx` — the form, with sandbox defaults
