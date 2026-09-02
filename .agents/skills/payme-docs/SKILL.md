---
name: payme-docs
description: Look up PayMe's own API documentation (payme.stoplight.io) as local markdown — endpoints, request/response fields, payment flows, seller onboarding, subscriptions, tokenization, 3D Secure, invoices, POS, webhooks and callbacks. Use this whenever a question touches how PayMe's API actually behaves- parameter names and whether they're required, what a sale/seller/subscription payload looks like, which endpoint performs an action, what a status code or callback means, or when writing/reviewing code that calls PayMe. Reach for it even when the user doesn't say "docs" or "Stoplight" — questions like "what fields does generate-sale take", "how do we refund a payment", "why is this sale returning 500", or "add a capture call here" are all cases where guessing from memory produces plausible-but-wrong field names.
---

# PayMe API Documentation

PayMe's API reference lives at https://payme.stoplight.io. This skill mirrors it
into `~/.cache/payme-docs/` as markdown so you can grep and read it directly
instead of guessing at field names or fetching pages one at a time.

The scripts referenced below sit next to this file. Set this once and reuse it:

```bash
DOCS=~/.cache/payme-docs
FETCH=<this-skill-dir>/scripts/fetch_payme_docs.py
```

Getting this wrong is expensive in a specific way: PayMe's payloads use terse,
non-obvious names (`seller_payme_id`, `sale_price` in agorot, `market_fee`,
`capture_buyer`), and a plausible guess like `amount` or `merchant_id` will
compile, pass review, and fail in production. When a question is about what the
API actually accepts or returns, read it here rather than recalling it.

## Step 1 — make sure the docs are present

The docs are a local cache, not part of any repo, so a machine that hasn't run
this skill before won't have them. Check first:

```bash
ls $DOCS/INDEX.md 2>/dev/null || echo "MISSING"
```

If it's missing, fetch it (~35 seconds, no auth, no dependencies):

```bash
python3 $FETCH
```

Fetch without asking permission when the docs are simply absent — it's a
read-only download from a public site into a cache directory outside the
repo, and the alternative is answering from memory. Do mention that you're
doing it, since it's a visible pause.

If the docs are already there, use them as-is. Only re-fetch when the user asks
for fresh docs, or when you suspect the answer you found is out of date:

```bash
python3 $FETCH --check
```

This compares stored commit hashes against the live ones — one request per
project, about a second — and prints `CURRENT` or `STALE`. Re-running the full
fetch overwrites the tree in place.

## Step 2 — find the right page

The directory tree mirrors PayMe's published navigation, so the path itself
tells you where you are:

```
~/.cache/payme-docs/
  INDEX.md                              projects, branches, page counts
  payments/                             the main API reference
    introduction/
    api-reference/
      hosted-payment-page/
        README.md                       service overview + operation table
        generate-payment.md             one operation, with schemas + examples
      merchants-management/
        create-seller.md
        business-fields.md
      subscriptions/
        schemas/
  guides/                               conceptual guides and how-tos
```

