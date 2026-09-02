#!/usr/bin/env python3
"""Download PayMe's Stoplight documentation into a tree of markdown files.

Stoplight publishes no official API for public docs sites, so this uses the
same undocumented endpoints its own frontend calls:

    GET /                                             -> workspace id, embedded
                                                         in the Overmind state
    GET /api/v1/workspaces/{ws}/projects              -> projects
    GET /api/v1/projects/{proj}/branches              -> branches
    GET /api/v1/projects/{proj}/table-of-contents     -> the full page list
    GET /api/v1/projects/{proj}/nodes/{slug}          -> one node's content

Articles arrive as markdown already. HTTP operations arrive as Stoplight's
internal JSON, which is full of unresolved `#/__bundled__/...` pointers, so
those are rendered from the fully-dereferenced OpenAPI document exposed via
each service node's `links.export_url` instead. That avoids writing a $ref
resolver and gives us request/response schemas with examples inlined.

Standard library only. No pip install required.
"""

from __future__ import annotations

import argparse
import base64
import os
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

DEFAULT_BASE_URL = "https://payme.stoplight.io"
# The two projects that answer almost every question: the main API reference and
# the conceptual guides. The rest (B2B, Keep accounting, Products & Customers)
# are niche enough that paying ~2x the fetch time for them by default is a bad
# trade — pass --all-projects or name them explicitly when you need them.
DEFAULT_PROJECTS = ("payments", "guides")
# Shared skill: this runs from whatever repo you happen to be in, so the docs go
# to a user-level cache rather than into the working tree. Pass --out to keep a
# copy inside a project (and gitignore it there).
DEFAULT_OUT_DIR = "~/.cache/payme-docs"
OVERMIND_MARKER = "window.__OVERMIND_MUTATIONS = "
WORKSPACE_ID_PATH = "workspaces.currentWorkspaceId"
HTTP_METHODS = ("get", "post", "put", "patch", "delete", "head", "options")
CONTENT_TYPES = ("article", "http_service", "http_operation", "model")
USER_AGENT = "payme-docs-fetcher/1.0"
# Hosts that serve this workspace's docs. docs.payme.io is the same Stoplight
# workspace behind a branded domain, so links there resolve to the same nodes.
DOC_HOSTS = ("payme.stoplight.io", "docs.payme.io")
# Markdown link targets only — this deliberately never matches the `source:`
# field in front matter, which must stay absolute so answers can cite the live
# page rather than a path on somebody's laptop.
MARKDOWN_LINK = re.compile(r"\]\((https?://[^\s)]+)\)")
# Node slugs are `<id>-<kebab-title>`; ids are long alphanumerics, which keeps
# branch segments like `main` and `V1.6` from being mistaken for one.
NODE_SLUG = re.compile(r"^([A-Za-z0-9]{6,})(?:-|$)")
# Stoplight ids every heading it renders, so a section of a long article can be
# cited directly as `<page url>#<anchor>` instead of pointing at the whole page.
HEADING = re.compile(r"^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$")
CODE_FENCE = re.compile(r"^\s*(?:```|~~~)")
# Punctuation is dropped in place rather than replaced by a separator, which is
# why `NOT_SUPPORTED (validation:no-networks)` anchors as
# `not_supported-validationno-networks`. `\w` keeps digits, underscores and
# non-ASCII letters, all of which survive in the published ids.
ANCHOR_STRIP = re.compile(r"[^\w\s-]", re.UNICODE)
# Level-1 headings restate the page title; a link to one is just the page url.
MIN_ANCHOR_HEADING_LEVEL = 2
# Operation pages carry sections Stoplight builds from the OpenAPI definition
# rather than from markdown, so their ids are fixed strings — mixed case and
# all — instead of slugs. Each appears only when the definition gives it
# something to show, which is what the `in` conditions below select.
REQUEST_PARAMETER_ANCHORS = (
    ("path", "Path Parameters", "Path-Parameters"),
    ("query", "Query Parameters", "Query-Parameters"),
    ("header", "Headers", "request-headers"),
)
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 1.5


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------


def _request(url: str, accept: str) -> bytes:
    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url, headers={"Accept": accept, "User-Agent": USER_AGENT}
            )
            with urllib.request.urlopen(req, timeout=60) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as err:
            last_error = err
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_BACKOFF_SECONDS * (attempt + 1))
    raise RuntimeError(f"request failed after {MAX_RETRIES} tries: {url}: {last_error}")


def fetch_json(url: str) -> Any:
    return json.loads(_request(url, "application/json"))


def fetch_text(url: str) -> str:
    return _request(url, "text/html").decode("utf-8", errors="replace")


# --------------------------------------------------------------------------
# Workspace bootstrap
# --------------------------------------------------------------------------


