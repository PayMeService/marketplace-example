# marketplace-example — working notes

A worked PayMe integration. The repo exists to be **read**, so the bar for
comments and docs is higher than for ordinary application code: explain why a
call is shaped the way it is, not what the line does.

## Before touching anything PayMe-related

Use the `payme-docs` skill. PayMe's field names are terse and non-obvious
(`seller_payme_id`, `sale_price` in agorot, `market_fee`, `capture_buyer`), and
a plausible guess like `amount` or `merchant_id` compiles, passes review, and
fails in production. Look it up rather than recalling it.

`/home/omer/Projects/infra-tools/sources/php/payme-genesis/` is PayMe's own
backend. It is the authority for behaviour the public docs do not state — the
callback signature formula was recovered from `Sale::generateSignature` and
`Subscription::generateSignature` there.

## Commands

```bash
make dev                       # dev stack (ports come from .env)
cd backend  && pnpm run build  # typecheck
cd frontend && pnpm run build  # typecheck + bundle
docker compose -f docker-compose.dev.yml logs backend --tail 50
```

Use `docker compose`, never `docker-compose`.

## Non-negotiables in this codebase

- **Money is integer minor units everywhere.** Convert only at the display edge.
  `common/money.ts` and `lib/money.ts` are the two mirrors; keep them in step.
- **`status_code === 0` is the success test**, never the HTTP status.
- **Verify the signature before acting on a callback.** Never reorder this.
- **PayMe's field names stay snake_case and verbatim** in `payme.types.ts`, so
  the file can be diffed against Stoplight. Renaming happens in the service
  layer, not the transport layer.
- **Callback routes take `Record<string, unknown>`, not a DTO.** The global
  `ValidationPipe` runs with `forbidNonWhitelisted`; a DTO would start rejecting
  real callbacks the day PayMe adds a field.
- **A missing field in a callback is not a zero.** Guard every applier write on
  presence — this was a real bug that wiped a subscription's price.
- **Secrets never reach the browser.** `clientSecret` is write-only over the API;
  `buyerKey` and `paymeSecret` are `select: false` and absent from view models.

## Things learned from the sandbox that are not in the docs

- `sale_return_url` is validated exactly like `sale_callback_url`: a localhost
  value fails the whole `generate-sale` with error 21. Both are omitted when the
  configured base URL is local.
- `capture-sale` honours `language` even though its documented body does not list
  it. Without it, errors come back in Hebrew.
- `seller_id` on `create-seller` is rejected with error 790 on some partner
  plans, despite being documented as optional. Not sent.
- Sole proprietors and exempt dealers (`seller_inc` 2 and 5) must have
  `seller_inc_code` equal to `seller_social_id`.
- A partner's own MPL cannot generate sales — error 174.
- `PayMe.create` instances are single-use; `mount()` appends rather than
  replaces, so containers must be cleared before remounting.

## Style

Match the surrounding code. Comments explain the PayMe behaviour that motivated
the code, and cite the Stoplight URL when quoting a rule. Prose in `docs/` is for
narrative and cross-cutting concerns; inline comments are for the "why" of one
specific line.
