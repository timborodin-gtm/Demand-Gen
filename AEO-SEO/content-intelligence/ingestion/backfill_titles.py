"""Backfill article titles where the current title was derived from the slug.

The old parser fell back to ``slug.replace("-", " ").title()`` whenever
posts.csv lacked a title, producing things like "Googles Ai Mode Seo Impact
Ai Mode" or "I Ve Been Diging Deep". This script finds those rows and
replaces the title with a cleaner source.

Two title sources, picked with --source:

  --source=h1        First H1 in stored markdown (rarely useful — Substack
                     bodies usually contain section headings, not the title).
  --source=live      Fetch the article's live URL on growth-memo.com and read
                     <meta property="og:title"> / <title>. Default; ~1.5s per
                     article.

Usage:
    python -m ingestion.backfill_titles                       # dry-run, live source
    python -m ingestion.backfill_titles --apply               # actually update rows
    python -m ingestion.backfill_titles --limit 10            # process fewer rows
    python -m ingestion.backfill_titles --source=h1 --apply   # use markdown H1 instead
"""
import argparse
import re
import time

import requests
from bs4 import BeautifulSoup

from config import SUBSTACK_BASE_URL
from db.client import get_client


_H1_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_INLINE_FMT_RE = re.compile(r"[*_`]+")

REQUEST_TIMEOUT = 20
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GrowthMemoBackfill/1.0)"}
LIVE_FETCH_DELAY_SECONDS = 1.0
TITLE_SUFFIXES_TO_STRIP = (
    " - by Kevin Indig - Growth Memo",
    " - Growth Memo",
    " | Growth Memo",
    " — Growth Memo",
)


def slug_titleized(slug: str) -> str:
    """Reproduce the old parse.py fallback exactly: slug.replace('-', ' ').title()."""
    clean = re.sub(r"^\d+\.", "", slug or "")
    return clean.replace("-", " ").title()


def slug_to_url(slug: str) -> str:
    clean = re.sub(r"^\d+\.", "", slug or "")
    return f"{SUBSTACK_BASE_URL}/p/{clean}"


def extract_h1(markdown: str) -> str:
    """Return the cleaned text of the first H1 in the markdown, or ''."""
    if not markdown:
        return ""
    match = _H1_RE.search(markdown)
    if not match:
        return ""
    text = match.group(1)
    text = _LINK_RE.sub(r"\1", text)
    text = _INLINE_FMT_RE.sub("", text)
    return text.strip()


def _strip_brand_suffix(title: str) -> str:
    for suffix in TITLE_SUFFIXES_TO_STRIP:
        if title.endswith(suffix):
            return title[: -len(suffix)].strip()
    return title.strip()


def fetch_live_title(url: str) -> str:
    """Fetch the post URL and return its canonical title.

    Prefers <meta property="og:title">, falls back to <title>. Brand suffixes
    like ' - Growth Memo' are stripped. Returns '' if the page can't be
    fetched or no title is found.
    """
    try:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
    except Exception as e:
        print(f"    [fetch error] {url}: {e}")
        return ""

    soup = BeautifulSoup(resp.text, "html.parser")
    og = soup.find("meta", attrs={"property": "og:title"})
    if og and og.get("content", "").strip():
        return _strip_brand_suffix(og["content"])
    title_tag = soup.find("title")
    if title_tag and title_tag.get_text(strip=True):
        return _strip_brand_suffix(title_tag.get_text(strip=True))
    return ""


def is_linkedin_slug(slug: str) -> bool:
    return (slug or "").startswith("linkedin.") or (slug or "").startswith("linkedin-")


def fetch_candidates(client) -> list[dict]:
    """Fetch articles whose title equals the slug-titleized fallback."""
    result = (
        client.table("articles")
        .select("id, url_slug, title, full_text_markdown")
        .execute()
    )
    candidates = []
    for row in result.data or []:
        slug = row.get("url_slug") or ""
        if is_linkedin_slug(slug):
            continue
        if not row.get("title"):
            continue
        if row["title"].strip() == slug_titleized(slug):
            candidates.append(row)
    return candidates


def main():
    parser = argparse.ArgumentParser(description="Backfill slug-derived article titles.")
    parser.add_argument("--apply", action="store_true",
                        help="Actually write updates (default: dry-run).")
    parser.add_argument("--limit", type=int, default=None,
                        help="Process at most N candidates.")
    parser.add_argument("--source", choices=("live", "h1"), default="live",
                        help="Where to get the new title from (default: live).")
    args = parser.parse_args()

    client = get_client()
    candidates = fetch_candidates(client)
    print(f"Found {len(candidates)} article(s) with slug-derived titles.")
    print(f"Title source: {args.source}")

    if args.limit:
        candidates = candidates[:args.limit]

    updated = 0
    skipped = 0
    for i, row in enumerate(candidates, 1):
        if args.source == "h1":
            new_title = extract_h1(row.get("full_text_markdown") or "")
            reason = "no H1 in markdown"
        else:
            url = slug_to_url(row["url_slug"])
            new_title = fetch_live_title(url)
            reason = "no title found at live URL"
            if i < len(candidates):
                time.sleep(LIVE_FETCH_DELAY_SECONDS)

        if not new_title:
            print(f"  [skip] id={row['id']} slug={row['url_slug']!r} — {reason}")
            skipped += 1
            continue
        if new_title == row["title"]:
            skipped += 1
            continue

        print(f"  id={row['id']} slug={row['url_slug']!r}")
        print(f"    before: {row['title']!r}")
        print(f"    after:  {new_title!r}")

        if args.apply:
            client.table("articles").update({"title": new_title}).eq("id", row["id"]).execute()
        updated += 1

    print()
    if args.apply:
        print(f"Updated {updated} row(s). Skipped {skipped}.")
    else:
        print(f"Dry-run: would update {updated} row(s). Skipped {skipped}.")
        print("Re-run with --apply to write changes.")


if __name__ == "__main__":
    main()
