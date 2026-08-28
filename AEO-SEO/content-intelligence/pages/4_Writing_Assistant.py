import re

import streamlit as st

from db.client import get_client, get_all_articles, get_latest_metrics, get_article_queries
from analysis.linking import find_similar_chunks
from analysis.performance import get_performance_scores, get_performance_tier, get_top_queries_for_slugs
from auth import require_auth
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL, SUBSTACK_BASE_URL
import anthropic

st.set_page_config(page_title="Writing Assistant", layout="wide")
require_auth()
st.title("Writing Assistant")
st.caption(
    "Describe a topic or paste an outline. Claude will retrieve your relevant past articles "
    "and write a new draft that builds on -- without repeating -- what you've already covered."
)


def _slug_to_url(slug: str) -> str:
    clean = re.sub(r"^\d+\.", "", slug)
    return f"{SUBSTACK_BASE_URL}/p/{clean}"


def _get_style_examples(client, perf_scores: dict, n=3) -> list[dict]:
    """Fetch top-performing articles for voice reference.

    Falls back to most recent articles if no performance data exists.
    """
    if perf_scores:
        metrics = get_latest_metrics(client)
        if metrics:
            slug_scores = sorted(
                [(m["url_slug"], perf_scores.get(m["url_slug"], 0)) for m in metrics],
                key=lambda x: -x[1],
            )
            top_slugs = [s for s, _ in slug_scores[:n]]
            results = []
            for slug in top_slugs:
                rows = (
                    client.table("articles")
                    .select("title, full_text_markdown")
                    .eq("url_slug", slug)
                    .limit(1)
                    .execute()
                ).data
                if rows:
                    results.append(rows[0])
            if results:
                return results

    # Fallback: most recent
    result = (
        client.table("articles")
        .select("title, full_text_markdown")
        .order("post_date", desc=True)
        .limit(n)
        .execute()
    )
    return result.data


def draft_article(topic: str, similar_chunks: list[dict], style_examples: list[dict],
                  mode: str, word_count: int, perf_scores: dict = None,
                  query_context: dict = None) -> str:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # Build context with performance-weighted allocation
    seen_articles = {}
    for chunk in similar_chunks:
        aid = chunk["article_id"]
        if aid not in seen_articles:
            slug = chunk["article_url_slug"]
            ps = perf_scores.get(slug, 0.0) if perf_scores else 0.0
            tier = get_performance_tier(ps) if perf_scores else "mid"
            # Allocate more excerpts to top performers
            max_excerpts = {"top": 4, "mid": 2, "low": 1}.get(tier, 2)
            seen_articles[aid] = {
                "title": chunk["article_title"],
                "slug": slug,
                "url": _slug_to_url(slug),
                "excerpts": [],
                "max_excerpts": max_excerpts,
                "tier": tier,
                "score": ps,
            }
        info = seen_articles[aid]
        if len(info["excerpts"]) < info["max_excerpts"]:
            info["excerpts"].append(chunk["chunk_text"][:600])

    past_context = []
    for info in seen_articles.values():
        excerpts = "\n\n".join(info["excerpts"])
        perf_label = ""
        if perf_scores:
            perf_label = f" [{'TOP PERFORMER' if info['tier'] == 'top' else info['tier']}]"
        past_context.append(
            f'Article: "{info["title"]}"{perf_label} ({info["url"]})\n{excerpts}'
        )

    # GSC query context
    query_block = ""
    if query_context:
        all_queries = []
        for slug, queries in query_context.items():
            all_queries.extend(queries)
        if all_queries:
            unique_queries = list(dict.fromkeys(all_queries))[:15]
            query_block = (
                "\n\nPROVEN SEARCH QUERIES (these drive real traffic to related articles -- "
                "weave these angles/keywords naturally into the draft):\n"
                + ", ".join(f'"{q}"' for q in unique_queries)
            )

    # Style examples
    style_block = ""
    if style_examples:
        samples = []
        for ex in style_examples:
            samples.append(f"### {ex['title']}\n{ex['full_text_markdown'][:800]}")
        style_block = "\n\n".join(samples)

    if mode == "Full draft":
        instruction = (
            f"Write a complete Growth Memo newsletter article of approximately {word_count} words on this topic. "
            "Include a compelling intro, structured body with subheadings, and a clear takeaway at the end. "
            "Naturally weave in 2-3 internal links to the related past articles listed above where relevant."
        )
    elif mode == "Outline":
        instruction = (
            "Write a detailed outline for a Growth Memo article on this topic. "
            "Include: working title, angle/hook, 4-6 section headings with 2-3 bullet points each, "
            "and a note on what differentiates this from past coverage."
        )
    else:  # Angle suggestions
        instruction = (
            "Suggest 5 distinct angles or hooks for a Growth Memo article on this topic. "
            "For each angle: give a working title, a 2-sentence pitch, and explain how it differs from or builds on past coverage."
        )

    perf_instruction = ""
    if perf_scores:
        perf_instruction = (
            "\nArticles marked TOP PERFORMER have proven audience resonance. "
            "Prioritize their structure, framing, and angles as inspiration.\n"
        )

    prompt = f"""You are a writing assistant for Kevin Indig, author of the "Growth Memo" newsletter about SEO, organic growth, and digital marketing.

Kevin's writing style (top-performing articles for reference):
{style_block}

RELATED PAST ARTICLES (use these as context -- build on them, don't repeat them):
{chr(10).join(past_context)}{query_block}
{perf_instruction}
TOPIC / INPUT FROM KEVIN:
{topic}

TASK:
{instruction}

Important: Match Kevin's voice closely -- direct, analytical, data-informed, practitioner-focused. Avoid generic SEO advice."""

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


