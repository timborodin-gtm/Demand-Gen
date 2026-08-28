import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px

import anthropic

from db.client import (
    get_client, get_all_articles, get_all_chunk_embeddings,
    upsert_gap_feedback, get_all_gap_feedback, get_latest_metrics,
    get_demand_gap_queries,
)
from analysis.clustering import (
    compute_article_embeddings,
    cluster_articles,
    compute_tsne,
    label_clusters_with_claude,
)
from analysis.performance import get_performance_scores
from config import DEFAULT_CLUSTER_COUNT, ANTHROPIC_API_KEY, CLAUDE_MODEL

from auth import require_auth

st.set_page_config(page_title="Content Gap Analysis", layout="wide")
require_auth()
st.title("Content Gap Analysis")

client = get_client()

n_clusters = st.slider("Number of clusters", min_value=5, max_value=30, value=DEFAULT_CLUSTER_COUNT)

if st.button("Run Analysis"):
    with st.spinner("Loading articles and embeddings..."):
        articles = get_all_articles(client)
        articles_map = {a["id"]: a for a in articles}
        raw_chunks = get_all_chunk_embeddings(client)

    if not raw_chunks:
        st.warning("No chunk embeddings found. Run ingestion first.")
        st.stop()

    with st.spinner("Computing article-level embeddings..."):
        article_embeddings = compute_article_embeddings(raw_chunks)

    with st.spinner(f"Clustering into {n_clusters} groups..."):
        labels, centroids, article_ids = cluster_articles(article_embeddings, n_clusters)

    with st.spinner("Computing t-SNE projection..."):
        tsne_coords = compute_tsne(article_embeddings, article_ids)

    # Build cluster -> titles mapping
    cluster_titles = {}
    for aid, cluster_id in labels.items():
        title = articles_map.get(aid, {}).get("title", f"Article {aid}")
        cluster_titles.setdefault(cluster_id, []).append(title)

    # Build cluster performance stats
    perf_scores = get_performance_scores(client)
    cluster_perf = None
    if perf_scores:
        cluster_perf = {}
        metrics = get_latest_metrics(client)
        metrics_map = {m["url_slug"]: m for m in metrics} if metrics else {}

        for cid, titles in cluster_titles.items():
            cluster_slugs = []
            for aid, c in labels.items():
                if c == cid:
                    slug = articles_map.get(aid, {}).get("url_slug", "")
                    if slug:
                        cluster_slugs.append(slug)

            total_clicks = 0
            total_ctr = []
            top_article = ""
            top_clicks = 0
            for slug in cluster_slugs:
                m = metrics_map.get(slug)
                if m:
                    total_clicks += m.get("clicks", 0) or 0
                    if m.get("ctr"):
                        total_ctr.append(m["ctr"])
                    if (m.get("clicks", 0) or 0) > top_clicks:
                        top_clicks = m.get("clicks", 0) or 0
                        for a in articles:
                            if a.get("url_slug") == slug:
                                top_article = a["title"]
                                break

            cluster_perf[cid] = {
                "total_clicks": total_clicks,
                "avg_ctr": sum(total_ctr) / len(total_ctr) if total_ctr else 0,
                "top_article": top_article or "N/A",
            }

    with st.spinner("Claude is labeling clusters and finding gaps..."):
        feedback = get_all_gap_feedback(client)
        cluster_info = label_clusters_with_claude(cluster_titles, feedback=feedback,
                                                  cluster_perf=cluster_perf)

    # Store results in session state so feedback buttons work without re-running
    st.session_state["cluster_info"] = cluster_info
    st.session_state["cluster_titles"] = cluster_titles
    st.session_state["cluster_perf"] = cluster_perf
    st.session_state["scatter_data"] = []
    for i, aid in enumerate(article_ids):
        cluster_id = labels[aid]
        info = cluster_info.get(cluster_id, {"label": f"Topic {cluster_id}"})
        st.session_state["scatter_data"].append({
            "x": tsne_coords[i, 0],
            "y": tsne_coords[i, 1],
            "cluster": f"{cluster_id}: {info['label']}",
            "title": articles_map.get(aid, {}).get("title", f"Article {aid}"),
        })

