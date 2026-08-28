"""Ingest GA4 + GSC weekly metrics for Growth Memo articles into Supabase.

Run manually:   python -m ingestion.ingest_analytics
With options:   python -m ingestion.ingest_analytics --weeks 12

Only processes article pages (paths containing /p/).
"""
import argparse
import sys
from datetime import date, timedelta

from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    DimensionExpression,
    Filter,
    FilterExpression,
    Metric,
    RunReportRequest,
)
from googleapiclient.discovery import build

from config import GA4_PROPERTY_ID, GSC_SITE_URL
from db.client import (
    get_client,
    get_existing_metric_weeks,
    upsert_article_metrics,
    upsert_article_queries,
)
from ingestion.google_auth import get_ga4_credentials, get_gsc_credentials


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_slug(path_or_url: str) -> str | None:
    """Extract article slug from a GA/GSC path like /p/some-slug or full URL."""
    if "/p/" not in path_or_url:
        return None
    slug = path_or_url.split("/p/")[-1].rstrip("/").split("?")[0]
    return slug if slug else None


def _week_monday(d: date) -> date:
    """Align a date to the Monday of its ISO week."""
    return d - timedelta(days=d.weekday())


def _target_weeks(num_weeks: int) -> list[tuple[date, date]]:
    """Return (monday, sunday) pairs for the last N complete weeks."""
    today = date.today()
    current_monday = _week_monday(today)
    weeks = []
    for i in range(1, num_weeks + 1):
        monday = current_monday - timedelta(weeks=i)
        sunday = monday + timedelta(days=6)
        weeks.append((monday, sunday))
    return weeks


# ── GA4 ───────────────────────────────────────────────────────────────────────

def fetch_ga4_metrics(week_start: date, week_end: date) -> dict[str, dict]:
    """Fetch page-level GA4 metrics for one week. Returns {slug: metrics}."""
    credentials = get_ga4_credentials()
    client = BetaAnalyticsDataClient(credentials=credentials)

    request = RunReportRequest(
        property=GA4_PROPERTY_ID,
        date_ranges=[DateRange(
            start_date=str(week_start),
            end_date=str(week_end),
        )],
        dimensions=[Dimension(name="pagePath")],
        metrics=[
            Metric(name="screenPageViews"),
            Metric(name="sessions"),
            Metric(name="averageSessionDuration"),
            Metric(name="bounceRate"),
        ],
        dimension_filter=FilterExpression(
            filter=Filter(
                field_name="pagePath",
                string_filter=Filter.StringFilter(
                    match_type=Filter.StringFilter.MatchType.CONTAINS,
                    value="/p/",
                ),
            )
        ),
    )

    response = client.run_report(request)

    results = {}
    for row in response.rows:
        slug = _extract_slug(row.dimension_values[0].value)
        if not slug:
            continue
        results[slug] = {
            "pageviews": int(row.metric_values[0].value),
            "sessions": int(row.metric_values[1].value),
            "avg_engagement_time_seconds": round(float(row.metric_values[2].value), 1),
            "bounce_rate": round(float(row.metric_values[3].value), 4),
        }
    return results


# ── GSC ───────────────────────────────────────────────────────────────────────

def _build_gsc_service():
    credentials = get_gsc_credentials()
    return build("searchconsole", "v1", credentials=credentials)


def fetch_gsc_page_metrics(week_start: date, week_end: date) -> dict[str, dict]:
    """Fetch GSC page-level metrics for one week. Returns {slug: metrics}."""
    service = _build_gsc_service()

    response = service.searchanalytics().query(
        siteUrl=GSC_SITE_URL,
        body={
            "startDate": str(week_start),
            "endDate": str(week_end),
            "dimensions": ["page"],
            "rowLimit": 5000,
        },
    ).execute()

    results = {}
    for row in response.get("rows", []):
        slug = _extract_slug(row["keys"][0])
        if not slug:
            continue
        results[slug] = {
            "clicks": int(row["clicks"]),
            "impressions": int(row["impressions"]),
            "ctr": round(row["ctr"], 4),
            "avg_position": round(row["position"], 1),
        }
    return results


def fetch_gsc_query_data(week_start: date, week_end: date) -> list[dict]:
    """Fetch GSC query-level data for one week. Returns list of row dicts."""
    service = _build_gsc_service()

    response = service.searchanalytics().query(
        siteUrl=GSC_SITE_URL,
        body={
            "startDate": str(week_start),
            "endDate": str(week_end),
            "dimensions": ["page", "query"],
            "rowLimit": 25000,
        },
    ).execute()

    results = []
    for row in response.get("rows", []):
        slug = _extract_slug(row["keys"][0])
        if not slug:
            continue
        results.append({
            "url_slug": slug,
            "week_start": str(week_start),
            "query": row["keys"][1],
            "clicks": int(row["clicks"]),
            "impressions": int(row["impressions"]),
            "ctr": round(row["ctr"], 4),
            "avg_position": round(row["position"], 1),
        })
    return results


# ── Orchestrator ──────────────────────────────────────────────────────────────

def ingest_analytics(weeks: int = 4):
    """Fetch GA4 + GSC data for the last N weeks and upsert to Supabase."""
    client = get_client()
    target_weeks = _target_weeks(weeks)
    existing = get_existing_metric_weeks(client)

    print(f"Fetching analytics for {weeks} weeks...")

    for week_start, week_end in target_weeks:
        print(f"\nWeek of {week_start}:")

        # GA4 page metrics
        ga4_data = fetch_ga4_metrics(week_start, week_end)
        print(f"  GA4: {len(ga4_data)} article pages")

        # GSC page metrics
        gsc_pages = fetch_gsc_page_metrics(week_start, week_end)
        print(f"  GSC pages: {len(gsc_pages)} article pages")

        # Merge GA4 + GSC into article_metrics rows
        all_slugs = set(ga4_data.keys()) | set(gsc_pages.keys())
        metrics_rows = []
        for slug in all_slugs:
            row = {"url_slug": slug, "week_start": str(week_start)}
            if slug in ga4_data:
                row.update(ga4_data[slug])
            if slug in gsc_pages:
                row.update(gsc_pages[slug])
            metrics_rows.append(row)

        if metrics_rows:
            upsert_article_metrics(client, metrics_rows)
        print(f"  Upserted {len(metrics_rows)} article_metrics rows")

        # GSC query-level data
        gsc_queries = fetch_gsc_query_data(week_start, week_end)
        if gsc_queries:
            upsert_article_queries(client, gsc_queries)
        print(f"  Upserted {len(gsc_queries)} article_queries rows")

    print(f"\nDone. Processed {len(target_weeks)} weeks.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Ingest GA4 + GSC data for Growth Memo articles."
    )
    parser.add_argument(
        "--weeks", type=int, default=4,
        help="Number of past complete weeks to fetch (default: 4)",
    )
    args = parser.parse_args()
    ingest_analytics(weeks=args.weeks)