Only `payments` and `guides` are fetched by default — they answer almost
everything. The workspace also publishes `keep` (accounting), `4-b2b-payments`
and `products-customers`; see [Scope](#scope-and-options) to pull those in.

Start with `INDEX.md` for the lay of the land. A directory's `README.md` covers
the section or service and lists what's inside; the sibling `.md` files are its
pages.

PayMe's pages cross-reference each other constantly, and those links are
rewritten to relative paths at fetch time, so you can follow them straight to
the next file:

```markdown
By using the [VAS-Enable API request](../../payments/api-reference/apple-pay/activate-service.md), ...
```

A link left as an absolute `payme.stoplight.io` URL means that page is not in
your local set — either it belongs to a project this fetch skipped, or PayMe
has unpublished it. Front matter `source:` stays absolute by design; that's the
citation, and so are the section links described below.

Grep is usually faster than browsing. Some patterns that work well:

```bash
# which endpoint does X?
grep -ril "refund" $DOCS/ | head

# find operations by HTTP path or method
# (several services can expose the same path — the directory tells them apart)
grep -rl 'path: "/generate-sale"' $DOCS/
grep -rl 'method: "POST"' $DOCS/payments/

# where is a specific field documented, and is it required?
grep -rn "seller_payme_id" $DOCS/ | head
grep -A2 '`sale_price`' $DOCS/payments/api-reference/hosted-payment-page/generate-payment.md
```

Operation pages carry front matter with `method` and `path`, which makes
"what handles this route" a one-line grep.

## Step 3 — read it carefully, then answer

Each operation page has the same shape:

- Front matter — `source` (the live URL), `method`, `path`, `stoplight_id`
- **On this page** — deep links to the description's own headings and to the
  request and response panels
- Prose description, often with PayMe's own caveats and cross-links
- **Parameters** — name, location, type, required
- **Request Body** — a property table with types, required flags and
  descriptions, plus real request examples
- **Responses** — per status code, with property tables and examples

The required column matters. PayMe marks relatively few fields required, so
"not required" is real information, not a gap in the docs.

Any page with more than one section opens with an **On this page** block: one
entry per heading, already resolved to the URL that opens on that section.

```markdown
## On this page

- [Sale Callback Notification Types](https://payme.stoplight.io/docs/guides/i90qmmbdut067-sale-callbacks?branch=main#sale-callback-notification-types)
```

On articles, services and models the entries are the prose's own headings. On
operations they also cover the panels Stoplight builds from the OpenAPI
definition — `#Request`, `#Path-Parameters`, `#Query-Parameters`,
`#request-headers`, `#request-body`, `#Responses`, `#response-body` — whose ids
are fixed strings rather than slugs, mixed case included.

When you quote or rely on a page, cite its `source` URL rather than the local
path — the local copy is a gitignored artifact that the user may not have, and
the Stoplight URL is what they can actually open and share. Where the page has
an **On this page** block, cite the anchored section link instead of the bare
page: these pages run long and cover several unrelated questions, so the
whole-page URL leaves the reader hunting for the paragraph you actually used.

If the docs genuinely don't cover something, say so plainly instead of
inferring a field name that looks right. A wrong parameter in payment code is
worse than an admission that the reference is silent.

## Scope and options

The default fetch is `payments` + `guides` — ~117 pages in ~35s. Widen or
narrow it as needed:

```bash
# every project in the workspace (adds keep, b2b, products-customers; ~2x slower)
python3 $FETCH --all-projects

# just one area
python3 $FETCH --projects keep

# a non-default branch
python3 $FETCH --projects payments --branch V1.5

# keep a copy inside a repo instead of the cache (gitignore it there)
python3 $FETCH --out docs/payme-api
```

Useful flags: `--check` (staleness only), `--projects` (slugs from `INDEX.md`),
`--all-projects`, `--branch`, `--max-examples` (default 3), `--out`,
`--workers`, `--no-link-rewrite` (keep cross-references as absolute URLs).

Narrowing the set is safe to repeat: project directories the script wrote on a
previous, wider run are removed when they're no longer fetched, so you never
end up reading docs that quietly stopped being refreshed. Directories it didn't
create are left alone.

## When the fetch fails

The script depends on Stoplight's private endpoints, so a redesign on their end
can break it. Errors are written as plain messages, not tracebacks.

- `no Stoplight workspace state` — the landing page no longer embeds the
  workspace id where the script looks for it.
- `request failed after 3 tries` — network, or Stoplight is down. Confirm by
  opening https://payme.stoplight.io.
- Individual `! skipping <slug>` lines — one page failed; the rest still wrote.
  Fine to ignore unless it's the page you need.

`references/stoplight-api.md` documents the endpoints, the id scheme and the
quirks the script works around. Read it before debugging the script — the
non-obvious parts (how the workspace id is recovered, why operations come from
the OpenAPI export, how nav grouping works) are explained there.

Docs are always fetched fresh from the public site, so if the script is broken
and you can't fix it quickly, fall back to reading the relevant page directly
from payme.stoplight.io rather than answering from memory.
