# Stoplight's undocumented docs API

Reverse-engineered from payme.stoplight.io. Read this before debugging
`scripts/fetch_payme_docs.py` — every non-obvious thing it does is here.

Stoplight publishes no official API for public docs sites. Everything below is
what their own frontend calls, so it can change without notice. All of it is
public: no auth, no cookies, no API key.

## Contents

- [The crawl chain](#the-crawl-chain)
- [The id scheme](#the-id-scheme)
- [Recovering the workspace id](#recovering-the-workspace-id)
- [Node payloads by type](#node-payloads-by-type)
- [Why operations come from the OpenAPI export](#why-operations-come-from-the-openapi-export)
- [How the navigation tree encodes grouping](#how-the-navigation-tree-encodes-grouping)
- [Heading anchors](#heading-anchors)
- [Known limits](#known-limits)
- [Endpoints that do not exist](#endpoints-that-do-not-exist)

## The crawl chain

```
GET /                                                    landing page HTML
GET /api/v1/workspaces/{workspaceId}/projects            all projects
GET /api/v1/projects/{projectId}                         project metadata
GET /api/v1/projects/{projectId}/branches                branches + commit hash
GET /api/v1/projects/{projectId}/table-of-contents?branch=X   the page list
GET /api/v1/projects/{projectId}/nodes/{slug}?branch=X        one page
```

`table-of-contents` is the only way to enumerate pages — there is no list-all
or search endpoint on the public API.

## The id scheme

Stoplight ids look opaque but are just base64 of `<kind>:<numeric id>`, with
padding stripped:

| id | decodes to |
| --- | --- |
| `d2s6NjMyNDY` | `wk:63246` |
| `cHJqOjkxNzAy` | `prj:91702` |
| `YnI6NTU4ODQwNQ` | `br:5588405` |

This is why nothing needs to be hardcoded: given the numeric workspace id from
the landing page, the opaque form the API wants can be rebuilt.

**Node ids are not stable across branches.** The same logical page gets a
different id per branch — `capture-sale` is `1e27a49a0a83a` on V1.6 and
`cyl5trr3ph04g` on V1.7 — and PayMe's pages link to older branches all the
time. Matching a link by id alone therefore misses real cross-references. The
readable half of the slug (`capture-sale`) does survive across branches, so the
link rewriter falls back to that, scoped to the project the link named and
accepted only when it is unambiguous.

## Recovering the workspace id

The workspace id is not exposed by any endpoint — you need it to call the API,
but no public call returns it. It is server-rendered into the landing page as
Overmind state:

```html
<script id="store-data">window.__OVERMIND_MUTATIONS = [
  {"method":"set","path":"router.workspaceSlug","args":["payme"]},
  {"method":"set","path":"workspaces.currentWorkspaceId","args":[63246]}
];</script>
```

Read the `workspaces.currentWorkspaceId` mutation, then base64 `wk:<id>`.

Two gotchas the script handles:

- The blob is followed by unrelated script content, so you can't scan for a
  closing bracket. Parse by tracking depth plus string/escape state.
- `window.URQL_DATA` sits nearby and is `{}` on public sites — a red herring.

This is the single most fragile link in the chain. If Stoplight changes how it
hydrates state, this breaks first, and the script says
`no Stoplight workspace state`.

## Node payloads by type

`GET /nodes/{slug}` returns the same envelope regardless of type. The useful
fields are `type`, `title`, `summary`, `links.export_url` and `data`.

`data` is always a **string**, but what's inside depends on `type`:

| type | `data` contains |
| --- | --- |
| `article` | markdown, prefixed with a `---\nstoplight-id: ...\n---` block to strip |
| `http_operation` | Stoplight's internal JSON — has `method` and `path` at top level |
| `http_service` | internal JSON; the useful content is behind `links.export_url` |
| `model` | a JSON schema |

## Why operations come from the OpenAPI export

The obvious approach — render each `http_operation` from its own `data` — does
not work well. That payload is littered with unresolved pointers into a
`__bundled__` section:

```json
{"method": "post", "path": "/generate-sale",
 "servers": [{"$ref": "#/__bundled__/192c27488538a"}]}
```

Rendering it faithfully means writing a `$ref` resolver.

Instead, each `http_service` node carries `links.export_url`, which returns
**fully-dereferenced OpenAPI 3.1 with examples inlined** and zero remaining
`$ref`s:

```
https://stoplight.io/api/v1/projects/{workspaceSlug}/{projectSlug}/nodes/{uri}?fromExportButton=true&snapshotType=http_service
```

So the script fetches that once per service and looks operations up by
`paths[path][method]`, using the `method` and `path` from the operation node's
own `data`. That lookup was verified against every operation in the payments
project with no misses.

Note the export URL points at `stoplight.io`, not the customer subdomain. Take
it from `links.export_url` rather than constructing it.

## How the navigation tree encodes grouping

`table-of-contents` returns nested `items`. Real pages have `id`, `type` and
`slug`. Grouping is expressed two different ways, **neither of which has an
id**, and they behave differently:

**Dividers** — a title with no `items`. It does not contain anything; it opens
a section and owns every sibling that follows it until the next divider.

```json
[{"title": "Introduction"},
 {"id": "qgo6...", "title": "Getting Started", "type": "article"},
 {"title": "API Reference"},
 {"id": "8640...", "title": "Hosted Payment Page", "type": "http_service"}]
```

Here `Getting Started` belongs to `Introduction` and `Hosted Payment Page` to
`API Reference`, even though all four are siblings in the JSON.

**Containers** — a title *with* `items`, which nest normally. The per-service
`Schemas` group is the common case.

Treating dividers as ordinary siblings flattens the whole tree, which is the
bug worth remembering here: the structure is positional, not nested.

## Heading anchors

Every page type is deep-linkable: Stoplight renders each heading with an `id`,
so `…/i90qmmbdut067-sale-callbacks#sale-callback-notification-types` opens on
that section. Nothing in the API reports those ids — they are computed in the
browser from the markdown, which is why the script recomputes them.

Which markdown gets anchored depends on the node type:

| type | anchored text |
| --- | --- |
| `article` | the whole body, minus the `h1` (it is the page title) |
| `http_operation` | the operation's OpenAPI `description` |
| `http_service` | the spec's `info.description` |
| `model` | the schema's `description` |

Only articles put their title in the markdown. Everywhere else the page title is
chrome rendered around the description, and the `h1` of the description itself
*is* anchored — the POS service page anchors `#payme-pos-module` — so the
"skip level 1" rule applies to articles alone.

The rule is GitHub's, and the details are the parts that bite:

| heading | anchor |
| --- | --- |
| `Step 1: Domain Verification` | `step-1-domain-verification` |
| `Hosting the Apple Pay's file` | `hosting-the-apple-pays-file` |
| `“Fast and Simple”: Pay button` | `fast-and-simple-pay-button` |
| `6.. Final Confirmation` | `6-final-confirmation` |
| `NOT_SUPPORTED (validation:no-networks)` | `not_supported-validationno-networks` |
| `Interaction Facade` (second one) | `interaction-facade-1` |

So: lowercase, then **drop punctuation in place** rather than replacing it with
a separator — `validation:no-networks` closes up to `validationno-networks`,
and a run of two spaces leaves a double dash (`Errors & Reasons` →
`errors--reasons`). Underscores and existing hyphens survive; emoji and quotes
do not. Repeats take a `-1`, `-2` suffix in document order, counted across
**all** headings on the page including the `h1`, so a numbering scheme that
skips the title drifts on any page whose title repeats later.

Anchors come from the *rendered* text, so a heading written as
``## **Retry `policy`**`` anchors as `retry-policy` — strip inline markup
before slugifying. Headings inside fenced code blocks are never anchored; a
`# comment` in a bash sample is not a section.

Verified by rendering all 29 guides articles in a browser and diffing the live
`id` attributes against the script's output: 128 anchors, no misses.

### Panels are not slugs

An operation page also has sections Stoplight builds from the definition rather
than from markdown, and their ids are fixed strings — mixed case and all — that
no slugifier will produce:

| id | rendered when |
| --- | --- |
| `Request` | the operation has any parameter or a request body |
| `Path-Parameters` | a parameter with `in: path` |
| `Query-Parameters` | a parameter with `in: query` |
| `request-headers` | a parameter with `in: header` |
| `request-body` | `requestBody` is present |
| `Responses` | `responses` is a non-empty object |
| `response-body` | some response declares `content` |

Each one exists only under its condition, so emitting the full set
unconditionally produces links that scroll nowhere: `responses: {}` is common in
this workspace and renders no `#Responses` at all.

The `h1` of an operation page carries an **empty** `id`, so it is never a link
target — another reason the page url alone is a poor citation.

## Known limits

- **The TOC is the ceiling.** Branch `node_counts` sums to more than the TOC
  exposes (344 vs 201 at time of writing). The remainder are non-navigable
  shared model files with no public route to enumerate them.
- **Duplicate paths.** Some services expose `/generate-sale` and
  `/generate-sale/` as separate operations.
- **Path variables live on the path item.** PayMe declares them once per path
  (`paths./buyers/{buyer_guid}.parameters`), not on the operation, and OpenAPI
  applies them to every operation beneath it. Reading `operation.parameters`
  alone silently drops `buyer_guid` from Get Customer Details — the reference
  documents it, the fetched page did not.
- **Size outliers.** One service README renders to ~145KB of markdown; most
  pages are ~1.5KB. Grep before reading whole files.
- **Repeated titles.** `Activate Service` and `Google Pay` each appear more than
  once across services and projects; the directory path disambiguates them.

## Endpoints that do not exist

Probed and confirmed 404, so don't retry these:

```
/api/v1/projects/{id}/nodes                    (no list-all)
/api/v1/projects/{id}/search?query=...
/api/v1/workspaces/{id}/search?query=...
/api/v1/projects/{id}/branches/{branch}/nodes
/api/v1/workspaces/current
/api/v1/workspaces
```

The workspace slug is also rejected where an id is expected —
`/api/v1/workspaces/payme/projects` returns `invalid Workspace ID provided`.
