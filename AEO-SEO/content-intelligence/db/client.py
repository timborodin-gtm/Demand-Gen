from supabase import create_client, ClientOptions
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY


def get_client():
    opts = ClientOptions(postgrest_client_timeout=60)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY, options=opts)


def upsert_article(client, article: dict) -> int:
    """Upsert an article and return its id."""
    result = (
        client.table("articles")
        .upsert(article, on_conflict="post_id")
        .execute()
    )
    return result.data[0]["id"]


def upsert_chunks(client, chunks: list[dict]):
    """Upsert chunks in small batches to avoid timeouts."""
    BATCH = 5
    for i in range(0, len(chunks), BATCH):
        batch = chunks[i : i + BATCH]
        client.table("chunks").upsert(
            batch, on_conflict="article_id,chunk_index"
        ).execute()


def get_all_articles(client) -> list[dict]:
    """Fetch all articles (without full_text for listing)."""
    result = (
        client.table("articles")
        .select("id, post_id, title, subtitle, post_date, type, audience, url_slug, word_count")
        .order("post_date", desc=True)
        .execute()
    )
    return result.data


def get_article_by_id(client, article_id: int) -> dict:
    """Fetch a single article with full text."""
    result = (
        client.table("articles")
        .select("*")
        .eq("id", article_id)
        .single()
        .execute()
    )
    return result.data


def get_all_chunk_embeddings(client) -> list[dict]:
    """Fetch all chunks with embeddings for clustering."""
    result = (
        client.table("chunks")
        .select("id, article_id, chunk_text, heading, embedding")
        .execute()
    )
    return result.data


def match_chunks(client, query_embedding: list[float], match_count=15,
                 similarity_threshold=0.5, exclude_article_id=None,
                 exclude_linkedin=True) -> list[dict]:
    """Call the match_chunks RPC function.

    When exclude_linkedin is True (the default), chunks from LinkedIn cross-posts
    are filtered out so retrieval-based tools (glossary, internal linking) only
    surface full newsletter articles. LinkedIn posts have slugs starting with
    "linkedin." or "linkedin-" (e.g. linkedin.2025-03-17.250).
    """
    params = {
        "query_embedding": query_embedding,
        "match_count": match_count * 3 if exclude_linkedin else match_count,
        "similarity_threshold": similarity_threshold,
    }
    if exclude_article_id is not None:
        params["exclude_article_id"] = exclude_article_id
    result = client.rpc("match_chunks", params).execute()
    chunks = result.data or []
    if exclude_linkedin:
        chunks = [c for c in chunks if not _is_linkedin_slug(c.get("article_url_slug", ""))]
        chunks = chunks[:match_count]
    return chunks


def _is_linkedin_slug(slug: str) -> bool:
    """LinkedIn cross-posts have slugs like 'linkedin.2025-03-17.250' or 'linkedin-694533...'."""
    return slug.startswith("linkedin.") or slug.startswith("linkedin-")


def get_article_count(client) -> int:
    result = client.table("articles").select("id", count="exact").execute()
    return result.count


def get_chunk_count(client) -> int:
    result = client.table("chunks").select("id", count="exact").execute()
    return result.count


def upsert_gap_feedback(client, cluster_label: str, suggestion: str, rating: str):
    """Save or update feedback on a gap suggestion."""
    client.table("gap_feedback").upsert(
        {"cluster_label": cluster_label, "suggestion": suggestion, "rating": rating},
        on_conflict="cluster_label,suggestion",
    ).execute()


def get_all_gap_feedback(client) -> list[dict]:
    """Fetch all gap feedback for use in prompts."""
    result = client.table("gap_feedback").select("*").execute()
    return result.data


# ── Analytics (GA4 + GSC) ────────────────────────────────────────────────────

def upsert_article_metrics(client, rows: list[dict]):
    """Upsert article_metrics rows in batches."""
    BATCH = 50
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        client.table("article_metrics").upsert(
            batch, on_conflict="url_slug,week_start"
        ).execute()


def upsert_article_queries(client, rows: list[dict]):
    """Upsert article_queries rows in batches."""
    BATCH = 50
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        client.table("article_queries").upsert(
            batch, on_conflict="url_slug,week_start,query"
        ).execute()


def get_latest_metrics(client) -> list[dict]:
    """Fetch the most recent week's metrics for all articles."""
    latest = (
        client.table("article_metrics")
        .select("week_start")
        .order("week_start", desc=True)
        .limit(1)
        .execute()
    )
    if not latest.data:
        return []
    week = latest.data[0]["week_start"]
    return (
        client.table("article_metrics")
        .select("*")
        .eq("week_start", week)
        .execute()
    ).data


def get_article_metrics(client, url_slug: str = None) -> list[dict]:
    """Fetch article metrics, optionally filtered by slug."""
    query = client.table("article_metrics").select("*").order("week_start", desc=True)
    if url_slug:
        query = query.eq("url_slug", url_slug)
    return query.execute().data


def get_article_queries(client, url_slug: str, week_start: str = None) -> list[dict]:
    """Fetch query-level GSC data for an article."""
    query = (
        client.table("article_queries")
        .select("*")
        .eq("url_slug", url_slug)
        .order("impressions", desc=True)
    )
    if week_start:
        query = query.eq("week_start", week_start)
    return query.execute().data


def get_existing_metric_weeks(client) -> set[tuple[str, str]]:
    """Return set of (url_slug, week_start) pairs already in article_metrics."""
    result = client.table("article_metrics").select("url_slug, week_start").execute()
    return {(r["url_slug"], r["week_start"]) for r in result.data}


def get_all_article_queries_latest(client) -> list[dict]:
    """Fetch query-level data for the latest week across all articles."""
    latest = (
        client.table("article_metrics")
        .select("week_start")
        .order("week_start", desc=True)
        .limit(1)
        .execute()
    )
    if not latest.data:
        return []
    week = latest.data[0]["week_start"]
    return (
        client.table("article_queries")
        .select("*")
        .eq("week_start", week)
        .order("impressions", desc=True)
        .execute()
    ).data


def get_demand_gap_queries(client, min_impressions: int = 100, min_position: float = 20.0) -> list[dict]:
    """Fetch high-impression, low-ranking queries (content gap signals)."""
    return (
        client.table("article_queries")
        .select("url_slug, query, clicks, impressions, ctr, avg_position")
        .gte("impressions", min_impressions)
        .gte("avg_position", min_position)
        .order("impressions", desc=True)
        .limit(100)
        .execute()
    ).data
