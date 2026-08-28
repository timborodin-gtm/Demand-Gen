"""Ingest new Growth Memo articles from the RSS feed into Supabase.

Run manually:   python -m ingestion.ingest_rss
Run with limit: python -m ingestion.ingest_rss --max 5

Only processes articles not already in the database (upsert-safe).
"""
import argparse
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup
from markdownify import markdownify as md

from config import MIN_ARTICLE_BYTES, SUBSTACK_BASE_URL
from db.client import get_client, upsert_article, upsert_chunks, get_article_count
from ingestion.chunk import chunk_article
from ingestion.embed import embed_texts

RSS_URL = f"{SUBSTACK_BASE_URL}/feed"
REQUEST_TIMEOUT = 20
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GrowthMemoBot/1.0)"}


# ── RSS parsing ──────────────────────────────────────────────────────────────

def fetch_rss() -> list[dict]:
    """Fetch and parse the RSS feed. Returns list of article stubs."""
    resp = requests.get(RSS_URL, headers=HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)
    channel = root.find("channel")

    articles = []
    for item in channel.findall("item"):
        def tag(name):
            el = item.find(name)
            return el.text.strip() if el is not None and el.text else ""

        url = tag("link") or tag("guid")
        if not url:
            continue

        slug = url.rstrip("/").split("/p/")[-1] if "/p/" in url else url.split("/")[-1]

        pub_date = tag("pubDate")
        post_date = None
        if pub_date:
            try:
                post_date = datetime.strptime(
                    pub_date, "%a, %d %b %Y %H:%M:%S %z"
                ).astimezone(timezone.utc).isoformat()
            except ValueError:
                pass

        articles.append({
            "title": tag("title"),
            "url": url,
            "slug": slug,
            "post_date": post_date,
            "description": tag("description"),
        })

    return articles


# ── Article fetching & parsing ───────────────────────────────────────────────

def fetch_article_markdown(url: str) -> str | None:
    """Fetch a Substack article URL and return the body as markdown."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
    except Exception as e:
        print(f"  ⚠ Could not fetch {url}: {e}")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Target the main article body — Substack wraps it in these containers
    body = (
        soup.find("div", class_="available-content")
        or soup.find("div", class_="post-content")
        or soup.find("article")
        or soup.find("div", {"class": re.compile(r"body|content|post")})
    )

    if not body:
        body = soup  # fallback: whole page

    # Strip navigation, headers, footers, subscription widgets
    for tag in body(["script", "style", "nav", "header", "footer",
                     "form", "button", "aside"]):
        tag.decompose()
    for tag in body.find_all(class_=re.compile(
        r"subscribe|paywall|footer|nav|header|share|comments|"
        r"sidebar|related|social|cta|signup"
    )):
        tag.decompose()

    markdown = md(str(body), heading_style="ATX", strip=["img"]).strip()
    return markdown if len(markdown.encode("utf-8")) >= MIN_ARTICLE_BYTES else None


# ── Existing slug lookup ─────────────────────────────────────────────────────

def get_existing_slugs(client) -> set[str]:
    """Return the set of url_slug values already in the database."""
    result = client.table("articles").select("url_slug").execute()
    return {row["url_slug"] for row in result.data}


# ── Main ingestion ───────────────────────────────────────────────────────────

def ingest_rss(max_articles: int = 20):
    client = get_client()
    existing = get_existing_slugs(client)
    print(f"Database has {get_article_count(client)} articles. "
          f"Checking RSS feed for new ones…")

    feed_articles = fetch_rss()
    new_articles = [a for a in feed_articles if a["slug"] not in existing]

    if not new_articles:
        print("✅ No new articles found. Database is up to date.")
        return

    print(f"Found {len(new_articles)} new article(s). Processing up to {max_articles}…\n")
    new_articles = new_articles[:max_articles]

    ingested = 0
    for i, stub in enumerate(new_articles):
        print(f"[{i+1}/{len(new_articles)}] {stub['title']}")
        print(f"  URL: {stub['url']}")

        markdown = fetch_article_markdown(stub["url"])
        if not markdown:
            print("  ⚠ Skipped — could not extract content.\n")
            continue

        word_count = len(markdown.split())
        print(f"  Parsed: {word_count} words")

        # Upsert article
        article_id = upsert_article(client, {
            "post_id": stub["slug"],
            "title": stub["title"],
            "subtitle": stub.get("description", "")[:500],
            "post_date": stub["post_date"],
            "type": "newsletter",
            "audience": "everyone",
            "url_slug": stub["slug"],
            "full_text_markdown": markdown,
            "word_count": word_count,
        })

        # Chunk → embed → upsert
        chunks = chunk_article(markdown)
        if not chunks:
            print("  ⚠ No chunks generated.\n")
            continue

        embeddings = embed_texts([c["chunk_text"] for c in chunks])
        chunk_rows = [
            {
                "article_id": article_id,
                "chunk_index": c["chunk_index"],
                "chunk_text": c["chunk_text"],
                "heading": c["heading"],
                "token_count": c["token_count"],
                "embedding": emb,
            }
            for c, emb in zip(chunks, embeddings)
        ]
        from db.client import upsert_chunks
        upsert_chunks(client, chunk_rows)

        print(f"  ✅ Ingested ({len(chunks)} chunks)\n")
        ingested += 1

    print(f"Done. Ingested {ingested}/{len(new_articles)} new articles. "
          f"Database now has {get_article_count(client)} articles.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest new Growth Memo articles from RSS.")
    parser.add_argument("--max", type=int, default=20,
                        help="Max new articles to process (default: 20)")
    args = parser.parse_args()
    ingest_rss(max_articles=args.max)
