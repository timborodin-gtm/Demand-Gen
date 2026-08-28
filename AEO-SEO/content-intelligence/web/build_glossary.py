#!/usr/bin/env python3
"""Generate web/glossary.json from the published beehiiv posts.

The public glossary homepage (library.growth-memo.com) renders its term list
from web/glossary.json. This script rebuilds that file by listing every
published post in the beehiiv publication and mapping each post's content tag
to one of the glossary's category chips.

It talks to the beehiiv v2 REST API directly (stdlib only, no dependencies) so
it can run in a minimal GitHub Actions job. See .github/workflows/update-glossary.yml.

Environment:
    BEEHIIV_API_KEY          required — a beehiiv v2 API key (read scope is enough)
    BEEHIIV_PUBLICATION_ID   optional — defaults to the Growth Memo publication

Usage:
    BEEHIIV_API_KEY=... python web/build_glossary.py
    python web/build_glossary.py --out web/glossary.json
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

API_BASE = "https://api.beehiiv.com/v2"
DEFAULT_PUBLICATION_ID = "pub_b279cb36-cdbf-4072-bf20-c131e962e0a5"

# beehiiv content tag (normalized: lowercased) -> glossary category chip id.
# The chip labels/colors live in web/glossary.html; these ids must match its
# CATEGORIES array (ai | seo | behavior | foundations).
TAG_TO_CAT = {
    "ai research": "ai",
    "ai-research": "ai",
    "ai search": "ai",
    "ai-search": "ai",
    "seo": "seo",
    "behavior": "behavior",
    "foundations": "foundations",
}


def _get(url: str, api_key: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_published_posts(publication_id: str, api_key: str) -> list[dict]:
    """Return every confirmed (published) post, paging through the API."""
    posts: list[dict] = []
    page = 1
    while True:
        url = (
            f"{API_BASE}/publications/{publication_id}/posts"
            f"?status=confirmed&limit=100&page={page}"
            f"&order_by=publish_date&direction=asc"
        )
        payload = _get(url, api_key)
        posts.extend(payload.get("data", []))
        total_pages = payload.get("total_pages", 1)
        if page >= total_pages:
            break
        page += 1
    return posts


def cat_for(post: dict) -> str | None:
    """Map the first recognized content tag to a category id, else None."""
    for tag in post.get("content_tags") or []:
        cat = TAG_TO_CAT.get(str(tag).strip().lower())
        if cat:
            return cat
    return None


def build_terms(posts: list[dict]) -> list[dict]:
    terms = []
    untagged = []
    for post in posts:
        # Respect posts hidden from the website feed.
        if post.get("hidden_from_feed"):
            continue
        title = (post.get("title") or "").strip()
        url = (post.get("web_url") or "").strip()
        if not title or not url:
            continue
        cat = cat_for(post)
        if cat is None:
            untagged.append(title)
        terms.append({"name": title, "url": url, "cat": cat})

    terms.sort(key=lambda t: t["name"].lower())
    if untagged:
        print(
            f"warning: {len(untagged)} published post(s) have no recognized "
            f"content tag and will show without a category badge: "
            + ", ".join(sorted(untagged)),
            file=sys.stderr,
        )
    return terms


def main() -> int:
    parser = argparse.ArgumentParser(description="Build web/glossary.json from beehiiv")
    parser.add_argument("--out", default="web/glossary.json", help="Output JSON path")
    args = parser.parse_args()

    api_key = os.environ.get("BEEHIIV_API_KEY")
    if not api_key:
        print("error: BEEHIIV_API_KEY is not set", file=sys.stderr)
        return 1
    publication_id = os.environ.get("BEEHIIV_PUBLICATION_ID", DEFAULT_PUBLICATION_ID)

    try:
        posts = fetch_published_posts(publication_id, api_key)
    except urllib.error.HTTPError as e:
        print(f"error: beehiiv API returned {e.code} {e.reason}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"error: could not reach beehiiv API: {e.reason}", file=sys.stderr)
        return 1

    terms = build_terms(posts)
    if not terms:
        print("error: no published posts found — refusing to write empty glossary", file=sys.stderr)
        return 1

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(terms, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"wrote {len(terms)} terms to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
