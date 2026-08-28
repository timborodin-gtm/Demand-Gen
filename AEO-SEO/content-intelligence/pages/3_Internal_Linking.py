import re

import streamlit as st

from db.client import get_client, get_all_articles, get_article_by_id
from analysis.linking import find_similar_chunks, suggest_internal_links
from analysis.performance import get_performance_scores
from config import DEFAULT_SIMILAR_CHUNKS, DEFAULT_LINK_SUGGESTIONS, SUBSTACK_BASE_URL
from auth import require_auth


def _slug_to_url(slug: str) -> str:
    clean = re.sub(r"^\d+\.", "", slug)
    return f"{SUBSTACK_BASE_URL}/p/{clean}"

st.set_page_config(page_title="Internal Linking", layout="wide")
require_auth()
st.title("Internal Linking Suggestions")

client = get_client()

mode = st.radio("Input mode", ["Select existing article", "Paste a draft"])

# Settings
col1, col2, col3 = st.columns(3)
with col1:
    similarity_threshold = st.slider("Similarity threshold", 0.3, 0.9, 0.5, 0.05)
with col2:
    match_count = st.slider("Similar chunks to retrieve", 5, 30, DEFAULT_SIMILAR_CHUNKS)
with col3:
    use_performance = st.toggle("Weight by performance", value=True,
                                help="Boost suggestions from high-traffic articles")

source_title = ""
source_text = ""
exclude_id = None

if mode == "Select existing article":
    articles = get_all_articles(client)
    if not articles:
        st.warning("No articles found. Run ingestion first.")
        st.stop()

    selected = st.selectbox(
        "Choose an article",
        options=articles,
        format_func=lambda x: x["title"],
    )

    if selected and st.button("Find linking opportunities"):
        full = get_article_by_id(client, selected["id"])
        source_title = full["title"]
        source_text = full["full_text_markdown"]
        exclude_id = full["id"]

else:
    source_title = st.text_input("Draft title")
    source_text = st.text_area("Paste your draft text", height=300)
    if source_title and source_text and st.button("Find linking opportunities"):
        pass  # Will proceed below

if source_title and source_text:
    perf_scores = get_performance_scores(client) if use_performance else {}

    with st.spinner("Finding similar content..."):
        similar = find_similar_chunks(
            client, source_text,
            match_count=match_count,
            similarity_threshold=similarity_threshold,
            exclude_article_id=exclude_id,
            perf_scores=perf_scores,
        )

    if not similar:
        st.warning("No similar content found. Try lowering the similarity threshold.")
        st.stop()

    st.subheader(f"Found {len(similar)} similar chunks")

    # Show similar articles found
    seen_articles = {}
    for chunk in similar:
        aid = chunk["article_id"]
        if aid not in seen_articles:
            seen_articles[aid] = {
                "title": chunk["article_title"],
                "slug": chunk["article_url_slug"],
                "max_similarity": chunk["similarity"],
            }
        else:
            seen_articles[aid]["max_similarity"] = max(
                seen_articles[aid]["max_similarity"], chunk["similarity"]
            )

    with st.expander("Similar articles found"):
        for info in sorted(seen_articles.values(), key=lambda x: -x["max_similarity"]):
            url = _slug_to_url(info["slug"])
            st.markdown(f"- [{info['title']}]({url}) (similarity: {info['max_similarity']:.3f})")

    with st.spinner("Claude is generating linking suggestions..."):
        suggestions = suggest_internal_links(
            source_title, source_text, similar,
            max_suggestions=DEFAULT_LINK_SUGGESTIONS,
            perf_scores=perf_scores,
        )

    st.subheader("Linking Suggestions")
    st.markdown(suggestions)
