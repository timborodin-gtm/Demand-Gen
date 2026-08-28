import streamlit as st

from auth import require_auth
from db.client import get_client, match_chunks
from ingestion.embed import embed_single
from glossary_core import build_glossary_entry, slug_to_url

st.set_page_config(page_title="Glossary Builder", layout="wide")
require_auth()
st.title("Glossary Builder")
st.caption(
    "Enter a term or concept. The app finds every Growth Memo where you've referenced it "
    "and writes a glossary entry in your voice."
)

# ── UI ──────────────────────────────────────────────────────────────────────

db = get_client()

col1, col2 = st.columns([3, 1])
with col1:
    term = st.text_input(
        "Term or concept",
        placeholder="e.g. zero-click, AEO, content velocity, topical authority…",
    )
with col2:
    match_count = st.slider("Max articles to search", 5, 30, 15)
    threshold = st.slider(
        "Relevance threshold", 0.3, 0.8, 0.45, 0.05,
        help="Higher = stricter match. Lower = casts a wider net."
    )

with st.expander("Editorial direction (optional)"):
    angle = st.text_input(
        "Angle / point of view",
        placeholder="e.g. frame this for B2B SaaS teams measuring AI visibility",
        help="Steers the entry toward a specific POV. Leave blank to let the "
             "articles drive it.",
    )
    notes = st.text_area(
        "Notes for the writer",
        placeholder="Anything the draft should account for…",
        height=80,
    )
    links_raw = st.text_input(
        "Known source links",
        placeholder="URLs where this term is already discussed (space-separated)",
        help="Dropped into the prompt so the entry can weave them in where they fit.",
    )

source_links = [u.strip() for u in links_raw.split() if u.strip()] if links_raw else []

if st.button("Build glossary entry", disabled=not term.strip()):
    with st.spinner(f"Searching {match_count} most relevant Growth Memo passages…"):
        embedding = embed_single(term)
        chunks = match_chunks(
            db,
            query_embedding=embedding,
            match_count=match_count,
            similarity_threshold=threshold,
        )

    if not chunks:
        st.warning(
            "No relevant passages found. Try lowering the relevance threshold, "
            "or check that the term appears in your Growth Memos."
        )
        st.stop()

    # Show which articles were pulled
    seen = {}
    for c in chunks:
        aid = c["article_id"]
        if aid not in seen:
            seen[aid] = {"title": c["article_title"], "url": slug_to_url(c["article_url_slug"])}

    with st.expander(f"Found {len(seen)} relevant articles ({len(chunks)} passages)"):
        for info in seen.values():
            st.markdown(f"- [{info['title']}]({info['url']})")

    with st.spinner("Writing glossary entry…"):
        entry = build_glossary_entry(
            term, chunks, angle=angle, notes=notes, source_links=source_links
        )

    st.divider()
    st.markdown(entry)

    with st.expander("Copy-friendly markdown"):
        st.text_area("", value=entry, height=350, label_visibility="collapsed")