def _decode_leading_json_array(source: str) -> list[dict[str, Any]]:
    """Pull the first complete JSON array out of a string that keeps going.

    The Overmind blob is followed by unrelated script content, so we can't just
    find a closing bracket; we track string and escape state while counting
    depth.
    """
    depth = 0
    in_string = False
    escaped = False
    for index, char in enumerate(source):
        if escaped:
            escaped = False
            continue
        if char == "\\" and in_string:
            escaped = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if char in "[{":
            depth += 1
        elif char in "]}":
            depth -= 1
            if depth == 0:
                return json.loads(source[: index + 1])
    raise RuntimeError("malformed Stoplight workspace state")


def resolve_workspace_id(base_url: str) -> str:
    """Recover the opaque workspace id from the server-rendered landing page.

    Stoplight ids are just base64 of `<kind>:<numeric id>`, so once we know the
    numeric id we can rebuild the opaque form the API expects.
    """
    html = fetch_text(base_url)
    marker = html.find(OVERMIND_MARKER)
    if marker == -1:
        raise RuntimeError(
            f"no Stoplight workspace state at {base_url}; "
            "is this really a Stoplight docs site?"
        )
    mutations = _decode_leading_json_array(html[marker + len(OVERMIND_MARKER) :])
    for mutation in mutations:
        if mutation.get("path") == WORKSPACE_ID_PATH:
            numeric = mutation.get("args", [None])[0]
            if isinstance(numeric, int):
                return base64.b64encode(f"wk:{numeric}".encode()).decode().rstrip("=")
    raise RuntimeError(f"could not resolve workspace id from {base_url}")


# --------------------------------------------------------------------------
# Table of contents
# --------------------------------------------------------------------------


@dataclass
class Entry:
    """One item in the published navigation tree."""

    kind: str  # "section" | "node"
    title: str
    dir_parts: list[str]
    node_id: str = ""
    slug: str = ""
    node_type: str = ""
    parent_service_id: str | None = None
    is_dir: bool = False  # rendered as <dir>/README.md rather than <name>.md
    children: list[str] = field(default_factory=list)


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return cleaned or "untitled"


def flatten_toc(items: list[dict[str, Any]]) -> list[Entry]:
    """Walk the nested table of contents into a flat list with directories.

    Stoplight expresses grouping two ways, and both have no node id:
    a *divider* (no children) opens a section and owns every sibling that
    follows it, while a *container* (with children) nests its own items. Both
    become directories so the files on disk mirror the published navigation.
    """
    entries: list[Entry] = []

    def walk(
        current: list[dict[str, Any]],
        dir_parts: list[str],
        parent_service_id: str | None,
    ) -> None:
        section_dir: list[str] | None = None
        for item in current:
            title = (item.get("title") or "").strip()
            is_node = bool(item.get("id") and item.get("type") and item.get("slug"))
            children = item.get("items") or []

            if not is_node and not children:
                section_dir = dir_parts + [slugify(title)]
                entries.append(
                    Entry(kind="section", title=title, dir_parts=section_dir, is_dir=True)
                )
                continue

            effective_dir = section_dir if section_dir is not None else dir_parts

            if not is_node:
                container_dir = effective_dir + [slugify(title)]
                entries.append(
                    Entry(
                        kind="section",
                        title=title,
                        dir_parts=container_dir,
                        is_dir=True,
                    )
                )
                walk(children, container_dir, parent_service_id)
                continue

            node_is_dir = item["type"] == "http_service" and bool(children)
            node_dir = (
                effective_dir + [slugify(title)] if node_is_dir else effective_dir
            )
            entries.append(
                Entry(
                    kind="node",
                    title=title or item["slug"],
                    dir_parts=node_dir,
                    node_id=item["id"],
                    slug=item["slug"],
                    node_type=item["type"],
                    parent_service_id=parent_service_id,
                    is_dir=node_is_dir,
                )
            )
            if children:
                next_service = (
                    item["id"] if item["type"] == "http_service" else parent_service_id
                )
                walk(children, node_dir, next_service)

    walk(items, [], None)
    entries = _prune_empty_sections(entries)
    _attach_children(entries)
    return entries


def _prune_empty_sections(entries: list[Entry]) -> list[Entry]:
    """Drop dividers that ended up owning nothing.

    Stoplight nav sometimes carries a heading with no pages under it. Keeping it
    would create a directory holding only a stub README, which reads like a gap
    in the docs rather than an accurate copy of them.
    """
    node_dirs = [tuple(e.dir_parts) for e in entries if e.kind == "node"]
    kept: list[Entry] = []
    for entry in entries:
        if entry.kind == "node":
            kept.append(entry)
            continue
        prefix = tuple(entry.dir_parts)
        if any(d[: len(prefix)] == prefix for d in node_dirs):
            kept.append(entry)
    return kept


def _attach_children(entries: list[Entry]) -> None:
    """Record each directory's immediate children so it can render an index."""
    by_dir: dict[tuple[str, ...], Entry] = {
        tuple(e.dir_parts): e for e in entries if e.is_dir
    }
    for entry in entries:
        parent_key = tuple(
            entry.dir_parts[:-1] if entry.is_dir else entry.dir_parts
        )
        parent = by_dir.get(parent_key)
        if parent is not None and parent is not entry:
            parent.children.append(entry.title)


