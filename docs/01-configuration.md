# 01 — Configuration and credentials

PayMe's integration involves four distinct credentials and it is very easy to
confuse them. Getting one wrong tends to produce an error that points somewhere
else entirely, so it is worth being precise about what each one is.

## The four credentials

| Credential | Also called | Who holds it | Sent to PayMe? | What it does |
|---|---|---|---|---|
| **Partner key** | `payme_client_key`, `PayMe-Partner-Key`, `merchant_key` | your server | **yes** | Authenticates partner-scoped calls: `create-seller`, `get-sellers`, `capture-sale`, `refund-sale`, `withdraw-balance`. |
| **Partner secret** | `PAYME_CLIENT_SECRET`, `merchant_password` | your server, only | **never** | The one input to the callback signature that an attacker cannot know. Nothing else. |
| **Seller MPL** | `seller_payme_id` | your server | **yes** | Identifies which seller a sale belongs to and whose wallet it lands in. Not a secret, but always sent server-side. |
| **Seller public key** | `seller_public_key.uuid` | your server **and the browser** | yes, from the browser | Initialises Hosted Fields. Its only power is to open a tokenization session. Safe to ship in a bundle. |

There is a fifth, `seller_payme_secret`, returned once by `create-seller`. This
app stores it and never uses it; see [02](02-seller-onboarding.md).

### The distinction that matters most

The **partner key** is sent to PayMe on nearly every call. The **partner
secret** is never sent to PayMe on any call. That asymmetry is the whole design
of the signature scheme: PayMe knows both, you know both, and nobody who has
only intercepted your traffic knows the second one. It is therefore proof that a
callback came from PayMe.

A corollary: putting the partner secret in a request body "just in case" does
not help and actively hurts, because it puts the one value that authenticates
your callbacks onto the wire.

## Environments

| | |
|---|---|
| Sandbox | `https://sandbox.payme.io/api/` |
| Production | `https://live.payme.io/api/` |

Different credentials for each — a sandbox partner key does not work against
live. Selected here by `PAYME_ENV` / the Settings page, and resolved in
`backend/src/payme/payme.client.ts`.

The environment also has to match on the browser side: Hosted Fields is created
with `PayMe.create(publicKey, { testMode: true })` for sandbox. A token minted
in one environment cannot be charged against a sale in the other.

## The two public URLs

PayMe needs to know how to reach you, in two different senses, and this app
keeps them as separate settings because in development they are different
origins:

| Setting | Whose browser/server follows it | Used for |
|---|---|---|
| `PUBLIC_BASE_URL` | **PayMe's servers** | `sale_callback_url`, `sub_callback_url` |
| `PUBLIC_APP_URL` | **the buyer's browser** | `sale_return_url`, `sub_return_url` |

In production, nginx serves the SPA and proxies `/api` on one origin, so both
are the same value. In development, Vite is on `:5173` and the API on `:3000`.
Sending the buyer to the API origin lands them on a 404 instead of a receipt.

### Both are validated by PayMe, and both reject localhost

This is worth stating plainly because it is easy to get wrong in the direction
that costs an afternoon:

```json
{
  "status_code": 1,
  "status_error_code": 21,
  "status_error_details": "Please verify URL validity",
  "status_additional_info": "http://localhost:5173/checkout/return?saleId=…"
}
```

You might reason that a *return* URL is only ever followed by the buyer's own
browser, so localhost ought to be fine. It is not. PayMe validates **both** URL
fields when it receives the request, and rejects the entire `generate-sale`
call — you do not get a sale with a broken redirect, you get no sale.

`PayMeSettingsService` therefore omits either field when its base URL resolves
to localhost, so `generate-sale` still succeeds and PayMe falls back to the URLs
configured on the merchant account. The startup log says so loudly.

To actually receive callbacks in development, run a tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
# or
ngrok http 3000
```

and set `PUBLIC_BASE_URL` to the tunnel URL. Alternatively use the local
callback simulator — see [07](07-callbacks-and-signatures.md).

## Where configuration lives in this app

Credentials are seeded from the environment on first boot into a single-row
`payme_settings` table, after which the row wins. That makes the Settings page
able to repoint the demo at a different partner account without a redeploy.

**This is a demo affordance, not a recommendation.** In a real deployment the
partner secret belongs in a secrets manager — Vault, AWS Secrets Manager, GCP
Secret Manager — not in a database column your application can `SELECT`. The
whole value of that secret is that it stays inside your infrastructure.

The Settings API is write-only for the secret: it reports whether one is set and
never returns it. A secret that round-trips through a settings form ends up in
browser history, devtools, and any error reporter you have installed.

## Reading list in the code

- `backend/src/settings/payme-settings.entity.ts` — the fields, with notes
- `backend/src/settings/payme-settings.service.ts` — URL building and the localhost guard
- `backend/src/payme/payme.client.ts` — base URLs, headers, log redaction