# Render results from session state
if "cluster_info" in st.session_state:
    cluster_info = st.session_state["cluster_info"]
    cluster_titles = st.session_state["cluster_titles"]
    cluster_perf = st.session_state.get("cluster_perf")
    scatter_df = pd.DataFrame(st.session_state["scatter_data"])

    # t-SNE scatter plot
    st.subheader("Topic Clusters")
    st.caption(
        "Each dot is one article. Position is determined by t-SNE, which projects "
        "high-dimensional embeddings into 2D -- articles that are semantically similar "
        "appear close together. Colors represent KMeans clusters (groups of related articles). "
        "Tight clusters = well-covered topics. Scattered dots = unique or cross-topic articles. "
        "Hover over any dot to see the article title."
    )
    fig = px.scatter(
        scatter_df, x="x", y="y", color="cluster",
        hover_data=["title"],
        title="Article Clusters (t-SNE projection)",
        height=600,
    )
    fig.update_layout(xaxis_title="", yaxis_title="")
    fig.update_traces(marker=dict(size=6, opacity=0.7))
    st.plotly_chart(fig, use_container_width=True)

    # Gap suggestions with feedback buttons
    st.subheader("Content Gaps by Cluster")
    st.caption("Rate each suggestion so future analyses learn your preferences.")

    for cid in sorted(cluster_info.keys()):
        info = cluster_info[cid]
        count = len(cluster_titles.get(cid, []))
        label = info["label"]

        if not info.get("gaps"):
            continue

        # Performance badge
        perf_badge = ""
        if cluster_perf and cid in cluster_perf:
            clicks = cluster_perf[cid]["total_clicks"]
            if clicks > 0:
                perf_badge = f" [{clicks:,} clicks/wk]"

        st.markdown(f"**Cluster {cid}: {label}** ({count} articles){perf_badge}")
        for gap_idx, gap in enumerate(info["gaps"]):
            col_text, col_up, col_down = st.columns([8, 1, 1])
            with col_text:
                st.write(f"* {gap}")
            with col_up:
                if st.button("\U0001f44d", key=f"up_{cid}_{gap_idx}", help="I like this suggestion"):
                    upsert_gap_feedback(client, f"{cid}: {label}", gap, "up")
                    st.toast(f'Saved: liked "{gap[:40]}..."')
            with col_down:
                if st.button("\U0001f44e", key=f"down_{cid}_{gap_idx}", help="Not useful"):
                    upsert_gap_feedback(client, f"{cid}: {label}", gap, "down")
                    st.toast(f'Saved: disliked "{gap[:40]}..."')

    # Feedback stats
    all_feedback = get_all_gap_feedback(client)
    if all_feedback:
        up_count = sum(1 for f in all_feedback if f["rating"] == "up")
        down_count = sum(1 for f in all_feedback if f["rating"] == "down")
        st.caption(f"Feedback so far: {up_count} liked, {down_count} disliked. This shapes future suggestions.")

    # Cluster detail expanders
    st.subheader("Cluster Details")
    for cid in sorted(cluster_info.keys()):
        info = cluster_info[cid]
        titles = cluster_titles.get(cid, [])
        perf_badge = ""
        if cluster_perf and cid in cluster_perf:
            clicks = cluster_perf[cid]["total_clicks"]
            if clicks > 0:
                perf_badge = f" [{clicks:,} clicks/wk]"
        with st.expander(f"Cluster {cid}: {info['label']} ({len(titles)} articles){perf_badge}"):
            st.write("**Articles:**")
            for t in titles:
                st.write(f"- {t}")
            if info.get("gaps"):
                st.write("**Suggested gaps:**")
                for g in info["gaps"]:
                    st.write(f"- {g}")

    # Search Demand Gaps
    st.subheader("Search Demand Gaps")
    st.caption(
        "High-impression queries where you are not ranking well. "
        "These represent real search demand you could capture with new or improved content."
    )

    gap_col1, gap_col2 = st.columns(2)
    with gap_col1:
        min_impr = st.number_input("Min impressions", value=100, step=50, key="gap_min_impr")
    with gap_col2:
        min_pos = st.number_input("Min avg position (lower rank)", value=20.0, step=5.0, key="gap_min_pos")

    demand_gaps = get_demand_gap_queries(client, min_impressions=int(min_impr), min_position=float(min_pos))

    if not demand_gaps:
        st.info("No demand gap queries found. Run analytics ingestion first, or adjust the filters.")
    else:
        gap_df = pd.DataFrame(demand_gaps)
        st.write(f"**{len(gap_df)}** untapped queries found")
        st.dataframe(
            gap_df[["query", "impressions", "clicks", "ctr", "avg_position", "url_slug"]].reset_index(drop=True),
            use_container_width=True,
            height=300,
        )

        # Claude-powered theme grouping
        if st.button("Group into themes with Claude"):
            with st.spinner("Claude is analyzing query themes..."):
                query_list = gap_df["query"].tolist()[:100]
                ai_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
                theme_prompt = (
                    "You are analyzing search queries that a newsletter about SEO and organic growth "
                    "is getting impressions for but NOT ranking well.\n\n"
                    "Group these queries into 5-10 thematic clusters and for each cluster suggest "
                    "a specific article idea that would capture this search demand.\n\n"
                    "QUERIES:\n"
                    + "\n".join(f"- {q}" for q in query_list)
                    + "\n\nFormat your response as:\n"
                    "THEME: [theme name]\n"
                    "Queries: [list the queries that belong here]\n"
                    "Article idea: [specific article title and 1-sentence pitch]\n"
                    "Estimated demand: [total impressions from these queries]\n\n"
                    "Sort themes by estimated demand (highest first)."
                )

                response = ai_client.messages.create(
                    model=CLAUDE_MODEL,
                    max_tokens=2000,
                    messages=[{"role": "user", "content": theme_prompt}],
                )
                st.markdown(response.content[0].text)