# --------------------------------------------------------------------------
# Markdown rendering
# --------------------------------------------------------------------------


@dataclass
class Section:
    """One heading of an article, with the url that links straight to it."""

    title: str
    level: int
    anchor: str
    url: str


def escape_cell(value: str) -> str:
    return value.replace("\r", " ").replace("\n", " ").replace("|", "\\|").strip()


def describe_type(schema: dict[str, Any]) -> str:
    if schema.get("type") == "array":
        inner = describe_type(schema.get("items") or {}) if schema.get("items") else "any"
        return f"array<{inner}>"
    base = schema.get("type") or "any"
    if schema.get("enum"):
        return f"{base} (enum)"
    if schema.get("format"):
        return f"{base} ({schema['format']})"
    return base


def collect_schema_rows(
    schema: dict[str, Any], prefix: str, seen: set[int]
) -> list[str]:
    if id(schema) in seen:
        return []
    seen.add(id(schema))
    target = schema.get("items") if schema.get("type") == "array" else schema
    target = target or {}
    properties = target.get("properties")
    if not properties:
        return []
    required = set(target.get("required") or [])
    rows: list[str] = []
    for name, prop in properties.items():
        if not isinstance(prop, dict):
            continue
        full = f"{prefix}.{name}" if prefix else name
        rows.append(
            f"| `{full}` | {describe_type(prop)} | "
            f"{'yes' if name in required else 'no'} | "
            f"{escape_cell(prop.get('description') or '')} |"
        )
        nested = prop.get("items") if prop.get("type") == "array" else prop
        if isinstance(nested, dict) and nested.get("properties"):
            rows.extend(collect_schema_rows(nested, full, seen))
    return rows


def render_schema_table(schema: dict[str, Any]) -> list[str]:
    rows = collect_schema_rows(schema, "", set())
    if not rows:
        return []
    return [
        "| Property | Type | Required | Description |",
        "| --- | --- | --- | --- |",
        *rows,
        "",
    ]


def render_examples(media: dict[str, Any], limit: int) -> list[str]:
    if limit <= 0:
        return []
    examples = list((media.get("examples") or {}).items())[:limit]
    if not examples and "example" not in media:
        return []
    lines = ["**Examples**", ""]
    if not examples:
        lines += ["```json", json.dumps(media.get("example"), indent=2), "```", ""]
        return lines
    for name, example in examples:
        value = example.get("value") if isinstance(example, dict) else example
        lines += [f"_{name}_", "", "```json", json.dumps(value, indent=2), "```", ""]
    return lines


def render_operation(
    title: str,
    method: str,
    path: str,
    operation: dict[str, Any],
    limit: int,
    source_url: str,
) -> str:
    """Render one endpoint, indexed by section anchor.

    An operation page is not one idea: the overview, the request panels and the
    response panels each answer a different question, and Stoplight anchors them
    all. Citing the page alone hands the reader a wall to search.
    """
    description = operation.get("description") or ""
    sections = extract_sections(description, source_url, include_top_level=True)
    sections += operation_anchors(operation, source_url)
    lines = [f"# {title}", "", f"`{method.upper()} {path}`", ""]
    lines += render_section_index(sections)
    if description:
        lines += [description.strip(), ""]

    parameters = operation.get("parameters") or []
    if parameters:
        lines += [
            "## Parameters",
            "",
            "| Name | In | Type | Required | Description |",
            "| --- | --- | --- | --- | --- |",
        ]
        for param in parameters:
            schema = param.get("schema") or {}
            lines.append(
                f"| `{param.get('name')}` | {param.get('in')} | "
                f"{schema.get('type') or 'string'} | "
                f"{'yes' if param.get('required') else 'no'} | "
                f"{escape_cell(param.get('description') or '')} |"
            )
        lines.append("")

    body = (operation.get("requestBody") or {}).get("content")
    if body:
        lines += ["## Request Body", ""]
        if operation["requestBody"].get("description"):
            lines += [operation["requestBody"]["description"].strip(), ""]
        for media_type, media in body.items():
            lines += [f"### `{media_type}`", ""]
            if media.get("schema"):
                lines += render_schema_table(media["schema"])
            lines += render_examples(media, limit)

    responses = operation.get("responses") or {}
    if responses:
        lines += ["## Responses", ""]
        for status, response in responses.items():
            suffix = f" — {response.get('description')}" if response.get("description") else ""
            lines += [f"### {status}{suffix}", ""]
            for media_type, media in (response.get("content") or {}).items():
                lines += [f"**`{media_type}`**", ""]
                if media.get("schema"):
                    lines += render_schema_table(media["schema"])
                lines += render_examples(media, limit)

    return "\n".join(lines).strip()


