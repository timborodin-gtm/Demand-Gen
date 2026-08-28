import re

import anthropic

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL, DEFAULT_LINK_SUGGESTIONS, SUBSTACK_BASE_URL
from db.client import match_chunks
from ingestion.embed import embed_single
from analysis.performance import rerank_chunks_by_performance, get_performance_tier


def _slug_to_url(slug: str) -> str:
    """Convert a stored slug (possibly with numeric prefix) to a full URL."""
    clean = re.sub(r"^\d+\.", "", slug)
    return f"{SUBSTACK_BASE_URL}/p/{clean}"


def _clean_slug(slug: str) -> str:
    return re.sub(r"^\d+\.", "", slug or "")


def _extract_linked_slugs(text: str) -> set[str]:
    """Extract /p/<slug> values from markdown links in text, regardless of domain."""
    slugs = set()
    for url in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text or ""):
        m = re.search(r"/p/([^/?#)]+)", url)
        if m:
            slugs.add(m.group(1))
    return slugs


def _normalize_for_match(text: str) -> str:
    """Strip light markdown so anchor-quote matching survives bold/italic/links."""
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text or "")
    text = re.sub(r"[*_`]+", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def _validate_anchors(suggestions_md: str, source_text: str) -> str:
    """Annotate suggestion blocks whose anchor text doesn't appear in source."""
    source_normalized = _normalize_for_match(source_text)

    sections = re.split(r"(?m)^(?=### Link)", suggestions_md)
    out = []
    for section in sections:
        if not section.startswith("### Link"):
            out.append(section)
            continue
        anchor_match = re.search(r'\*\*Anchor text:\*\*\s*"([^"]+)"', section)
        if anchor_match:
            anchor_normalized = _normalize_for_match(anchor_match.group(1))
            if anchor_normalized and anchor_normalized not in source_normalized:
                section = section.rstrip() + (
                    "\n\n> **Warning:** Anchor not found verbatim in source. "
                    "Claude may have paraphrased — search your draft for a close match.\n"
                )
        out.append(section)
    return "".join(out)


def find_similar_chunks(client, text: str, match_count: int = 15,
                        similarity_threshold: float = 0.5,
                        exclude_article_id: int = None,
                        perf_scores: dict[str, float] = None) -> list[dict]:
    """Embed input text and find similar chunks via pgvector.

    When perf_scores is provided, results are reranked so chunks from
    high-performing articles surface first.
    """
    embedding = embed_single(text)
    chunks = match_chunks(
        client, embedding,
        match_count=match_count,
        similarity_threshold=similarity_threshold,
        exclude_article_id=exclude_article_id,
    )
    if perf_scores:
        chunks = rerank_chunks_by_performance(chunks, perf_scores)
    return chunks


def suggest_internal_links(source_title: str, source_text: str,
                           similar_chunks: list[dict],
                           max_suggestions: int = DEFAULT_LINK_SUGGESTIONS,
                           perf_scores: dict[str, float] = None) -> str:
    """Use Claude to suggest specific internal links with anchor text."""
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # Skip destinations the source already links to.
    already_linked_slugs = _extract_linked_slugs(source_text)

    # Keep only the best chunk per destination article so Claude can't
    # suggest the same link twice. similar_chunks is already ordered by
    # relevance (and reranked by performance when applicable), so the
    # first occurrence of each article_id is the one to keep.
    deduped_chunks = []
    seen_article_ids = set()
    for chunk in similar_chunks:
        if _clean_slug(chunk.get("article_url_slug", "")) in already_linked_slugs:
            continue
        aid = chunk.get("article_id")
        if aid in seen_article_ids:
            continue
        seen_article_ids.add(aid)
        deduped_chunks.append(chunk)

    if not deduped_chunks:
        return "_No new linking opportunities — every similar article is already linked from the source._"

    chunks_context = []
    for i, chunk in enumerate(deduped_chunks):
        url = _slug_to_url(chunk["article_url_slug"])
        perf_line = ""
        if perf_scores:
            slug = chunk.get("article_url_slug", "")
            ps = perf_scores.get(slug, 0.0)
            tier = get_performance_tier(ps)
            perf_line = f"\nPerformance: {tier} performer (score: {ps:.2f})"
        chunks_context.append(
            f"[{i+1}] Article: \"{chunk['article_title']}\" "
            f"(URL: {url})\n"
            f"Section: {chunk.get('heading', 'N/A')}\n"
            f"Content: {chunk['chunk_text'][:500]}\n"
            f"Similarity: {chunk['similarity']:.3f}{perf_line}"
        )

    perf_instruction = ""
    if perf_scores:
        perf_instruction = (
            "\nWhen choosing which articles to link to, prefer top-performing articles "
            "as they have proven audience engagement. Only link to lower-performing "
            "articles when the semantic relevance is very strong.\n"
        )

    prompt = f"""You are an internal linking specialist for the "Growth Memo" newsletter about SEO, organic growth, and digital marketing.
{perf_instruction}
SOURCE ARTICLE: "{source_title}"
{source_text[:2000]}

SIMILAR CONTENT FROM OTHER ARTICLES:
{chr(10).join(chunks_context)}

Suggest up to {max_suggestions} specific internal links to add to the source article. For each suggestion:
1. Quote the exact phrase in the source article that should become the anchor text
2. Specify which article to link to with its full URL
3. Explain why this link adds value for the reader

IMPORTANT: Each suggestion must link to a different destination article. Never suggest two links to the same URL. If you cannot find {max_suggestions} distinct destinations worth linking to, return fewer suggestions rather than repeating a destination.

Format each suggestion in markdown:
### Link [number]
**Anchor text:** "[exact phrase from source]"
**Link to:** [article title](full URL)
**Reason:** [brief explanation]
"""

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    return _validate_anchors(response.content[0].text, source_text)