# UI
client = get_client()
perf_scores = get_performance_scores(client)

col1, col2 = st.columns([3, 1])
with col1:
    topic = st.text_area(
        "Topic, angle, or draft outline",
        placeholder="e.g. 'How AI Overviews are changing the ROI calculation for informational SEO content' or paste a rough outline...",
        height=150,
    )
with col2:
    mode = st.radio("Output mode", ["Full draft", "Outline", "Angle suggestions"])
    word_count = 800
    if mode == "Full draft":
        word_count = st.slider("Target word count", 400, 1600, 800, 100)
    similarity_threshold = st.slider("Context sensitivity", 0.3, 0.8, 0.45, 0.05,
                                     help="Lower = pulls in more loosely related past articles")

if st.button("Generate", disabled=not topic.strip()):
    with st.spinner("Finding relevant past articles..."):
        similar = find_similar_chunks(
            client, topic,
            match_count=20,
            similarity_threshold=similarity_threshold,
            perf_scores=perf_scores,
        )
        style_examples = _get_style_examples(client, perf_scores, n=3)

    if not similar:
        st.warning("No closely related past articles found. Try lowering Context sensitivity.")
        st.stop()

    # Collect slugs for GSC query injection
    seen_slugs = list({c["article_url_slug"] for c in similar})
    query_context = get_top_queries_for_slugs(client, seen_slugs, n=5) if perf_scores else {}

    # Show which past articles are being used as context
    seen = {}
    for chunk in similar:
        aid = chunk["article_id"]
        if aid not in seen:
            seen[aid] = {"title": chunk["article_title"], "url": _slug_to_url(chunk["article_url_slug"])}

    with st.expander(f"Context: {len(seen)} past articles retrieved"):
        for info in seen.values():
            st.markdown(f"- [{info['title']}]({info['url']})")

    with st.spinner(f"Claude is writing your {mode.lower()}..."):
        result = draft_article(topic, similar, style_examples, mode, word_count,
                               perf_scores=perf_scores, query_context=query_context)

    st.subheader(mode)
    st.markdown(result)

    # Copy-friendly text area
    with st.expander("Plain text (copy-friendly)"):
        st.text_area("", value=result, height=400, label_visibility="collapsed")