def render_service(
    title: str, summary: str, spec: dict[str, Any] | None, source_url: str
) -> str:
    lines = [f"# {title}", ""]
    description = (spec or {}).get("info", {}).get("description") or summary
    lines += render_section_index(
        extract_sections(description or "", source_url, include_top_level=True)
    )
    if description:
        lines += [description.strip(), ""]
    version = (spec or {}).get("info", {}).get("version")
    if version:
        lines += [f"**Version:** {version}", ""]
    servers = (spec or {}).get("servers") or []
    if servers:
        lines += ["## Servers", ""]
        for server in servers:
            label = f" — {server['description']}" if server.get("description") else ""
            lines.append(f"- `{server.get('url')}`{label}")
        lines.append("")
    paths = (spec or {}).get("paths") or {}
    operations = [
        (method, path, op)
        for path, methods in paths.items()
        for method, op in methods.items()
        if method in HTTP_METHODS
    ]
    if operations:
        lines += ["## Operations", "", "| Method | Path | Summary |", "| --- | --- | --- |"]
        for method, path, op in operations:
            lines.append(
                f"| {method.upper()} | `{path}` | {escape_cell(op.get('summary') or '')} |"
            )
        lines.append("")
    return "\n".join(lines).strip()


def strip_inline_markdown(text: str) -> str:
    """Reduce heading markup to the text Stoplight actually renders.

    The anchor is built from what a reader sees, so a link keeps its label and
    loses its target, and emphasis, code and html markers drop out.
    """
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    return text.replace("__", "").replace("`", "").replace("*", "").strip()


def heading_anchor(title: str, used: dict[str, int]) -> str:
    """Slugify heading text the way Stoplight's markdown viewer does.

    Lowercased, punctuation dropped in place, remaining whitespace turned into
    dashes, and a `-1`, `-2` suffix on each repeat of an earlier slug.
    """
    base = re.sub(r"\s", "-", ANCHOR_STRIP.sub("", title.strip().lower()))
    if not base:
        return ""
    seen = used.get(base, 0)
    used[base] = seen + 1
    return base if seen == 0 else f"{base}-{seen}"


def extract_sections(
    markdown: str, source_url: str, include_top_level: bool = False
) -> list[Section]:
    """List a page's linkable headings, in document order.

    In an article the level-1 heading restates the page title, so it is not
    offered as a section but still claims its slug: Stoplight numbers repeats
    across every heading it renders, so skipping one here would shift the suffix
    of a later duplicate. A description embedded in an operation, service or
    model has no such title heading — the page title is chrome around it — so
    every level counts, which `include_top_level` selects.

    Headings inside fenced code blocks are comments in a sample and never
    become anchors.
    """
    minimum = 1 if include_top_level else MIN_ANCHOR_HEADING_LEVEL
    used: dict[str, int] = {}
    sections: list[Section] = []
    inside_fence = False
    for line in markdown.split("\n"):
        if CODE_FENCE.match(line):
            inside_fence = not inside_fence
            continue
        matched = None if inside_fence else HEADING.match(line)
        if not matched:
            continue
        title = strip_inline_markdown(matched.group(2))
        anchor = heading_anchor(title, used)
        level = len(matched.group(1))
        if not anchor or level < minimum:
            continue
        sections.append(Section(title, level, anchor, f"{source_url}#{anchor}"))
    return sections


def operation_anchors(operation: dict[str, Any], source_url: str) -> list[Section]:
    """Link the request and response sections Stoplight renders from OpenAPI.

    These are not headings in the markdown we write, so they cannot be slugged
    out of it — they are the ids the published page assigns to the panels it
    builds from the definition itself.
    """
    parameters = operation.get("parameters") or []
    request: list[Section] = [
        Section(title, 3, anchor, f"{source_url}#{anchor}")
        for location, title, anchor in REQUEST_PARAMETER_ANCHORS
        if any(param.get("in") == location for param in parameters)
    ]
    if operation.get("requestBody"):
        request.append(Section("Body", 3, "request-body", f"{source_url}#request-body"))
    responses = (operation.get("responses") or {}).values()
    sections: list[Section] = []
    if request:
        sections.append(Section("Request", 2, "Request", f"{source_url}#Request"))
        sections += request
    if responses:
        sections.append(Section("Responses", 2, "Responses", f"{source_url}#Responses"))
        if any(response.get("content") for response in responses):
            sections.append(
                Section("Body", 3, "response-body", f"{source_url}#response-body")
            )
    return sections


def resolve_operation(
    spec: dict[str, Any] | None, path: str, method: str
) -> dict[str, Any] | None:
    """Find an operation with its path item's shared parameters folded in.

    OpenAPI lets a path declare parameters once for every operation beneath it,
    which is where a path variable such as `{buyer_guid}` usually lives. Reading
    only the operation's own list drops it from the rendered table and from the
    anchors, even though the published page documents it.
    """
    if not (spec and path and method):
        return None
    path_item = (spec.get("paths") or {}).get(path) or {}
    operation = path_item.get(method)
    if not operation:
        return None
    own = operation.get("parameters") or []
    overridden = {(param.get("in"), param.get("name")) for param in own}
    shared = [
        param
        for param in path_item.get("parameters") or []
        if (param.get("in"), param.get("name")) not in overridden
    ]
    return {**operation, "parameters": shared + own}


