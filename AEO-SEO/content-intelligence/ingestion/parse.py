import csv
import io
import zipfile
from pathlib import Path

from bs4 import BeautifulSoup
from markdownify import markdownify as md

from config import MIN_ARTICLE_BYTES


def extract_zip(zip_path: str) -> dict:
    """Extract a Substack export ZIP and return {filename: content} for HTML files and posts.csv."""
    files = {}
    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            if name.endswith(".html") or name == "posts.csv":
                files[name] = zf.read(name).decode("utf-8", errors="replace")
    return files


def parse_csv_metadata(csv_text: str) -> dict:
    """Parse posts.csv into a dict keyed by post slug/filename."""
    reader = csv.DictReader(io.StringIO(csv_text))
    metadata = {}
    for row in reader:
        # The CSV typically has a 'post_id' or slug-based identifier
        # Map by the slug derived from the URL or filename
        url = row.get("post_url", "") or row.get("url", "")
        slug = url.rstrip("/").split("/")[-1] if url else ""
        if slug:
            metadata[slug] = row
        # Also try mapping by post_id if available
        pid = row.get("post_id", "")
        if pid:
            metadata[f"id_{pid}"] = row
    return metadata


def html_to_markdown(html_content: str) -> str:
    """Convert HTML to clean markdown."""
    soup = BeautifulSoup(html_content, "html.parser")
    # Remove script/style tags
    for tag in soup(["script", "style"]):
        tag.decompose()
    return md(str(soup), heading_style="ATX", strip=["img"]).strip()


def extract_title_from_html(html_content: str) -> str:
    """Pull a clean title from the article HTML, preferring <h1> over <title>.

    Substack exports often lack a <title> with the post name, so try the first
    <h1> (usually the post heading) before falling back to <title>.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    h1 = soup.find("h1")
    if h1 and h1.get_text(strip=True):
        return h1.get_text(strip=True)
    title_tag = soup.find("title")
    if title_tag and title_tag.get_text(strip=True):
        return title_tag.get_text(strip=True)
    return ""


def parse_substack_export(zip_path: str) -> list[dict]:
    """Parse a Substack ZIP export into a list of article dicts.

    Returns list of dicts with keys:
        post_id, title, subtitle, post_date, type, audience,
        url_slug, full_text_markdown, word_count
    """
    files = extract_zip(zip_path)
    csv_text = files.get("posts.csv", "")
    metadata_map = parse_csv_metadata(csv_text) if csv_text else {}

    articles = []
    for filename, content in files.items():
        if not filename.endswith(".html"):
            continue

        # Skip tiny files
        if len(content.encode("utf-8")) < MIN_ARTICLE_BYTES:
            continue

        markdown = html_to_markdown(content)
        if not markdown or len(markdown.strip()) < 50:
            continue

        # Derive slug from filename (e.g., "posts/my-article.html" -> "my-article")
        slug = Path(filename).stem

        # Look up metadata
        meta = metadata_map.get(slug, {})
        if not meta:
            # Try without path prefix
            bare_slug = filename.replace("posts/", "").replace(".html", "")
            meta = metadata_map.get(bare_slug, {})

        # Title source order: CSV metadata → HTML <h1>/<title> → titleized slug.
        # The titleized-slug fallback produces garbage like "Googles Ai Mode Seo
        # Impact Ai Mode", so we try HTML extraction first.
        title = meta.get("title", "").strip()
        if not title:
            title = extract_title_from_html(content)
        if not title:
            title = slug.replace("-", " ").title()
        word_count = len(markdown.split())

        article = {
            "post_id": meta.get("post_id", slug),
            "title": title,
            "subtitle": meta.get("subtitle", ""),
            "post_date": meta.get("post_date") or meta.get("published_at") or None,
            "type": meta.get("type", "newsletter"),
            "audience": meta.get("audience", "everyone"),
            "url_slug": slug,
            "full_text_markdown": markdown,
            "word_count": word_count,
        }
        articles.append(article)

    # Sort by date if available
    articles.sort(key=lambda a: a.get("post_date") or "", reverse=True)
    return articles
