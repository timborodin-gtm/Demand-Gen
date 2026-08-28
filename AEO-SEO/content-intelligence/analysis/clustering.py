import json

import numpy as np
from sklearn.cluster import KMeans
from sklearn.manifold import TSNE
import anthropic

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL


def _parse_embedding(emb) -> np.ndarray:
    """Parse an embedding that may be a string, list, or numpy array."""
    if isinstance(emb, np.ndarray):
        return emb
    if isinstance(emb, str):
        return np.array(json.loads(emb), dtype=np.float64)
    return np.array(emb, dtype=np.float64)


def compute_article_embeddings(chunks: list[dict]) -> dict:
    """Compute mean embeddings per article from chunk embeddings.

    Returns {article_id: {"embedding": np.array, "chunks": [...]}}
    """
    article_map = {}
    for chunk in chunks:
        aid = chunk["article_id"]
        if aid not in article_map:
            article_map[aid] = {"embeddings": [], "chunks": []}
        article_map[aid]["embeddings"].append(_parse_embedding(chunk["embedding"]))
        article_map[aid]["chunks"].append(chunk)

    result = {}
    for aid, data in article_map.items():
        mean_emb = np.mean(data["embeddings"], axis=0)
        result[aid] = {"embedding": mean_emb, "chunks": data["chunks"]}
    return result


def cluster_articles(article_embeddings: dict, n_clusters: int = 15):
    """KMeans clustering on article-level mean embeddings.

    Returns:
        labels: dict {article_id: cluster_label}
        centroids: np.array of cluster centers
        article_ids: list of article_ids in order
    """
    article_ids = list(article_embeddings.keys())
    X = np.array([article_embeddings[aid]["embedding"] for aid in article_ids])

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    kmeans.fit(X)

    labels = {aid: int(label) for aid, label in zip(article_ids, kmeans.labels_)}
    return labels, kmeans.cluster_centers_, article_ids


def compute_tsne(article_embeddings: dict, article_ids: list) -> np.ndarray:
    """Compute 2D t-SNE projection for visualization."""
    X = np.array([article_embeddings[aid]["embedding"] for aid in article_ids])
    perplexity = min(30, len(article_ids) - 1)
    tsne = TSNE(n_components=2, random_state=42, perplexity=perplexity)
    return tsne.fit_transform(X)


def label_clusters_with_claude(clusters: dict, feedback: list[dict] = None,
                               cluster_perf: dict = None) -> dict:
    """Use Claude to label each cluster and suggest content gaps.

    Args:
        clusters: {cluster_id: [list of article titles]}
        feedback: list of dicts with cluster_label, suggestion, rating ('up'/'down')
        cluster_perf: {cluster_id: {"total_clicks": int, "avg_ctr": float, "top_article": str}}

    Returns:
        {cluster_id: {"label": str, "gaps": [str]}}
    """
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    cluster_descriptions = []
    for cid, titles in sorted(clusters.items()):
        titles_str = "\n".join(f"  - {t}" for t in titles[:20])
        perf_line = ""
        if cluster_perf and cid in cluster_perf:
            p = cluster_perf[cid]
            perf_line = (
                f"\n  Performance: {p['total_clicks']} clicks/wk, "
                f"avg CTR {p['avg_ctr']:.1%}, "
                f"top article: \"{p['top_article']}\""
            )
        cluster_descriptions.append(
            f"Cluster {cid} ({len(titles)} articles):{perf_line}\n{titles_str}"
        )

    feedback_block = ""
    if feedback:
        liked = [f"  - [{f['cluster_label']}] {f['suggestion']}" for f in feedback if f["rating"] == "up"]
        disliked = [f"  - [{f['cluster_label']}] {f['suggestion']}" for f in feedback if f["rating"] == "down"]
        if liked or disliked:
            feedback_block = "\nIMPORTANT — The user has rated previous suggestions. Use this to calibrate your style and specificity.\n"
            if liked:
                feedback_block += "Suggestions the user LIKED (suggest more like these):\n" + "\n".join(liked) + "\n"
            if disliked:
                feedback_block += "Suggestions the user DISLIKED (avoid this style/type):\n" + "\n".join(disliked) + "\n"

    perf_instruction = ""
    if cluster_perf:
        perf_instruction = (
            "\nEach cluster includes traffic performance data. "
            "Prioritize gap suggestions for high-traffic clusters since those represent "
            "proven topic areas with audience demand. For lower-traffic clusters, suggest gaps "
            "only if the topic has clear growth potential.\n"
        )

    prompt = f"""You are analyzing topic clusters from a newsletter called "Growth Memo" about SEO, organic growth, and digital marketing.
{feedback_block}{perf_instruction}
Below are article clusters with their titles. For each cluster:
1. Give a short topic label (2-4 words)
2. Suggest 2-3 specific subtopics NOT yet covered that would be valuable additions

Format your response as one block per cluster:
CLUSTER [number]
Label: [topic label]
Gaps:
- [gap 1]
- [gap 2]
- [gap 3]

{chr(10).join(cluster_descriptions)}"""

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    return _parse_cluster_response(response.content[0].text, list(clusters.keys()))


def _parse_cluster_response(text: str, cluster_ids: list) -> dict:
    """Parse Claude's cluster labeling response."""
    results = {}
    current_id = None

    for line in text.split("\n"):
        line = line.strip()
        if line.startswith("CLUSTER"):
            try:
                current_id = int(line.split()[-1])
            except (ValueError, IndexError):
                continue
        elif line.startswith("Label:") and current_id is not None:
            results.setdefault(current_id, {"label": "", "gaps": []})
            results[current_id]["label"] = line.replace("Label:", "").strip()
        elif line.startswith("- ") and current_id is not None:
            results.setdefault(current_id, {"label": "", "gaps": []})
            results[current_id]["gaps"].append(line[2:].strip())

    # Fill in any missing clusters
    for cid in cluster_ids:
        if cid not in results:
            results[cid] = {"label": f"Topic {cid}", "gaps": []}

    return results