def render_section_index(sections: list[Section]) -> list[str]:
    """Render the anchor index, indented to mirror the page's own outline."""
    if not sections:
        return []
    top = min(section.level for section in sections)
    entries = [
        f"{'  ' * (section.level - top)}- [{section.title}]({section.url})"
        for section in sections
    ]
    return ["## On this page", "", *entries, ""]


def insert_section_index(markdown: str, sections: list[Section]) -> str:
    """Put the anchor index directly under the article's opening heading.

    At the top it is the first thing read and the last thing a truncated read
    would lose; the urls stay absolute so they can be cited as-is.
    """
    if not sections:
        return markdown
    block = "\n".join(render_section_index(sections)).rstrip()
    lines = markdown.split("\n")
    if not HEADING.match(lines[0]):
        return f"{block}\n\n{markdown}"
    body = "\n".join(lines[1:]).lstrip("\n")
    return f"{lines[0]}\n\n{block}\n\n{body}"


def render_article(title: str, data: str, source_url: str) -> str:
    """Render an article's markdown, indexed by section anchor.

    Articles are the long pages — a callback reference or an integration guide
    answers a dozen unrelated questions — so citing one means citing the page
    and leaving the reader to find the part that mattered. The index resolves
    each heading to the deep link that lands on it.
    """
    body = re.sub(r"^---\n.*?\n---\n", "", data, flags=re.DOTALL).strip()
    markdown = body if body.startswith("#") else f"# {title}\n\n{body}"
    return insert_section_index(markdown, extract_sections(markdown, source_url))


def render_model(title: str, summary: str, data: str, source_url: str) -> str:
    lines = [f"# {title}", ""]
    lines += render_section_index(
        extract_sections(summary or "", source_url, include_top_level=True)
    )
    if summary:
        lines += [summary.strip(), ""]
    try:
        schema = json.loads(data)
        lines += render_schema_table(schema)
        lines += ["```json", json.dumps(schema, indent=2), "```"]
    except json.JSONDecodeError:
        lines += ["```", data, "```"]
    return "\n".join(lines).strip()


def render_section(title: str, children: Iterable[str]) -> str:
    lines = [f"# {title}", ""]
    children = list(children)
    if children:
        lines += [f"## Contents ({len(children)})", ""]
        lines += [f"- {child}" for child in children]
    return "\n".join(lines).strip()


def front_matter(fields: dict[str, str]) -> str:
    pairs = [f'{key}: "{value}"' for key, value in fields.items() if value]
    return "---\n" + "\n".join(pairs) + "\n---\n\n"


# --------------------------------------------------------------------------
# Project sync
# --------------------------------------------------------------------------


