"""Shared performance scoring and chunk reranking utilities.

All functions return empty/no-op results when no analytics data exists,
so features gracefully degrade to their current behavior.
"""
from db.client import get_latest_metrics, get_article_queries


def get_performance_scores(client) -> dict[str, float]:
    """Return {url_slug: normalized_score} using latest week's metrics.

    Score = clicks * 0.4 + pageviews * 0.3 + sessions * 0.3, normalized 0-1.
    Returns empty dict if no metrics data exists.
    """
    rows = get_latest_metrics(client)
    if not rows:
        return {}

    raw = {}
    for r in rows:
        score = (r.get("clicks", 0) or 0) * 0.4 + \
                (r.get("pageviews", 0) or 0) * 0.3 + \
                (r.get("sessions", 0) or 0) * 0.3
        raw[r["url_slug"]] = score

    max_score = max(raw.values()) if raw else 1
    if max_score == 0:
        return {slug: 0.0 for slug in raw}

    return {slug: round(s / max_score, 4) for slug, s in raw.items()}


def get_performance_tier(score: float) -> str:
    """Classify a normalized score into a tier label."""
    if score >= 0.75:
        return "top"
    if score >= 0.25:
        return "mid"
    return "low"


def rerank_chunks_by_performance(chunks: list[dict], perf_scores: dict[str, float]) -> list[dict]:
    """Rerank match_chunks results using performance scores.

    Adds 'perf_score' and 'final_score' fields. Falls through to pure
    similarity ordering when perf_scores is empty.
    """
    if not perf_scores:
        return chunks

    for chunk in chunks:
        slug = chunk.get("article_url_slug", "")
        ps = perf_scores.get(slug, 0.0)
        chunk["perf_score"] = ps
        chunk["final_score"] = chunk["similarity"] * (1 + ps)

    return sorted(chunks, key=lambda c: -c["final_score"])


def get_top_queries_for_slugs(client, slugs: list[str], n: int = 5) -> dict[str, list[str]]:
    """Return {slug: [top N queries by impressions]} for GSC query injection."""
    result = {}
    for slug in slugs:
        rows = get_article_queries(client, url_slug=slug)
        if rows:
            result[slug] = [r["query"] for r in rows[:n]]
    return result