class Fetcher:
    def __init__(self, base_url: str, workers: int, max_examples: int) -> None:
        self.base_url = base_url.rstrip("/")
        self.api = f"{self.base_url}/api/v1"
        self.workers = workers
        self.max_examples = max_examples

    def node_url(self, project_id: str, slug: str, branch: str) -> str:
        return (
            f"{self.api}/projects/{project_id}/nodes/"
            f"{urllib.parse.quote(slug)}?branch={urllib.parse.quote(branch)}"
        )

    def doc_url(self, project_slug: str, slug: str, branch: str) -> str:
        return (
            f"{self.base_url}/docs/{project_slug}/{slug}"
            f"?branch={urllib.parse.quote(branch)}"
        )

    def list_projects(self, workspace_id: str) -> list[dict[str, Any]]:
        return fetch_json(f"{self.api}/workspaces/{workspace_id}/projects").get(
            "items", []
        )

    def resolve_branch(self, project_id: str, configured: str | None) -> dict[str, Any]:
        branches = fetch_json(f"{self.api}/projects/{project_id}/branches").get(
            "items", []
        )
        if not branches:
            raise RuntimeError(f"no published branches for project {project_id}")
        if configured:
            for branch in branches:
                if branch["name"] == configured:
                    return branch
            print(
                f"  ! branch {configured!r} not found; using default", file=sys.stderr
            )
        for branch in branches:
            if branch.get("is_default"):
                return branch
        return branches[0]

    def fetch_toc(self, project_id: str, branch: str) -> list[dict[str, Any]]:
        url = (
            f"{self.api}/projects/{project_id}/table-of-contents"
            f"?branch={urllib.parse.quote(branch)}"
        )
        return fetch_json(url).get("items", [])

    def fetch_nodes(
        self, project_id: str, branch: str, entries: list[Entry]
    ) -> dict[str, dict[str, Any]]:
        nodes: dict[str, dict[str, Any]] = {}
        targets = [e for e in entries if e.kind == "node"]

        def load(entry: Entry) -> tuple[str, dict[str, Any] | None]:
            try:
                return entry.node_id, fetch_json(
                    self.node_url(project_id, entry.slug, branch)
                )
            except Exception as err:  # noqa: BLE001 - one bad node must not stop the run
                print(f"  ! skipping {entry.slug}: {err}", file=sys.stderr)
                return entry.node_id, None

        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            for node_id, node in pool.map(load, targets):
                if node is not None:
                    nodes[node_id] = node
        return nodes

    def fetch_specs(self, nodes: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
        """Fetch the dereferenced OpenAPI export once per service."""
        service_ids = [
            node_id
            for node_id, node in nodes.items()
            if node.get("type") == "http_service"
            and (node.get("links") or {}).get("export_url")
        ]

        def load(service_id: str) -> tuple[str, dict[str, Any] | None]:
            url = nodes[service_id]["links"]["export_url"]
            try:
                return service_id, fetch_json(url)
            except Exception as err:  # noqa: BLE001
                print(f"  ! no OpenAPI for service {service_id}: {err}", file=sys.stderr)
                return service_id, None

        specs: dict[str, dict[str, Any]] = {}
        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            for service_id, spec in pool.map(load, service_ids):
                if spec is not None:
                    specs[service_id] = spec
        return specs


def write_project(
    fetcher: Fetcher,
    out_root: Path,
    project: dict[str, Any],
    branch: dict[str, Any],
    entries: list[Entry],
    nodes: dict[str, dict[str, Any]],
    specs: dict[str, dict[str, Any]],
    link_index: LinkIndex,
) -> int:
    project_dir = out_root / slugify(project["slug"])
    branch_name = branch["name"]
    written = 0

    for entry in entries:
        target_dir = project_dir.joinpath(*entry.dir_parts)
        if entry.kind == "section":
            body = render_section(entry.title, entry.children)
            path = target_dir / "README.md"
            meta = {"title": entry.title, "type": "section", "project": project["slug"]}
        else:
            node = nodes.get(entry.node_id)
            if node is None:
                continue
            data = node.get("data") or ""
            summary = node.get("summary") or ""
            node_type = entry.node_type
            method = path_str = ""
            source_url = fetcher.doc_url(project["slug"], entry.slug, branch_name)

            if node_type == "article":
                body = render_article(entry.title, data, source_url)
            elif node_type == "http_service":
                body = render_service(
                    entry.title, summary, specs.get(entry.node_id), source_url
                )
                if entry.children:
                    body += "\n\n## Contents\n\n" + "\n".join(
                        f"- {child}" for child in entry.children
                    )
            elif node_type == "http_operation":
                try:
                    parsed = json.loads(data)
                except json.JSONDecodeError:
                    parsed = {}
                method = (parsed.get("method") or "").lower()
                path_str = parsed.get("path") or ""
                spec = specs.get(entry.parent_service_id or "")
                operation = resolve_operation(spec, path_str, method)
                if operation:
                    body = render_operation(
                        entry.title,
                        method,
                        path_str,
                        operation,
                        fetcher.max_examples,
                        source_url,
                    )
                else:
                    fallback = [f"# {entry.title}", ""]
                    if method and path_str:
                        fallback += [f"`{method.upper()} {path_str}`", ""]
                    fallback += render_section_index(
                        extract_sections(summary, source_url, include_top_level=True)
                    )
                    fallback.append(summary.strip())
                    body = "\n".join(fallback).strip()
            else:
                body = render_model(entry.title, summary, data, source_url)

            meta = {
                "title": entry.title,
                "type": node_type,
                "project": project["slug"],
                "branch": branch_name,
                "source": source_url,
                "stoplight_id": entry.node_id,
            }
            if method and path_str:
                meta["method"] = method.upper()
                meta["path"] = path_str

            name = "README.md" if entry.is_dir else f"{slugify(entry.title)}.md"
            path = target_dir / name

        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(front_matter(meta) + body + "\n", encoding="utf-8")
        if entry.kind == "node":
            link_index.add(
                entry.node_id, entry.slug, project_dir.name,
                path.relative_to(out_root),
            )
        written += 1

    return written


class LinkIndex:
    """Two ways to find the file a docs URL refers to.

    `by_id` is exact. `by_tail` exists because node ids are *not* stable across
    branches: capture-sale is 1e27a49a0a83a on V1.6 and cyl5trr3ph04g on V1.7.
    PayMe's pages link to older branches constantly, so id-only matching leaves
    real cross-references dead. The readable half of the slug does survive, and
    scoping it to the project it was linked from keeps near-duplicates (two
    different `activate-service` operations) from colliding.
    """

    def __init__(self) -> None:
        self.by_id: dict[str, Path] = {}
        self.by_tail: dict[tuple[str, str], set[Path]] = {}

    def add(self, node_id: str, slug: str, project_dir: str, path: Path) -> None:
        self.by_id[node_id] = path
        tail = slug.split("-", 1)[1] if "-" in slug else slug
        self.by_tail.setdefault((project_dir, tail), set()).add(path)

    def lookup(self, node_id: str, project_dir: str, tail: str) -> Path | None:
        exact = self.by_id.get(node_id)
        if exact is not None:
            return exact
        candidates = self.by_tail.get((project_dir, tail), set())
        # Only accept an unambiguous match — guessing between two pages with the
        # same name is worse than leaving a link that still works in a browser.
        return next(iter(candidates)) if len(candidates) == 1 else None


def resolve_local_target(url: str, index: LinkIndex) -> tuple[Path, str] | None:
    """Map a Stoplight docs URL onto a downloaded file, if we have that node.

    Matching is by node id rather than by path, because one node is reachable
    through several URL shapes — with or without a `/branches/<name>/` segment,
    and on either host.
    """
    parts = urllib.parse.urlsplit(url)
    if parts.netloc not in DOC_HOSTS or not parts.path.startswith("/docs/"):
        return None
    segments = [s for s in parts.path.split("/") if s]
    if len(segments) < 3:
        return None
    matched = NODE_SLUG.match(segments[-1])
    if not matched:
        return None
    project_dir = slugify(segments[1])
    slug = segments[-1]
    tail = slug.split("-", 1)[1] if "-" in slug else slug
    target = index.lookup(matched.group(1), project_dir, tail)
    if target is None:
        return None
    return target, parts.fragment


def rewrite_internal_links(out_root: Path, index: LinkIndex) -> tuple[int, int]:
    """Point cross-references at the downloaded files instead of the website.

    PayMe's docs link between pages constantly. Left alone those links are dead
    ends locally — following one means going back to the browser, which defeats
    the point of having the docs on disk. Anything we did not download (a node
    in a project outside this fetch, or an external site) is left absolute so it
    still works.
    """
    rewritten = unresolved = 0
    for path in sorted(out_root.rglob("*.md")):
        text = path.read_text(encoding="utf-8")

        def replace(match: "re.Match[str]") -> str:
            nonlocal rewritten, unresolved
            url = match.group(1)
            resolved = resolve_local_target(url, index)
            if resolved is None:
                if urllib.parse.urlsplit(url).netloc in DOC_HOSTS:
                    unresolved += 1
                return match.group(0)
            target, fragment = resolved
            if out_root / target == path:
                # A link into the page you are already reading is a citation,
                # not navigation: rewriting an article's own section anchors to
                # a relative path to itself would throw away the live url that
                # makes them worth having.
                return match.group(0)
            relative = os.path.relpath(out_root / target, start=path.parent)
            rewritten += 1
            return f"]({relative}{'#' + fragment if fragment else ''})"

        updated = MARKDOWN_LINK.sub(replace, text)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
    return rewritten, unresolved


def write_index(out_root: Path, manifest: dict[str, Any]) -> None:
    lines = [
        "# PayMe API Documentation",
        "",
        "Generated from https://payme.stoplight.io by the payme-docs skill "
        "(`scripts/fetch_payme_docs.py`).",
        "Do not edit by hand — re-run the script instead.",
        "",
        f"Fetched: {manifest['fetched_at']}",
        "",
        "| Project | Directory | Branch | Pages |",
        "| --- | --- | --- | --- |",
    ]
    for project in manifest["projects"]:
        lines.append(
            f"| {project['name']} | `{project['dir']}/` | "
            f"{project['branch']} | {project['pages']} |"
        )
    lines += [
        "",
        "## Layout",
        "",
        "Directories mirror the published navigation. A directory's `README.md`",
        "describes that section or service; sibling `.md` files are its pages.",
        "Every page carries front matter with its `source` URL, so you can cite",
        "the live doc for anything you quote.",
        "",
    ]
    (out_root / "INDEX.md").write_text("\n".join(lines), encoding="utf-8")


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def select_projects(
    projects: list[dict[str, Any]], requested: list[str] | None, want_all: bool
) -> list[dict[str, Any]]:
    """Resolve which projects to act on, shared by the fetch and --check paths.

    Keeping this in one place matters: if --check resolved a different set than
    the fetch, it would happily report "CURRENT" for projects that were never
    downloaded.
    """
    if want_all:
        return projects
    wanted = [s.lower() for s in (requested if requested else DEFAULT_PROJECTS)]
    available = {p["slug"].lower() for p in projects}
    missing = [s for s in wanted if s not in available]
    if missing:
        print(
            f"! unknown project slug(s): {', '.join(missing)}\n"
            f"  available: {', '.join(sorted(p['slug'] for p in projects))}",
            file=sys.stderr,
        )
    order = {slug: i for i, slug in enumerate(wanted)}
    chosen = [p for p in projects if p["slug"].lower() in set(wanted)]
    return sorted(chosen, key=lambda p: order[p["slug"].lower()])


def prune_stale_project_dirs(
    out_root: Path, previous: dict[str, Any] | None, current_dirs: set[str]
) -> None:
    """Remove project directories this script wrote earlier but no longer fetches.

    Narrowing the default from five projects to two would otherwise leave the
    dropped ones behind as silently rotting docs. Only directories recorded in
    the previous manifest are removed, so anything the user put here by hand is
    never touched.
    """
    if previous is None:
        return
    import shutil

    for project in previous.get("projects", []):
        name = project.get("dir")
        if not name or name in current_dirs:
            continue
        target = out_root / name
        if target.is_dir():
            shutil.rmtree(target)
            print(f"  - removed {name}/ (no longer fetched)")


def load_manifest(out_root: Path) -> dict[str, Any] | None:
    path = out_root / "manifest.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def check_freshness(
    fetcher: Fetcher, out_root: Path, requested: list[str] | None, want_all: bool
) -> int:
    """Compare stored commit hashes against live ones. Cheap: 1 call per project."""
    manifest = load_manifest(out_root)
    if manifest is None:
        print(f"MISSING: no docs at {out_root} — run without --check to fetch them")
        return 1
    workspace_id = resolve_workspace_id(fetcher.base_url)
    projects = select_projects(
        fetcher.list_projects(workspace_id), requested, want_all
    )
    stored = {p["slug"]: p for p in manifest["projects"]}
    stale: list[str] = []
    for project in projects:
        branch = fetcher.resolve_branch(project["id"], None)
        previous = stored.get(project["slug"])
        if previous is None:
            stale.append(f"{project['slug']} (not downloaded)")
        elif previous.get("commit_hash") != branch.get("commit_hash"):
            stale.append(project["slug"])
    print(f"Docs fetched at: {manifest['fetched_at']}")
    if stale:
        print(f"STALE: {', '.join(stale)} — re-run the script to refresh")
        return 1
    print(f"CURRENT: all {len(projects)} project(s) match the published commit")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download PayMe Stoplight docs into markdown files."
    )
    parser.add_argument(
        "--out",
        default=DEFAULT_OUT_DIR,
        help=f"output directory (default: {DEFAULT_OUT_DIR})",
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument(
        "--projects",
        nargs="*",
        default=None,
        help=f"project slugs to fetch (default: {' '.join(DEFAULT_PROJECTS)})",
    )
    parser.add_argument(
        "--all-projects",
        action="store_true",
        help="fetch every project in the workspace, not just the default two",
    )
    parser.add_argument("--branch", default=None, help="override branch for all projects")
    parser.add_argument(
        "--max-examples",
        type=int,
        default=3,
        help="request/response examples per operation (default: 3)",
    )
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument(
        "--no-link-rewrite",
        action="store_true",
        help="keep cross-references as absolute stoplight.io URLs",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="report whether local docs are stale, without downloading",
    )
    args = parser.parse_args()

    out_root = Path(args.out).expanduser().resolve()
    fetcher = Fetcher(args.base_url, args.workers, args.max_examples)

    try:
        if args.check:
            return check_freshness(
                fetcher, out_root, args.projects, args.all_projects
            )

        started = time.time()
        workspace_id = resolve_workspace_id(fetcher.base_url)
        projects = select_projects(
            fetcher.list_projects(workspace_id), args.projects, args.all_projects
        )
        if not projects:
            print("no projects selected", file=sys.stderr)
            return 1

        previous_manifest = load_manifest(out_root)
        out_root.mkdir(parents=True, exist_ok=True)
        link_index = LinkIndex()
        manifest: dict[str, Any] = {
            "source": fetcher.base_url,
            "workspace_id": workspace_id,
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "projects": [],
        }

        for project in projects:
            branch = fetcher.resolve_branch(project["id"], args.branch)
            entries = flatten_toc(fetcher.fetch_toc(project["id"], branch["name"]))
            nodes = fetcher.fetch_nodes(project["id"], branch["name"], entries)
            specs = fetcher.fetch_specs(nodes)
            written = write_project(
                fetcher, out_root, project, branch, entries, nodes, specs,
                link_index,
            )
            print(
                f"  {project['slug']:<32} {branch['name']:<8} {written:>4} pages"
            )
            manifest["projects"].append(
                {
                    "slug": project["slug"],
                    "name": project["name"],
                    "dir": slugify(project["slug"]),
                    "branch": branch["name"],
                    "commit_hash": branch.get("commit_hash"),
                    "pages": written,
                }
            )

        if not args.no_link_rewrite:
            rewritten, unresolved = rewrite_internal_links(out_root, link_index)
            note = f", {unresolved} left absolute (not downloaded)" if unresolved else ""
            print(f"  rewrote {rewritten} cross-reference(s) to local paths{note}")

        prune_stale_project_dirs(
            out_root,
            previous_manifest,
            {p["dir"] for p in manifest["projects"]},
        )
        write_index(out_root, manifest)
        (out_root / "manifest.json").write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )
        total = sum(p["pages"] for p in manifest["projects"])
        print(
            f"\nWrote {total} pages from {len(projects)} project(s) to {out_root} "
            f"in {time.time() - started:.1f}s"
        )
        return 0
    except Exception as err:  # noqa: BLE001 - surface a clean message, not a traceback
        print(f"error: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
